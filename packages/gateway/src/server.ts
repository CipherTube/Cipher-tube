import http from "node:http";
import crypto from "node:crypto";
import { SessionService, JsonLineAuditSink, type AuditSink } from "./sessionService";
import type { SessionStore } from "./store";

export interface ServerConfig {
  /** token -> principal. Loaded from GATEWAY_TOKENS as JSON. */
  tokens: Record<string, string>;
  store: SessionStore;
  masterKey: Buffer;
  walFile: string;
  audit?: AuditSink;
  maxBodyBytes?: number;
}

const timingSafeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
};

/**
 * Resolves the caller from the Authorization header against the configured
 * token table. Returns null for anything unknown, malformed or empty.
 *
 * The principal comes from this table and nowhere else. Trusting a header like
 * x-user-id would let any caller act as any user, which is the single most
 * common way a gateway like this gets owned.
 */
export const authenticate = (tokens: Record<string, string>, header: string | undefined): string | null => {
  if (!header || !header.startsWith("Bearer ")) return null;
  const presented = header.slice(7).trim();
  if (!presented) return null;
  for (const [token, principal] of Object.entries(tokens)) {
    if (timingSafeEqual(presented, token)) return principal;
  }
  return null;
};

/** Parse GATEWAY_TOKENS. A missing, empty or malformed table is a hard failure. */
export const loadTokens = (raw: string | undefined): Record<string, string> => {
  if (!raw || !raw.trim()) throw new Error("GATEWAY_TOKENS is not set: refusing to start with authentication disabled");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GATEWAY_TOKENS is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("GATEWAY_TOKENS must be an object of token -> principal");
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) throw new Error("GATEWAY_TOKENS is empty: refusing to start with no principals");
  for (const [token, principal] of entries) {
    if (typeof principal !== "string" || !principal.trim()) throw new Error("every token must map to a non-empty principal");
    if (token.length < 16) throw new Error("tokens must be at least 16 characters");
  }
  return parsed as Record<string, string>;
};

interface Counters {
  requests: number;
  byStatus: Record<string, number>;
  authFailures: number;
}

