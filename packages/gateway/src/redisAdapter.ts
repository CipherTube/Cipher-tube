import net from "node:net";
import type { SessionStore } from "./store";

/**
 * Minimal RESP2 client. Written by hand so the gateway ships with zero runtime
 * dependencies: every added dependency is supply-chain surface, and this file
 * only needs GET, SET ... EX, TTL, EXPIRE, DEL, PING and SCAN.
 */
export const encodeCommand = (args: string[]): string =>
  `*${args.length}\r\n` + args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`).join("");

type Resp = string | number | null | Resp[] | { error: string };

/** Parses one reply starting at `offset`. Returns the value and the next offset. */
export const parseReply = (buf: Buffer, offset = 0): { value: Resp; next: number } => {
  const lineEnd = buf.indexOf("\r\n", offset);
  if (lineEnd === -1) throw new Error("incomplete reply");
  const header = buf.subarray(offset, lineEnd).toString("utf8");
  const after = lineEnd + 2;
  const type = header[0];
  const rest = header.slice(1);

  if (type === "+") return { value: rest, next: after };
  if (type === "-") return { value: { error: rest }, next: after };
  if (type === ":") return { value: Number(rest), next: after };
  if (type === "$") {
    const len = Number(rest);
    if (len === -1) return { value: null, next: after };
    return { value: buf.subarray(after, after + len).toString("utf8"), next: after + len + 2 };
  }
  if (type === "*") {
    const count = Number(rest);
    if (count === -1) return { value: null, next: after };
    const items: Resp[] = [];
    let cursor = after;
    for (let i = 0; i < count; i++) {
      const r = parseReply(buf, cursor);
      items.push(r.value);
      cursor = r.next;
    }
    return { value: items, next: cursor };
  }
  throw new Error(`unknown RESP type ${type}`);
};

export class RespClient {
  private buf = Buffer.alloc(0);
  private pending: { resolve: (v: Resp) => void; reject: (e: Error) => void }[] = [];
  private socket: net.Socket;

  constructor(private readonly url: string) {
    const u = new URL(url);
    this.socket = net.createConnection({ host: u.hostname, port: Number(u.port || 6379) });
    this.socket.on("data", (d: Buffer) => {
      this.buf = Buffer.concat([this.buf, d]);
      while (this.pending.length) {
        try {
          const { value, next } = parseReply(this.buf);
          this.buf = this.buf.subarray(next);
          this.pending.shift()!.resolve(value);
        } catch {
          break; // wait for the rest of the reply
        }
      }
    });
    this.socket.on("error", (e) => {
      while (this.pending.length) this.pending.shift()!.reject(e);
    });
  }

  send(args: string[]): Promise<Resp> {
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.socket.write(encodeCommand(args));
    });
  }

  async command(args: string[]): Promise<Resp> {
    const r = await this.send(args);
    if (r && typeof r === "object" && !Array.isArray(r) && "error" in r) throw new Error(r.error);
    return r;
  }

  close(): void {
    this.socket.end();
  }
}

/** Wraps Redis behind the SessionStore contract. */
export const connectRedis = async (url: string): Promise<SessionStore & { close(): void }> => {
  const c = new RespClient(url);
  await c.command(["PING"]);
  return {
    async get(k) {
      const v = await c.command(["GET", k]);
      return typeof v === "string" ? v : null;
    },
    async setEx(k, ttl, v) {
      await c.command(["SET", k, v, "EX", String(Math.max(1, Math.floor(ttl)))]);
    },
    async expire(k, ttl) {
      const r = await c.command(["EXPIRE", k, String(Math.max(1, Math.floor(ttl)))]);
      return r === 1;
    },
    async ttl(k) {
      const r = await c.command(["TTL", k]);
      return typeof r === "number" ? r : -2;
    },
    async del(k) {
      await c.command(["DEL", k]);
    },
    async countPrefix(prefix) {
      // SCAN, never KEYS: KEYS blocks the server on a large keyspace.
      let cursor = "0";
      let n = 0;
      do {
        const r = (await c.command(["SCAN", cursor, "MATCH", `${prefix}*`, "COUNT", "500"])) as Resp[];
        cursor = String(r[0]);
        n += (r[1] as string[]).length;
      } while (cursor !== "0");
      return n;
    },
    async ping() {
      const r = await c.command(["PING"]);
      return typeof r === "string" ? r : "PONG";
    },
    close() {
      c.close();
    },
  };
};
