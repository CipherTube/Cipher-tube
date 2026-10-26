import { createClient, RedisClientType } from "redis";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = process.env.REDIS_PORT || "6379";
const REDIS_URL =
  process.env.REDIS_URL || `redis://${REDIS_HOST}:${REDIS_PORT}`;

const client: RedisClientType = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries: number) => {
      // Exponential backoff with a hard cap at 3000ms to maintain speed
      const delay = Math.min(retries * 100, 3000);
      console.warn(
        `[Cache Warning] Redis disconnected. Reconnect attempt #${retries} in ${delay}ms...`,
      );
      return delay;
    },
  },
});

client.on("connect", () => {
  console.log(
    "📊 [Cache Telemetry] Connection established to Redis cache cluster.",
  );
});

client.on("error", (err: any) => {
  console.error(
    "🚨 [Cache Critical] Redis memory pool encountered an error:",
    err?.message || "Redis connection error",
  );
});

client.on("end", () => {
  console.warn("⚠️ [Cache Warning] Redis client connection channel closed.");
});

// Immediately invoke connection chain if not in test mode
if (process.env.NODE_ENV !== "test") {
  (async () => {
    try {
      await client.connect();
    } catch (err: any) {
      console.error(
        "🚨 [Cache Fault] Immediate initialization failed. Running in degraded failover state.",
        err?.message || "Redis connection error",
      );
    }
  })();
}

/**
 * Wrapper utility layer to safeguard the gateway from crashing if the cache pool drops out.
 */
export const cache = {
  get: async (key: string): Promise<string | null> => {
    if (!client.isOpen) return null; // Safe failover: treat as cache miss
    try {
      return await client.get(key);
    } catch {
      return null;
    }
  },
  setEx: async (
    key: string,
    seconds: number,
    value: string,
  ): Promise<string | null> => {
    if (!client.isOpen) return null;
    try {
      return await client.setEx(key, seconds, value);
    } catch {
      return null;
    }
  },
  expire: async (key: string, seconds: number): Promise<boolean | null> => {
    if (!client.isOpen) return null;
    try {
      const result = await client.expire(key, seconds);
      return !!result;
    } catch {
      return null;
    }
  },
  rawClient: client,
};
