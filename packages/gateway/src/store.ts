/** What the gateway needs from Redis. node-redis satisfies this through the adapter in redisAdapter.ts. */
export interface SessionStore {
  get(key: string): Promise<string | null>;
  /** Set with a TTL in seconds. */
  setEx(key: string, ttlSeconds: number, value: string): Promise<void>;
  /** Change the remaining TTL without touching the value. Returns false if the key is gone. */
  expire(key: string, ttlSeconds: number): Promise<boolean>;
  ttl(key: string): Promise<number>;
  del(key: string): Promise<void>;
  /** Count keys by prefix using SCAN, never KEYS, so Redis is never blocked. */
  countPrefix(prefix: string): Promise<number>;
  ping(): Promise<string>;
}

export class MemorySessionStore implements SessionStore {
  private m = new Map<string, { v: string; exp: number }>();
  constructor(private now: () => number = () => Date.now()) {}
  private live(k: string) {
    const e = this.m.get(k);
    if (e && e.exp <= this.now()) { this.m.delete(k); return undefined; }
    return e;
  }
  async get(k: string) { return this.live(k)?.v ?? null; }
  async setEx(k: string, ttl: number, v: string) { this.m.set(k, { v, exp: this.now() + ttl * 1000 }); }
  async expire(k: string, ttl: number) { const e = this.live(k); if (!e) return false; e.exp = this.now() + ttl * 1000; return true; }
  async ttl(k: string) { const e = this.live(k); return e ? Math.ceil((e.exp - this.now()) / 1000) : -2; }
  async del(k: string) { this.m.delete(k); }
  async countPrefix(p: string) { let n = 0; for (const k of [...this.m.keys()]) if (k.startsWith(p) && this.live(k)) n++; return n; }
  async ping() { return "PONG"; }
}
