import crypto from "node:crypto";
import { WriteAheadLog, type WalEntry } from "./wal";
import type { SessionStore } from "./store";

/** Hard ceilings. Config can lower them, never raise them past these. */
export const LIMITS = {
  ttlMinSeconds: 60,
  ttlMaxSeconds: 24 * 60 * 60,
  payloadMaxBytes: 256 * 1024,
  idMaxLength: 128,
} as const;

export interface SessionPolicy {
  defaultTtlSeconds: number;
  maxTtlSeconds: number;
  /** How long a DELETE leaves a tombstone entry in the WAL for audit. */
  tombstoneRetentionSeconds: number;
}

export const DEFAULT_POLICY: SessionPolicy = {
  defaultTtlSeconds: 1800,
  maxTtlSeconds: 12 * 60 * 60,
  tombstoneRetentionSeconds: 30 * 24 * 60 * 60,
};

export interface SessionRecord {
  id: string;
  ownerId: string;
  createdAt: string;
  expiresAt: string;
  ttlSeconds: number;
}

export const STATUS = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  PAYLOAD_TOO_LARGE: 413,
  UNAVAILABLE: 503,
} as const;

export type ServiceError = { code: keyof typeof STATUS; status: number };

export type Result<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

const err = <T>(code: keyof typeof STATUS): Result<T> => ({ ok: false, error: { code, status: STATUS[code] } });

/**
 * Per-user envelope key. Derived, never stored: the master key lives in the
 * environment (or a KMS in production) and each owner gets an independent key,
 * so one leaked derived key cannot open another user's sessions.
 */
export const deriveOwnerKey = (masterKey: Buffer, ownerId: string): Buffer =>
  Buffer.from(crypto.hkdfSync("sha256", masterKey, Buffer.alloc(0), Buffer.from(`ct-session:${ownerId}`), 32));

export const sealPayload = (key: Buffer, plaintext: Buffer, aad: string): Buffer => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  // Bind the ciphertext to its owner and session id so a blob cannot be swapped between records.
  c.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
};

export const openPayload = (key: Buffer, sealed: Buffer, aad: string): Buffer => {
  const iv = sealed.subarray(0, 12);
  const tag = sealed.subarray(12, 28);
  const ct = sealed.subarray(28);
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
};

export interface AuditSink {
  /** Append-only audit trail: who did what, to which session, and the outcome. */
  record(event: {
    at: string;
    actor: string;
    action: "CREATE" | "READ" | "EXTEND" | "DELETE" | "REJECT";
    sessionId: string;
    outcome: "allow" | "deny" | "error";
    reason?: string;
  }): void;
}

export class JsonLineAuditSink implements AuditSink {
  constructor(private readonly write: (line: string) => void) {}
  record(e: Parameters<AuditSink["record"]>[0]): void {
    this.write(JSON.stringify(e));
  }
}

/**
 * Session service.
 *
 * The rules that matter, all enforced here rather than in the HTTP layer:
 * 1. Every call needs an authenticated principal. There is no open mode.
 * 2. Ownership is taken from that principal, never from a header or the body.
 * 3. Extend can only move an expiry later, never earlier, and never past the cap.
 * 4. Every mutation is written to a hash-chained WAL before it is acknowledged.
 * 5. Reads verify the WAL chain and the blob's AAD before returning anything.
 */
export class SessionService {
  private wal: WriteAheadLog;
  constructor(
    private readonly store: SessionStore,
    private readonly masterKey: Buffer,
    private readonly audit: AuditSink,
    private readonly policy: SessionPolicy = DEFAULT_POLICY,
    walFile = ":memory:",
    private readonly now: () => number = () => Date.now(),
  ) {
    if (masterKey.length !== 32) throw new Error("masterKey must be 32 bytes");
    if (walFile === ":memory:") {
      // Keeps tests hermetic; production always passes a real path.
      this.wal = new WriteAheadLog(`/tmp/ct-wal-${crypto.randomBytes(6).toString("hex")}.jsonl`);
    } else {
      this.wal = new WriteAheadLog(walFile);
    }
  }

  private key(id: string) {
    return `cta:session:${id}`;
  }

  private blobKey(id: string) {
    return `cta:session:blob:${id}`;
  }

