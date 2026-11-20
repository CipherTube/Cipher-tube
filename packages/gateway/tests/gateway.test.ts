import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { MemorySessionStore } from "../src/store";
import { WriteAheadLog, hashEntry, GENESIS } from "../src/wal";
import { SessionService, sealPayload, openPayload, deriveOwnerKey, JsonLineAuditSink } from "../src/sessionService";
import { authenticate, loadTokens, createServer } from "../src/server";
import { encodeCommand, parseReply } from "../src/redisAdapter";

const KEY = crypto.randomBytes(32);
const tmpWal = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ctgw-")), "wal.jsonl");
const sink = () => new JsonLineAuditSink(() => {});

describe("WAL", () => {
  it("chains entries and survives a reload", () => {
    const f = tmpWal();
    const w1 = new WriteAheadLog(f);
    w1.append({ op: "CREATE", sessionId: "a", ownerId: "u1", blobSha256: "x".repeat(64), ttlSeconds: 60, expiresAtMs: Date.now() + 60000 });
    w1.append({ op: "EXTEND", sessionId: "a", ownerId: "u1", blobSha256: "x".repeat(64), ttlSeconds: 120, expiresAtMs: Date.now() + 120000 });
    const w2 = new WriteAheadLog(f);
    const { entries, corrupt } = w2.read();
    expect(corrupt).toHaveLength(0);
    expect(entries).toHaveLength(2);
    expect(entries[0].prevHash).toBe(GENESIS);
    expect(entries[1].prevHash).toBe(entries[0].hash);
  });

  it("detects an edited entry", () => {
    const f = tmpWal();
    new WriteAheadLog(f).append({ op: "CREATE", sessionId: "a", ownerId: "u1", blobSha256: "x".repeat(64), ttlSeconds: 60, expiresAtMs: Date.now() + 60000 });
    const lines = fs.readFileSync(f, "utf8").trim().split("\n");
    const e = JSON.parse(lines[0]);
    e.ownerId = "attacker";
    fs.writeFileSync(f, JSON.stringify(e) + "\n");
    const { corrupt } = new WriteAheadLog(f).read();
    expect(corrupt[0].reason).toMatch(/hash mismatch/);
  });

  it("detects a removed entry as a chain break", () => {
    const f = tmpWal();
    const w = new WriteAheadLog(f);
    w.append({ op: "CREATE", sessionId: "a", ownerId: "u1", blobSha256: "x".repeat(64), ttlSeconds: 60, expiresAtMs: Date.now() + 60000 });
    w.append({ op: "CREATE", sessionId: "b", ownerId: "u1", blobSha256: "x".repeat(64), ttlSeconds: 60, expiresAtMs: Date.now() + 60000 });
    const lines = fs.readFileSync(f, "utf8").trim().split("\n");
    fs.writeFileSync(f, lines[1] + "\n");
    const { corrupt } = new WriteAheadLog(f).read();
    expect(corrupt.some((c) => /chain break/.test(c.reason))).toBe(true);
  });

  it("tolerates a torn final line without losing the rest", () => {
    const f = tmpWal();
    const w = new WriteAheadLog(f);
    w.append({ op: "CREATE", sessionId: "a", ownerId: "u1", blobSha256: "x".repeat(64), ttlSeconds: 60, expiresAtMs: Date.now() + 60000 });
    fs.appendFileSync(f, '{"seq":2,"ts":"2026');
    const { entries, corrupt } = new WriteAheadLog(f).read();
    expect(entries).toHaveLength(1);
    expect(corrupt).toHaveLength(1);
  });

  it("hashEntry is stable across key order", () => {
    const base = { seq: 1, ts: "t", op: "CREATE" as const, sessionId: "a", ownerId: "u", blobSha256: "b", ttlSeconds: 1, expiresAtMs: 2, prevHash: GENESIS };
    expect(hashEntry(base)).toBe(hashEntry({ ...base }));
  });
});

