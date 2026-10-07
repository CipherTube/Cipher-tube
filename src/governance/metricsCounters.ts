/**
 * CipherTube High-Throughput Metrics Counters (Phase 4 — Track C)
 * ------------------------------------------------------------------
 * Native, dependency-free counters for policy decisions, audit
 * events, and per-route latency:
 *
 *   - Counters are windowed Redis INCRs (atomic, TTL'd) so multiple
 *     gateway processes aggregate into one tally. Each 60s bucket is
 *     retained for 24h; no durable analytics vendor, no PII.
 *   - Fire-and-forget: a failed Redis never blocks the request path —
 *     a local in-memory tally keeps counting until the pool returns.
 *   - Latency is an in-process sliding window (5 min, capped samples)
 *     with p50/p99 computed on read. High-throughput by design:
 *     observe() is O(1) amortized and never awaits.
 *
 * Original CipherTube design. Build priority P4 hook.
 */
import { cache } from '../cache/redisPool';

const WINDOW_SECONDS = 60;
const RETENTION_SECONDS = 24 * 60 * 60; // 24h of buckets kept in Redis

/** 5-minute sliding window for latency samples, per route. */
const LATENCY_WINDOW_MS = 5 * 60 * 1000;
const MAX_SAMPLES_PER_ROUTE = 512;

type MutableClient = { isOpen: boolean };

/** Test seam: allow unit tests to substitute an in-memory client. */
let clientOverride: MutableClient | null = null;
export function _setRawClientForTests(client: MutableClient | null): void {
    clientOverride = client;
}
function activeClient(): MutableClient {
    return (clientOverride as any) ?? cache.rawClient;
}

/* ----------------------------- counters ----------------------------- */

const localTallies = new Map<string, number>();
/** Every counter name ever observed in-process (for snapshot enumeration). */
const knownNames = new Set<string>();

function bucketFor(now: number): number {
    return Math.floor(now / (WINDOW_SECONDS * 1000));
}

function redisKey(name: string, bucket: number): string {
    return `ct:metrics:${name}:${bucket}`;
}

/**
 * Increment a named counter. Never throws, never blocks the caller:
 * Redis writes are dispatched without awaiting their completion.
 */
export function bump(name: string, now: number = Date.now()): void {
    knownNames.add(name);
    localTallies.set(name, (localTallies.get(name) ?? 0) + 1);

    const client = activeClient() as any;
    if (!client?.isOpen) return; // local tally keeps the failover count
    try {
        const key = redisKey(name, bucketFor(now));
        void client
            .multi()
            .incr(key)
            .expire(key, RETENTION_SECONDS)
            .exec()
            .catch(() => {
                /* fire-and-forget: local tally is the failover record */
            });
    } catch {
        /* same failover contract as the cache pool */
    }
}

/** Counter names for the standard policy decisions. */
export const POLICY_COUNTERS = {
    allow: 'policy.decision.allow',
    challenge: 'policy.decision.challenge',
    block: 'policy.decision.block',
} as const;

/* ------------------------------ latency ----------------------------- */

interface LatencySample {
    at: number;
    ms: number;
}
const latencyWindows = new Map<string, LatencySample[]>();

/** Drop samples older than the 5-minute window, relative to `now`. */
function evictAged(route: string, now: number): void {
    const window = latencyWindows.get(route);
    if (!window) return;
    const cutoff = now - LATENCY_WINDOW_MS;
    let firstFresh = 0;
    while (firstFresh < window.length && window[firstFresh].at < cutoff) firstFresh++;
    if (firstFresh > 0) window.splice(0, firstFresh);
}

/** Record a latency observation for a route. O(1) amortized, never throws. */
export function observeLatency(route: string, ms: number, now: number = Date.now()): void {
    let window = latencyWindows.get(route);
    if (!window) {
        window = [];
        latencyWindows.set(route, window);
    }
    // Age out relative to the newest sample seen, so an out-of-order
    // (delayed) observation cannot reset the window backwards.
    const latestAt = window.length > 0 ? Math.max(window[window.length - 1].at, window[0].at) : now;
    const reference = Math.max(now, latestAt);
    window.push({ at: now, ms });
    evictAged(route, reference);
    if (window.length > MAX_SAMPLES_PER_ROUTE) {
        window.splice(0, window.length - MAX_SAMPLES_PER_ROUTE);
    }
}

function percentile(samples: LatencySample[], p: number): number | null {
    if (samples.length === 0) return null;
    const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
    // Nearest-rank convention: the ceil(p/100 * N)-th smallest value.
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
}

/* ----------------------------- snapshot ----------------------------- */

export interface MetricsSnapshot {
    windowSeconds: number;
    /** Current+previous window counts per counter name. */
    counters: Record<string, number>;
    /** Share of non-allow policy decisions (0..1). */
    policyNonAllowRatio: number | null;
    /** Per-route latency percentiles over the in-process sliding window. */
    routeLatency: Record<string, { count: number; p50: number | null; p99: number | null }>;
    /** True when counters reflect only this process (Redis pool down). */
    degraded: boolean;
}

/**
 * Read the current + previous 60s windows for every known counter.
 * Falls back to local tallies whenever Redis is unavailable, and says
 * so via `degraded` — callers never need to catch.
 */
export async function metricsSnapshot(now: number = Date.now()): Promise<MetricsSnapshot> {
    const bucket = bucketFor(now);
    const names = [...knownNames];
    const counters: Record<string, number> = {};
    let degraded = true;

    const client = activeClient() as any;
    if (client?.isOpen) {
        degraded = false;
        try {
            const values = await Promise.all(
                names.flatMap((name) =>
                    [bucket, bucket - 1].map((b) =>
                        client.get(redisKey(name, b)).catch(() => {
                            degraded = true;
                            return null;
                        })
                    )
                )
            );
            names.forEach((name, i) => {
                const current = Number(values[i * 2] ?? 0) || 0;
                const previous = Number(values[i * 2 + 1] ?? 0) || 0;
                counters[name] = current + previous;
                if (current === 0 && previous === 0) {
                    // Redis bucket empty: use the local failover tally
                    counters[name] = localTallies.get(name) ?? 0;
                }
            });
        } catch {
            degraded = true;
        }
    }

    if (degraded) {
        for (const name of names) counters[name] = localTallies.get(name) ?? 0;
    }

    // Policy decision ratio: non-allow / total policy decisions.
    const allow = counters[POLICY_COUNTERS.allow] ?? 0;
    const challenge = counters[POLICY_COUNTERS.challenge] ?? 0;
    const block = counters[POLICY_COUNTERS.block] ?? 0;
    const total = allow + challenge + block;
    const policyNonAllowRatio = total > 0 ? (challenge + block) / total : null;

    const routeLatency: MetricsSnapshot['routeLatency'] = {};
    const cutoff = now - LATENCY_WINDOW_MS;
    for (const [route, window] of latencyWindows.entries()) {
        // Read-time filtering: percentiles only ever cover live samples,
        // even when an out-of-order observation slipped past append eviction.
        const fresh = window.filter((sample) => sample.at >= cutoff);
        routeLatency[route] = {
            count: fresh.length,
            p50: percentile(fresh, 50),
            p99: percentile(fresh, 99),
        };
    }

    return { windowSeconds: WINDOW_SECONDS, counters, policyNonAllowRatio, routeLatency, degraded };
}
