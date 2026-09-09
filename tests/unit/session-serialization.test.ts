import { describe, it, expect } from 'vitest';
import {
    serializePayload,
    deserializePayload,
    migrateLegacySession,
    SESSION_PAYLOAD_VERSION,
    LegacySessionError,
    SessionPayload,
} from '../../src/session/payload';
import {
    createSession,
    readSession,
    rotateSession,
    getBlindedRedisKey,
} from '../../src/session_rotator';

/**
 * Minimal in-memory Redis client mock implementing the surface used by
 * session_rotator: get / set(EX) / expire / ttl with real expiry semantics.
 */
type Entry = { value: string; expiresAt: number | null };

function mockRedis() {
    const store = new Map<string, Entry>();
    return {
        store,
        async get(key: string): Promise<string | null> {
            const e = store.get(key);
            if (!e) return null;
            if (e.expiresAt !== null && e.expiresAt <= Date.now()) {
                store.delete(key);
                return null;
            }
            return e.value;
        },
        async set(key: string, value: string, opts?: { EX?: number }): Promise<unknown> {
            store.set(key, {
                value,
                expiresAt: opts?.EX ? Date.now() + opts.EX * 1000 : null,
            });
            return 'OK';
        },
        async expire(key: string, seconds: number): Promise<boolean> {
            const e = store.get(key);
            if (!e) return false;
            e.expiresAt = Date.now() + seconds * 1000;
            return true;
        },
        async ttl(key: string): Promise<number> {
            const e = store.get(key);
            if (!e) return -2;
            if (e.expiresAt === null) return -1;
            return Math.max(0, Math.ceil((e.expiresAt - Date.now()) / 1000));
        },
    };
}

const basePayload = (): SessionPayload => ({
    v: SESSION_PAYLOAD_VERSION,
    userId: 'user-42',
    scopes: ['channel.verify'],
    issuedAt: 1700000000000,
    rotationCount: 0,
});

describe('SessionPayload serialization', () => {
    it('round-trips a v1 payload', () => {
        const p = basePayload();
        const out = deserializePayload(serializePayload(p));
        expect(out).toEqual(p);
    });

    it('rejects future versions with a forward guard', () => {
        const p = { ...basePayload(), v: SESSION_PAYLOAD_VERSION + 1 };
        expect(() => deserializePayload(serializePayload(p))).toThrow(
            /Unsupported session payload version/
        );
    });

    it('throws LegacySessionError for raw v0 values', () => {
        expect(() => deserializePayload('user-42')).toThrow(LegacySessionError);
        expect(() => deserializePayload('12345')).toThrow(LegacySessionError);
    });

    it('migrates a legacy v0 value into a v1 payload', () => {
        const m = migrateLegacySession('user-42');
        expect(m.v).toBe(SESSION_PAYLOAD_VERSION);
        expect(m.userId).toBe('user-42');
        expect(m.scopes).toEqual([]);
        expect(m.rotationCount).toBe(0);
    });
});

describe('createSession / readSession (v1)', () => {
    it('writes parseable v1 JSON with scopes', async () => {
        const redis = mockRedis();
        const token = await createSession('user-42', redis as any, 60, ['channel.verify']);
        const raw = redis.store.get(getBlindedRedisKey(token))!.value;
        const parsed = JSON.parse(raw);
        expect(parsed.v).toBe(SESSION_PAYLOAD_VERSION);
        expect(parsed.userId).toBe('user-42');
        expect(parsed.scopes).toEqual(['channel.verify']);
    });

    it('reads back a v1 session', async () => {
        const redis = mockRedis();
        const token = await createSession('user-42', redis as any, 60);
        const payload = await readSession(token, redis as any);
        expect(payload?.userId).toBe('user-42');
        expect(payload?.v).toBe(SESSION_PAYLOAD_VERSION);
    });

    it('lazily migrates a legacy v0 session and writes it back with remaining TTL', async () => {
        const redis = mockRedis();
        const key = getBlindedRedisKey('legacy-token');
        redis.store.set(key, { value: 'legacy-user', expiresAt: Date.now() + 60_000 });

        const payload = await readSession('legacy-token', redis as any);
        expect(payload?.userId).toBe('legacy-user');
        expect(payload?.v).toBe(SESSION_PAYLOAD_VERSION);

        // Redis now holds the upgraded v1 JSON, still TTL'd
        const raw = redis.store.get(key)!.value;
        expect(JSON.parse(raw).v).toBe(SESSION_PAYLOAD_VERSION);
        expect(await redis.ttl(key)).toBeGreaterThan(0);
    });

    it('returns null for absent or expired tokens', async () => {
        const redis = mockRedis();
        expect(await readSession('nope', redis as any)).toBeNull();
    });
});

describe('rotateSession (v1 lineage)', () => {
    it('increments rotationCount, records lineage, preserves scopes', async () => {
        const redis = mockRedis();
        const token = await createSession('user-42', redis as any, 60, ['channel.verify']);

        const { newToken, rotationCount } = await rotateSession(token, redis as any, 60);
        expect(rotationCount).toBe(1);

        const payload = await readSession(newToken, redis as any);
        expect(payload?.rotationCount).toBe(1);
        expect(payload?.scopes).toEqual(['channel.verify']);
        expect(payload?.rotatedFrom).toBeDefined();
        expect(payload!.rotatedFrom!).toHaveLength(64); // sha256 hex
    });

    it('keeps the 5-second grace period on the old token', async () => {
        const redis = mockRedis();
        const token = await createSession('user-42', redis as any, 60);
        await rotateSession(token, redis as any, 60);

        const ttl = await redis.ttl(getBlindedRedisKey(token));
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(5);
    });

    it('rotates a legacy v0 session transparently', async () => {
        const redis = mockRedis();
        const key = getBlindedRedisKey('legacy-token');
        redis.store.set(key, { value: 'legacy-user', expiresAt: Date.now() + 60_000 });

        const { newToken, rotationCount } = await rotateSession('legacy-token', redis as any, 60);
        expect(rotationCount).toBe(1);

        const payload = await readSession(newToken, redis as any);
        expect(payload?.userId).toBe('legacy-user');
    });

    it('throws on expired or absent tokens', async () => {
        const redis = mockRedis();
        await expect(rotateSession('missing', redis as any, 60)).rejects.toThrow(/expired/i);
    });
});