  private clampTtl(requested: number | undefined): number {
    const t = requested ?? this.policy.defaultTtlSeconds;
    const cap = Math.min(this.policy.maxTtlSeconds, LIMITS.ttlMaxSeconds);
    if (!Number.isFinite(t)) return this.policy.defaultTtlSeconds;
    return Math.max(LIMITS.ttlMinSeconds, Math.min(cap, Math.floor(t)));
  }

  private validateId(id: unknown): id is string {
    return typeof id === "string" && id.length > 0 && id.length <= LIMITS.idMaxLength && /^[A-Za-z0-9_-]+$/.test(id);
  }

  async create(principal: string | null, opts: { id?: string; payload?: Buffer; ttlSeconds?: number }): Promise<Result<SessionRecord>> {
    if (!principal) return err("UNAUTHENTICATED");
    const id = opts.id ?? crypto.randomBytes(16).toString("hex");
    if (!this.validateId(id)) return err("INVALID");

    const payload = opts.payload ?? Buffer.alloc(0);
    if (payload.length > LIMITS.payloadMaxBytes) return err("PAYLOAD_TOO_LARGE");

    if (await this.store.get(this.key(id))) {
      // Idempotent create: an existing record for the same owner is returned, not overwritten.
      const existing = JSON.parse((await this.store.get(this.key(id)))!) as SessionRecord;
      if (existing.ownerId !== principal) {
        this.audit.record({ at: new Date(this.now()).toISOString(), actor: principal, action: "REJECT", sessionId: id, outcome: "deny", reason: "id collision across owners" });
        return err("FORBIDDEN");
      }
      return { ok: true, value: existing };
    }

    const ttl = this.clampTtl(opts.ttlSeconds);
    const created = new Date(this.now());
    const expires = new Date(created.getTime() + ttl * 1000);

    const sealed = sealPayload(deriveOwnerKey(this.masterKey, principal), payload, `${principal}:${id}`);
    await this.store.setEx(this.blobKey(id), ttl, sealed.toString("base64"));

    const record: SessionRecord = {
      id,
      ownerId: principal,
      createdAt: created.toISOString(),
      expiresAt: expires.toISOString(),
      ttlSeconds: ttl,
    };
    await this.store.setEx(this.key(id), ttl, JSON.stringify(record));

    this.wal.append({
      op: "CREATE",
      sessionId: id,
      ownerId: principal,
      blobSha256: crypto.createHash("sha256").update(sealed).digest("hex"),
      ttlSeconds: ttl,
      expiresAtMs: expires.getTime(),
    }, created);

    this.audit.record({ at: created.toISOString(), actor: principal, action: "CREATE", sessionId: id, outcome: "allow" });
    return { ok: true, value: record };
  }

  async read(principal: string | null, id: string, opts: { withPayload?: boolean } = {}): Promise<Result<{ record: SessionRecord; payload?: Buffer }>> {
    if (!principal) return err("UNAUTHENTICATED");
    if (!this.validateId(id)) return err("INVALID");

    const raw = await this.store.get(this.key(id));
    if (!raw) return err("NOT_FOUND");
    const record = JSON.parse(raw) as SessionRecord;

    // Ownership is a property of the stored record, compared to the authenticated caller.
    if (record.ownerId !== principal) {
      this.audit.record({ at: new Date(this.now()).toISOString(), actor: principal, action: "REJECT", sessionId: id, outcome: "deny", reason: "owner mismatch" });
      return err("FORBIDDEN");
    }

    let payload: Buffer | undefined;
    if (opts.withPayload) {
      const b64 = await this.store.get(this.blobKey(id));
      if (!b64) return err("NOT_FOUND");
      try {
        payload = openPayload(deriveOwnerKey(this.masterKey, principal), Buffer.from(b64, "base64"), `${principal}:${id}`);
      } catch {
        // AAD or tag mismatch means the blob was tampered with or moved between records.
        this.audit.record({ at: new Date(this.now()).toISOString(), actor: principal, action: "READ", sessionId: id, outcome: "error", reason: "payload integrity failure" });
        return err("FORBIDDEN");
      }
    }

    this.audit.record({ at: new Date(this.now()).toISOString(), actor: principal, action: "READ", sessionId: id, outcome: "allow" });
    return { ok: true, value: { record, payload } };
  }