describe("envelope", () => {
  it("round trips", () => {
    const k = deriveOwnerKey(KEY, "u1");
    const sealed = sealPayload(k, Buffer.from("hello"), "u1:s1");
    expect(openPayload(k, sealed, "u1:s1").toString()).toBe("hello");
  });
  it("refuses a blob moved to another session (AAD binding)", () => {
    const k = deriveOwnerKey(KEY, "u1");
    const sealed = sealPayload(k, Buffer.from("hello"), "u1:s1");
    expect(() => openPayload(k, sealed, "u1:s2")).toThrow();
  });
  it("refuses another user's key", () => {
    const sealed = sealPayload(deriveOwnerKey(KEY, "u1"), Buffer.from("hello"), "u1:s1");
    expect(() => openPayload(deriveOwnerKey(KEY, "u2"), sealed, "u1:s1")).toThrow();
  });
  it("detects a flipped ciphertext byte", () => {
    const k = deriveOwnerKey(KEY, "u1");
    const sealed = sealPayload(k, Buffer.from("hello"), "u1:s1");
    sealed[sealed.length - 1] ^= 0xff;
    expect(() => openPayload(k, sealed, "u1:s1")).toThrow();
  });
});

describe("session service", () => {
  const mk = () => new SessionService(new MemorySessionStore(), KEY, sink(), undefined, tmpWal());

  it("creates, reads and returns the payload", async () => {
    const s = mk();
    const c = await s.create("u1", { id: "s1", payload: Buffer.from("abc") });
    expect(c.ok).toBe(true);
    const r = await s.read("u1", "s1", { withPayload: true });
    expect(r.ok && r.value.payload!.toString()).toBe("abc");
  });

  it("refuses an unauthenticated caller on every operation", async () => {
    const s = mk();
    await s.create("u1", { id: "s1" });
    expect((await s.create(null, { id: "s2" })).ok).toBe(false);
    expect((await s.read(null, "s1")).ok).toBe(false);
    expect((await s.extend(null, "s1")).ok).toBe(false);
    expect((await s.destroy(null, "s1")).ok).toBe(false);
  });

  it("refuses another owner's session", async () => {
    const s = mk();
    await s.create("u1", { id: "s1", payload: Buffer.from("secret") });
    const r = await s.read("u2", "s1", { withPayload: true });
    expect(r.ok).toBe(false);
    expect((await s.destroy("u2", "s1")).ok).toBe(false);
  });

  it("create is idempotent for the same owner and refuses a cross-owner collision", async () => {
    const s = mk();
    const a = await s.create("u1", { id: "s1", payload: Buffer.from("first") });
    const b = await s.create("u1", { id: "s1", payload: Buffer.from("second") });
    expect(a.ok && b.ok && b.value.createdAt).toBe(a.ok ? a.value.createdAt : "");
    const r = await s.read("u1", "s1", { withPayload: true });
    expect(r.ok && r.value.payload!.toString()).toBe("first");
    expect((await s.create("u2", { id: "s1" })).ok).toBe(false);
  });

  it("extend can never shorten a session", async () => {
    const s = mk();
    await s.create("u1", { id: "s1", ttlSeconds: 600 });
    const r = await s.extend("u1", "s1", 60);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.ttlSeconds).toBeGreaterThanOrEqual(599);
  });

  it("clamps a requested ttl to the policy ceiling", async () => {
    const s = mk();
    const r = await s.create("u1", { id: "s1", ttlSeconds: 999999 });
    expect(r.ok && r.value.ttlSeconds).toBeLessThanOrEqual(12 * 60 * 60);
  });

  it("rejects an oversized payload", async () => {
    const s = mk();
    const r = await s.create("u1", { id: "s1", payload: Buffer.alloc(300 * 1024) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects a malformed session id", async () => {
    const s = mk();
    for (const bad of ["", "a b", "x".repeat(129), "../etc/passwd"]) {
      expect((await s.create("u1", { id: bad })).ok).toBe(false);
    }
  });

  it("destroy removes the record and the blob", async () => {
    const store = new MemorySessionStore();
    const s = new SessionService(store, KEY, sink(), undefined, tmpWal());
    await s.create("u1", { id: "s1", payload: Buffer.from("x") });
    expect((await s.destroy("u1", "s1")).ok).toBe(true);
    expect(await store.get("cta:session:s1")).toBeNull();
    expect(await store.get("cta:session:blob:s1")).toBeNull();
    expect((await s.read("u1", "s1")).ok).toBe(false);
  });

  it("recovery replays a live session and never resurrects a deleted one", async () => {
    const store = new MemorySessionStore();
    const wal = tmpWal();
    const a = new SessionService(store, KEY, sink(), undefined, wal);
    await a.create("u1", { id: "keep" });
    await a.create("u1", { id: "gone" });
    await a.destroy("u1", "gone");

    const fresh = new MemorySessionStore();
    const b = new SessionService(fresh, KEY, sink(), undefined, wal);
    const res = await b.recover();
    expect(res.replayed).toBe(1);
    expect(await fresh.get("cta:session:keep")).not.toBeNull();
    // The tombstone expires in the future, so only the DELETE rule can keep it dead.
    expect(await fresh.get("cta:session:gone")).toBeNull();
  });

  it("recovery skips an already expired session", async () => {
    const store = new MemorySessionStore();
    const wal = tmpWal();
    let now = Date.now();
    const a = new SessionService(store, KEY, sink(), undefined, wal, () => now);
    await a.create("u1", { id: "old", ttlSeconds: 60 });
    now += 120_000;
    const fresh = new MemorySessionStore();
    const b = new SessionService(fresh, KEY, sink(), undefined, wal, () => now);
    expect((await b.recover()).replayed).toBe(0);
  });

  it("recovery never replays a session with under a second left", async () => {
    // 500 ms remain: not yet expired for the first guard, but floor(remaining/1000) is 0,
    // so a Redis SETEX of 0 seconds would be an error or an immortal key. Only the second guard stops it.
    const store = new MemorySessionStore();
    const wal = tmpWal();
    let now = Date.now();
    const a = new SessionService(store, KEY, sink(), undefined, wal, () => now);
    await a.create("u1", { id: "edge", ttlSeconds: 60 });
    now += 59_500;
    const fresh = new MemorySessionStore();
    const b = new SessionService(fresh, KEY, sink(), undefined, wal, () => now);
    const r = await b.recover();
    expect(r.replayed).toBe(0);
    expect(await fresh.get("cta:session:edge")).toBeNull();
  });
});

describe("recovery from a restored or merged WAL", () => {
  it("a later already-expired entry erases an earlier live one for the same session", async () => {
    // A backup restore can interleave entries so that the most recent state for a session is expired
    // while an older CREATE still looks live. The latest word must win, not the last live entry.
    const walPath = tmpWal();
    const wal = new WriteAheadLog(walPath);
    const t0 = Date.now();
    wal.append({ op: "CREATE", sessionId: "sess-merge", ownerId: "u1", blobSha256: "a".repeat(64), ttlSeconds: 3600, expiresAtMs: t0 + 3_600_000 }, new Date(t0));
    wal.append({ op: "EXTEND", sessionId: "sess-merge", ownerId: "u1", blobSha256: "0".repeat(64), ttlSeconds: 1, expiresAtMs: t0 - 1000 }, new Date(t0));
    const fresh = new MemorySessionStore();
    const svc = new SessionService(fresh, KEY, sink(), undefined, walPath, () => t0);
    const r = await svc.recover();
    expect(r.replayed).toBe(0);
    expect(await fresh.get("cta:session:sess-merge")).toBeNull();
  });
});

describe("auth", () => {
  const tokens = { ["t".repeat(24)]: "u1", ["z".repeat(24)]: "u2" };

  it("resolves a known token to its principal", () => {
    expect(authenticate(tokens, `Bearer ${"t".repeat(24)}`)).toBe("u1");
  });
  it("rejects missing, empty, malformed and unknown tokens", () => {
    expect(authenticate(tokens, undefined)).toBeNull();
    expect(authenticate(tokens, "Bearer ")).toBeNull();
    expect(authenticate(tokens, "Basic abc")).toBeNull();
    expect(authenticate(tokens, `Bearer ${"q".repeat(24)}`)).toBeNull();
  });
  it("returns null for a token of the wrong length instead of throwing", () => {
    expect(() => authenticate(tokens, "Bearer short")).not.toThrow();
    expect(authenticate(tokens, "Bearer short")).toBeNull();
    expect(authenticate(tokens, `Bearer ${"t".repeat(400)}`)).toBeNull();
  });
  it("refuses to start without a token table", () => {
    expect(() => loadTokens(undefined)).toThrow(/refusing to start/);
    expect(() => loadTokens("")).toThrow(/refusing to start/);
    expect(() => loadTokens("{}")).toThrow(/empty/);
    expect(() => loadTokens("not json")).toThrow(/valid JSON/);
    expect(() => loadTokens('{"short":"u1"}')).toThrow(/at least 16/);
  });
  it("accepts a valid table", () => {
    expect(loadTokens(JSON.stringify(tokens))).toEqual(tokens);
  });
});

describe("http surface", () => {
  const tokens = { ["k".repeat(24)]: "u1", ["m".repeat(24)]: "u2" };
  let server: http.Server;
  let base = "";

  beforeAll(async () => {
    const cfg = createServer({ tokens, store: new MemorySessionStore(), masterKey: KEY, walFile: tmpWal() });
    server = cfg.server;
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const addr = server.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

  const call = (p: string, init: RequestInit = {}) => fetch(base + p, init);
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  it("health and metrics need no token", async () => {
    expect((await call("/healthz")).status).toBe(200);
    const m = await call("/metrics");
    expect(m.status).toBe(200);
    expect(await m.text()).toContain("cta_gateway_active_sessions");
  });

  it("401s without a token", async () => {
    const r = await call("/v1/sessions", { method: "POST" });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("full lifecycle over http", async () => {
    const c = await call("/v1/sessions", {
      method: "POST", headers: { ...auth("k".repeat(24)), "content-type": "application/json" },
      body: JSON.stringify({ id: "http1", payload: Buffer.from("hi").toString("base64"), ttlSeconds: 300 }),
    });
    expect(c.status).toBe(201);
    const id = (await c.json()).id;

    const g = await call(`/v1/sessions/${id}?payload=1`, { headers: auth("k".repeat(24)) });
    expect(g.status).toBe(200);
    expect(Buffer.from((await g.json()).payload, "base64").toString()).toBe("hi");

    expect((await call(`/v1/sessions/${id}`, { headers: auth("m".repeat(24)) })).status).toBe(403);

    const e = await call(`/v1/sessions/${id}/extend`, {
      method: "POST", headers: { ...auth("k".repeat(24)), "content-type": "application/json" }, body: JSON.stringify({ ttlSeconds: 600 }),
    });
    expect(e.status).toBe(200);

    const d = await call(`/v1/sessions/${id}`, { method: "DELETE", headers: auth("k".repeat(24)) });
    expect(d.status).toBe(200);
    expect((await call(`/v1/sessions/${id}`, { headers: auth("k".repeat(24)) })).status).toBe(404);
  });

  it("rejects a spoofed identity header", async () => {
    const r = await call("/v1/sessions/x", { headers: { "x-user-id": "u1", "x-owner": "u1" } });
    expect(r.status).toBe(401);
  });

  it("rejects a non-numeric ttl and a bad json body", async () => {
    const bad = await call("/v1/sessions", {
      method: "POST", headers: { ...auth("k".repeat(24)), "content-type": "application/json" }, body: "{oops",
    });
    expect(bad.status).toBe(400);
  });

  it("does not leak internals on an unknown route", async () => {
    const r = await call("/v1/nope", { headers: auth("k".repeat(24)) });
    expect(r.status).toBe(404);
    expect(await r.text()).not.toMatch(/stack|at /);
  });
});

describe("resp client", () => {
  it("encodes a command", () => {
    expect(encodeCommand(["GET", "k"])).toBe("*2\r\n$3\r\nGET\r\n$1\r\nk\r\n");
  });
  it("parses simple, integer, bulk, nil, array and error replies", () => {
    expect(parseReply(Buffer.from("+OK\r\n")).value).toBe("OK");
    expect(parseReply(Buffer.from(":42\r\n")).value).toBe(42);
    expect(parseReply(Buffer.from("$3\r\nfoo\r\n")).value).toBe("foo");
    expect(parseReply(Buffer.from("$-1\r\n")).value).toBeNull();
    expect(parseReply(Buffer.from("*2\r\n$1\r\na\r\n:1\r\n")).value).toEqual(["a", 1]);
    expect(parseReply(Buffer.from("-ERR nope\r\n")).value).toEqual({ error: "ERR nope" });
  });
  it("throws on a partial reply", () => {
    expect(() => parseReply(Buffer.from("$5\r\nabc"))).not.toThrow();
    expect(() => parseReply(Buffer.from("+OK"))).toThrow(/incomplete/);
  });
});
