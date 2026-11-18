/**
 * Minimal key-value surface the Optimus stack needs from Redis.
 *
 * ioredis satisfies this shape as is, so production passes a real client and
 * tests pass MemoryStore. Keeping the dependency behind an interface means the
 * repo does not take on ioredis just to compile or test.
 */
export interface KeyValueStore {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  rpush(key: string, value: string): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: "EX", seconds?: number): Promise<unknown>;
}

/** In-memory store with real TTL semantics, driven by an injectable clock. */
export class MemoryStore implements KeyValueStore {
  private values = new Map<string, { v: string; exp: number | null }>();
  private lists = new Map<string, string[]>();
  private counters = new Map<string, { n: number; exp: number | null }>();

  constructor(private now: () => number = () => Date.now()) {}

  private live<T extends { exp: number | null }>(m: Map<string, T>, key: string): T | undefined {
    const e = m.get(key);
    if (e && e.exp !== null && e.exp <= this.now()) {
      m.delete(key);
      return undefined;
    }
    return e;
  }

  async incr(key: string): Promise<number> {
    const e = this.live(this.counters, key) ?? { n: 0, exp: null };
    e.n += 1;
    this.counters.set(key, e);
    return e.n;
  }

  async expire(key: string, seconds: number): Promise<unknown> {
    const c = this.counters.get(key);
    if (c) c.exp = this.now() + seconds * 1000;
    const v = this.values.get(key);
    if (v) v.exp = this.now() + seconds * 1000;
    return 1;
  }

  async rpush(key: string, value: string): Promise<unknown> {
    const l = this.lists.get(key) ?? [];
    l.push(value);
    this.lists.set(key, l);
    return l.length;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const l = this.lists.get(key) ?? [];
    const end = stop < 0 ? l.length + stop + 1 : stop + 1;
    return l.slice(start, end);
  }

  async get(key: string): Promise<string | null> {
    return this.live(this.values, key)?.v ?? null;
  }

  async set(key: string, value: string, mode?: "EX", seconds?: number): Promise<unknown> {
    this.values.set(key, { v: value, exp: mode === "EX" && seconds ? this.now() + seconds * 1000 : null });
    return "OK";
  }
}