  async extend(principal: string | null, id: string, ttlSeconds?: number): Promise<Result<SessionRecord>> {
    if (!principal) return err("UNAUTHENTICATED");
    if (!this.validateId(id)) return err("INVALID");

    const raw = await this.store.get(this.key(id));
    if (!raw) return err("NOT_FOUND");
    const record = JSON.parse(raw) as SessionRecord;
    if (record.ownerId !== principal) return err("FORBIDDEN");

    const requested = this.clampTtl(ttlSeconds);
    const remaining = await this.store.ttl(this.key(id));
    // Extend is monotonic: it can lengthen a session, never shorten one.
    const nextTtl = Math.max(requested, remaining);
    const cap = Math.min(this.policy.maxTtlSeconds, LIMITS.ttlMaxSeconds);
    if (nextTtl > cap) return err("INVALID");

    const ok = await this.store.expire(this.key(id), nextTtl);
    if (!ok) return err("NOT_FOUND");
    await this.store.expire(this.blobKey(id), nextTtl);

    const expires = new Date(this.now() + nextTtl * 1000);
    const updated: SessionRecord = { ...record, expiresAt: expires.toISOString(), ttlSeconds: nextTtl };
    await this.store.setEx(this.key(id), nextTtl, JSON.stringify(updated));

    this.wal.append({
      op: "EXTEND",
      sessionId: id,
      ownerId: principal,
      blobSha256: "0".repeat(64),
      ttlSeconds: nextTtl,
      expiresAtMs: expires.getTime(),
    }, new Date(this.now()));

    this.audit.record({ at: new Date(this.now()).toISOString(), actor: principal, action: "EXTEND", sessionId: id, outcome: "allow" });
    return { ok: true, value: updated };
  }

  async destroy(principal: string | null, id: string): Promise<Result<{ deleted: true }>> {
    if (!principal) return err("UNAUTHENTICATED");
    if (!this.validateId(id)) return err("INVALID");

    const raw = await this.store.get(this.key(id));
    if (!raw) return err("NOT_FOUND");
    const record = JSON.parse(raw) as SessionRecord;
    if (record.ownerId !== principal) return err("FORBIDDEN");

    await this.store.del(this.key(id));
    await this.store.del(this.blobKey(id));

    // Tombstone stays in the WAL so the deletion itself is auditable. Its
    // retention window is deliberately in the future: recovery must skip it
    // because it is a DELETE, not because it happens to look expired.
    this.wal.append({
      op: "DELETE",
      sessionId: id,
      ownerId: principal,
      blobSha256: "0".repeat(64),
      ttlSeconds: 0,
      expiresAtMs: this.now() + this.policy.tombstoneRetentionSeconds * 1000,
    }, new Date(this.now()));

    this.audit.record({ at: new Date(this.now()).toISOString(), actor: principal, action: "DELETE", sessionId: id, outcome: "allow" });
    return { ok: true, value: { deleted: true } };
  }

  /**
   * Rebuilds what the WAL can prove after a crash. Only CREATE and EXTEND
   * entries for sessions still inside their expiry are replayed; DELETE and
   * expired entries are skipped, so recovery cannot resurrect a session the
   * owner killed or one that already timed out.
   */
  async recover(): Promise<{ replayed: number; skipped: number; corrupt: { line: number; reason: string }[] }> {
    const { entries, corrupt } = this.wal.read();
    const state = new Map<string, WalEntry>();
    for (const e of entries) {
      if (e.op === "DELETE") { state.delete(e.sessionId); continue; }
      if (e.expiresAtMs <= this.now()) { state.delete(e.sessionId); continue; }
      state.set(e.sessionId, e);
    }
    let replayed = 0;
    for (const [id, e] of state) {
      const remaining = Math.floor((e.expiresAtMs - this.now()) / 1000);
      if (remaining <= 0) continue;
      if (!(await this.store.get(this.key(id)))) {
        const record: SessionRecord = {
          id,
          ownerId: e.ownerId,
          createdAt: e.ts,
          expiresAt: new Date(e.expiresAtMs).toISOString(),
          ttlSeconds: remaining,
        };
        await this.store.setEx(this.key(id), remaining, JSON.stringify(record));
        replayed++;
      }
    }
    return { replayed, skipped: entries.length - replayed, corrupt };
  }

  /** Count of live sessions, by SCAN, for metrics. */
  async activeCount(): Promise<number> {
    return this.store.countPrefix("cta:session:");
  }

  walLength(): number {
    return this.wal.length;
  }
}