export const createServer = (cfg: ServerConfig) => {
  if (!cfg.tokens || Object.keys(cfg.tokens).length === 0) throw new Error("no tokens configured");
  const counters: Counters = { requests: 0, byStatus: {}, authFailures: 0 };
  const maxBody = cfg.maxBodyBytes ?? 512 * 1024;
  const audit = cfg.audit ?? new JsonLineAuditSink(() => {});
  const svc = new SessionService(cfg.store, cfg.masterKey, audit, undefined, cfg.walFile);

  const send = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    const payload = JSON.stringify(body);
    counters.byStatus[String(status)] = (counters.byStatus[String(status)] ?? 0) + 1;
    res.writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "strict-transport-security": "max-age=31536000",
      ...headers,
    });
    res.end(payload);
  };

  const readBody = (req: http.IncomingMessage): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > maxBody) { reject(new Error("too large")); req.destroy(); return; }
        chunks.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });

  const server = http.createServer(async (req, res) => {
    counters.requests++;
    const url = new URL(req.url ?? "/", "http://gateway.local");
    const path = url.pathname;

    try {
      if (path === "/healthz") return send(res, 200, { ok: true });
      if (path === "/readyz") {
        try { await cfg.store.ping(); return send(res, 200, { ready: true }); }
        catch { return send(res, 503, { ready: false }); }
      }
      if (path === "/metrics") {
        const active = await svc.activeCount().catch(() => -1);
        const lines = [
          "# HELP cta_gateway_requests_total Requests handled.",
          "# TYPE cta_gateway_requests_total counter",
          `cta_gateway_requests_total ${counters.requests}`,
          "# HELP cta_gateway_auth_failures_total Rejected unauthenticated or bad-token requests.",
          "# TYPE cta_gateway_auth_failures_total counter",
          `cta_gateway_auth_failures_total ${counters.authFailures}`,
          "# HELP cta_gateway_active_sessions Live sessions in the store.",
          "# TYPE cta_gateway_active_sessions gauge",
          `cta_gateway_active_sessions ${active}`,
          "# HELP cta_gateway_wal_entries WAL entries written this process.",
          "# TYPE cta_gateway_wal_entries gauge",
          `cta_gateway_wal_entries ${svc.walLength()}`,
        ];
        res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
        return res.end(lines.join("\n") + "\n");
      }

      const principal = authenticate(cfg.tokens, req.headers.authorization);
      if (!principal) {
        counters.authFailures++;
        audit.record({ at: new Date().toISOString(), actor: "anonymous", action: "REJECT", sessionId: "-", outcome: "deny", reason: "bad or missing token" });
        return send(res, 401, { error: "UNAUTHENTICATED" }, { "www-authenticate": "Bearer" });
      }

      const m = path.match(/^\/v1\/sessions(?:\/([A-Za-z0-9_-]{1,128}))?(?:\/(extend))?$/);
      if (!m) return send(res, 404, { error: "NOT_FOUND" });
      const [, id, action] = m;

      if (req.method === "POST" && !id) {
        const raw = await readBody(req);
        let body: { id?: string; payload?: string; ttlSeconds?: number } = {};
        if (raw.length) {
          try { body = JSON.parse(raw.toString("utf8")); } catch { return send(res, 400, { error: "INVALID" }); }
        }
        const payload = body.payload ? Buffer.from(body.payload, "base64") : Buffer.alloc(0);
        const r = await svc.create(principal, { id: body.id, payload, ttlSeconds: body.ttlSeconds });
        return r.ok ? send(res, 201, r.value) : send(res, r.error.status, { error: r.error.code });
      }

      if (req.method === "GET" && id && !action) {
        const wantPayload = url.searchParams.get("payload") === "1";
        const r = await svc.read(principal, id, { withPayload: wantPayload });
        if (!r.ok) return send(res, r.error.status, { error: r.error.code });
        return send(res, 200, { ...r.value.record, payload: r.value.payload?.toString("base64") });
      }

      if (req.method === "POST" && id && action === "extend") {
        const raw = await readBody(req);
        let body: { ttlSeconds?: number } = {};
        if (raw.length) {
          try { body = JSON.parse(raw.toString("utf8")); } catch { return send(res, 400, { error: "INVALID" }); }
        }
        const r = await svc.extend(principal, id, body.ttlSeconds);
        return r.ok ? send(res, 200, r.value) : send(res, r.error.status, { error: r.error.code });
      }

      if (req.method === "DELETE" && id && !action) {
        const r = await svc.destroy(principal, id);
        return r.ok ? send(res, 200, r.value) : send(res, r.error.status, { error: r.error.code });
      }

      return send(res, 405, { error: "METHOD_NOT_ALLOWED" }, { allow: "GET, POST, DELETE" });
    } catch (e) {
      // Never echo internals to the caller; the audit trail carries the reason.
      const tooLarge = e instanceof Error && e.message === "too large";
      audit.record({ at: new Date().toISOString(), actor: "system", action: "REJECT", sessionId: "-", outcome: "error", reason: tooLarge ? "body too large" : "internal" });
      return send(res, tooLarge ? 413 : 500, { error: tooLarge ? "PAYLOAD_TOO_LARGE" : "INTERNAL" });
    }
  });

  return { server, service: svc, counters };
};

/** Entry point used by the container image. */
export const start = async (): Promise<http.Server> => {
  const tokens = loadTokens(process.env.GATEWAY_TOKENS);
  const masterKey = Buffer.from(process.env.GATEWAY_MASTER_KEY ?? "", "base64");
  if (masterKey.length !== 32) throw new Error("GATEWAY_MASTER_KEY must be 32 bytes, base64 encoded");

  // Redis is optional at build time: the adapter is loaded only when configured.
  const { store } = await (async () => {
    if (process.env.GATEWAY_REDIS_URL) {
      const mod = await import("./redisAdapter");
      return { store: await mod.connectRedis(process.env.GATEWAY_REDIS_URL) };
    }
    const mod = await import("./store");
    if (process.env.NODE_ENV === "production") {
      throw new Error("GATEWAY_REDIS_URL is required in production: the in-memory store does not survive a restart");
    }
    return { store: new mod.MemorySessionStore() };
  })();

  const { server } = createServer({
    tokens,
    store,
    masterKey,
    walFile: process.env.GATEWAY_WAL_FILE ?? "/var/lib/ct-gateway/session_wal.jsonl",
  });

  const port = Number(process.env.PORT ?? 8080);
  server.listen(port, () => {
    // Deliberately quiet: no token, no principal, no key material in logs.
    console.log(JSON.stringify({ event: "gateway_start", port, principals: Object.keys(tokens).length }));
  });
  return server;
};
