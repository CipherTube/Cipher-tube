/**
 * Phase 4 / Track C unit tests: metrics counters.
 * Uses an in-memory Redis stub via the test seam — no live cache needed.
 * A fresh module import per test keeps counter state isolated.
 */
import type * as Metrics from '../../src/governance/metricsCounters';

function memoryClient() {
    const store = new Map<string, string>();
    const expiry = new Map<string, number>();
    const base = {
        store,
        get: async (key: string) => {
            if (expiry.has(key) && (expiry.get(key) as number) < Date.now()) return null;
            return store.get(key) ?? null;
        },
        incr: async (key: string) => {
            const next = Number(store.get(key) ?? 0) + 1;
            store.set(key, String(next));
            return next;
        },
        expire: async (key: string, seconds: number) => {
            expiry.set(key, Date.now() + seconds * 1000);
            return true;
        },
    };
    return {
        ...base,
        isOpen: true,
        multi() {
            const ops: Array<() => Promise<unknown>> = [];
            return {
                incr: (key: string) => { ops.push(() => base.incr(key)); return this; },
                expire: (key: string, s: number) => { ops.push(() => base.expire(key, s)); return this; },
                exec: async () => { const out = []; for (const op of ops) out.push(await op()); return out; },
            };
        },
    };
}

async function freshModule() {
    jest.resetModules();
    return await import('../../src/governance/metricsCounters');
}

describe('metricsCounters (C1)', () => {
    test('bump() tallies locally when the cache pool is down (failover)', async () => {
        const m = await freshModule();
        m._setRawClientForTests({ isOpen: false });
        m.bump(m.POLICY_COUNTERS.allow);
        m.bump(m.POLICY_COUNTERS.allow);
        m.bump(m.POLICY_COUNTERS.block);
        const snap = await m.metricsSnapshot();
        expect(snap.counters['policy.decision.allow']).toBe(2);
        expect(snap.counters['policy.decision.block']).toBe(1);
        expect(snap.degraded).toBe(true);
    });

    test('bump() writes windowed Redis counters when the pool is up', async () => {
        const m = await freshModule();
        const client = memoryClient();
        m._setRawClientForTests(client as any);
        for (let i = 0; i < 5; i++) m.bump('policy.decision.challenge');
        const snap = await m.metricsSnapshot();
        expect(snap.degraded).toBe(false);
        expect(snap.counters['policy.decision.challenge']).toBe(5);
    });

    test('policyNonAllowRatio computes challenge+block share', async () => {
        const m = await freshModule();
        m._setRawClientForTests({ isOpen: false });
        m.bump(m.POLICY_COUNTERS.allow); m.bump(m.POLICY_COUNTERS.allow); m.bump(m.POLICY_COUNTERS.allow);
        m.bump(m.POLICY_COUNTERS.challenge);
        m.bump(m.POLICY_COUNTERS.block);
        const snap = await m.metricsSnapshot();
        expect(snap.policyNonAllowRatio).toBeCloseTo(2 / 5);
    });

    test('observeLatency yields p50/p99 and evicts aged samples', async () => {
        const m = await freshModule();
        m._setRawClientForTests({ isOpen: false });
        const now = Date.now();
        for (let i = 1; i <= 100; i++) m.observeLatency('/mcp', i, now - i * 100);
        // aged beyond the 5-minute window: must be evicted, not skew percentiles
        m.observeLatency('/mcp', 9999, now - 6 * 60 * 1000);
        const snap = await m.metricsSnapshot();
        const lat = snap.routeLatency['/mcp'];
        expect(lat.count).toBe(100);
        expect(lat.p50).toBe(50);
        expect(lat.p99).toBe(99);
    });

    test('bump() never throws even with a broken client', async () => {
        const m = await freshModule();
        m._setRawClientForTests({
            isOpen: true,
            multi() { throw new Error('pool exploded'); },
        } as any);
        expect(() => m.bump('anything')).not.toThrow();
    });
});
