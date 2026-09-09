import crypto from 'crypto';
import { fastHash } from './cta';
import { RedisClientType } from 'redis';
import {
    SessionPayload,
    SESSION_PAYLOAD_VERSION,
    serializePayload,
    deserializePayload,
    migrateLegacySession,
    LegacySessionError,
} from './session/payload';

/**
 * Calculates a blinded hash for a given session ID or token.
 * Bolt Optimization: Use one-shot crypto.hash via fastHash for ~2x faster hashing.
 *
 * @param token - The raw session ID or token to be blinded.
 * @returns The SHA-256 blinded hash as a hex string, or an empty string if invalid.
 */
export function blindToken(token: string): string {
    if (!token || typeof token !== 'string') {
        return '';
    }
    return fastHash('sha256', token, 'hex');
}

/**
 * Calculates the blinded Redis key for a given session ID or token.
 * This ensures that even if Redis is compromised, raw session IDs are not exposed.
 *
 * @param token - The raw session ID or token to be blinded.
 * @returns The SHA-256 blinded key prefixed with 'session:'.
 */
export function getBlindedRedisKey(token: string): string {
    const hashed = blindToken(token);
    return hashed ? `session:${hashed}` : '';
}

/**
 * Optimized helper to construct Redis key from an already blinded hash.
 * Bolt Optimization: Saves one redundant hashing operation in hot paths.
 */
export function getRedisKeyFromHash(blindedHash: string): string {
    return `session:${blindedHash}`;
}

/**
 * Creates a new session in Redis and returns the raw token.
 * Priority 1: stores a versioned SessionPayload (v1 JSON) instead of a raw userId.
 */
export async function createSession(
    userId: string,
    redis: RedisClientType,
    ttl: number,
    scopes: string[] = []
): Promise<string> {
    const token = crypto.randomUUID();
    const key = getBlindedRedisKey(token);
    const payload: SessionPayload = {
        v: SESSION_PAYLOAD_VERSION,
        userId,
        scopes,
        issuedAt: Date.now(),
        rotationCount: 0,
    };
    await redis.set(key, serializePayload(payload), { EX: ttl });
    return token;
}

/**
 * Reads a session and returns its typed payload.
 * Legacy v0 values (raw userId) are transparently migrated to v1 and
 * written back to Redis, preserving the remaining TTL (lazy migration).
 * Returns null when the key is absent or expired.
 */
export async function readSession(token: string, redis: RedisClientType): Promise<SessionPayload | null> {
    const key = getBlindedRedisKey(token);
    if (!key) return null;
    const raw = await redis.get(key);
    if (raw === null) return null;
    try {
        return deserializePayload(raw);
    } catch (err) {
        if (err instanceof LegacySessionError) {
            const migrated = migrateLegacySession(raw);
            const remainingTtl = await redis.ttl(key);
            if (remainingTtl > 0) {
                await redis.set(key, serializePayload(migrated), { EX: remainingTtl });
            }
            return migrated;
        }
        throw err;
    }
}

/**
 * Rotates an existing session token.
 * Priority 1: rotation now increments rotationCount, records lineage
 * (blinded hash of the old token) and carries scopes forward.
 * Bolt Optimization: 5-second grace period on the old token preserved.
 */
export async function rotateSession(
    oldToken: string,
    redis: RedisClientType,
    ttl: number
): Promise<{ newToken: string; rotationCount: number }> {
    const payload = await readSession(oldToken, redis);

    if (!payload) {
        throw new Error("Session expired, revoked, or replayed.");
    }

    const newToken = crypto.randomUUID();
    const newKey = getBlindedRedisKey(newToken);
    const rotated: SessionPayload = {
        v: SESSION_PAYLOAD_VERSION,
        userId: payload.userId,
        scopes: payload.scopes,
        issuedAt: Date.now(),
        rotatedFrom: blindToken(oldToken),
        rotationCount: payload.rotationCount + 1,
    };
    await redis.set(newKey, serializePayload(rotated), { EX: ttl });

    // Burn old token with a 5-second grace period instead of immediate deletion
    // This allows in-flight requests with the old token to succeed.
    const oldKey = getBlindedRedisKey(oldToken);
    await redis.expire(oldKey, 5);

    return { newToken, rotationCount: rotated.rotationCount };
}

/**
 * Bolt Optimization: Consolidates hashing into a single pass for both local and Redis keys.
 *
 * @param token - The raw session token.
 * @returns Object containing the blinded hash and the Redis-prefixed key.
 */
export function getSessionKeys(token: string): { blindedKey: string; redisKey: string } {
    const hashed = blindToken(token);
    return {
        blindedKey: hashed,
        redisKey: hashed ? `session:${hashed}` : ''
    };
}
