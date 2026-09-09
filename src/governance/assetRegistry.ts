/**
 * CipherTube Governance Asset Registry
 * ------------------------------------------------------------------
 * Machine-readable inventory of gateway components and the data they
 * process — the record-keeping backbone for compliance reporting.
 * Each entry declares what data a component touches so impact reviews
 * and erasure requests can be traced to concrete code paths.
 *
 * Original CipherTube design. Update entries via PR (rules of
 * engagement: governance changes are auditable like code).
 */

export type Criticality = 'high' | 'medium' | 'low';

export type AssetCategory =
    | 'session'
    | 'crypto'
    | 'gateway'
    | 'governance'
    | 'datastore'
    | 'observability'
    | 'ui';

export interface AssetRecord {
    id: string;
    name: string;
    category: AssetCategory;
    criticality: Criticality;
    description: string;
    /** Classes of data the component processes — used in impact and erasure reviews */
    dataProcessed: string[];
    /** Source module or route */
    module: string;
}

export const GATEWAY_ASSETS: AssetRecord[] = [
    {
        id: 'session-store',
        name: 'Session Store (blinded Redis payloads)',
        category: 'session',
        criticality: 'high',
        description:
            'Versioned session payloads stored under blinded keys; TTL-managed with rotation lineage.',
        dataProcessed: ['blinded session hashes', 'user ids', 'scopes', 'rotation lineage'],
        module: 'src/session_rotator.ts, src/session/payload.ts',
    },
    {
        id: 'proof-verifier',
        name: 'Cryptographic Proof Verifier',
        category: 'crypto',
        criticality: 'high',
        description: 'ZK structural validation of cipher proofs bound to request hashes.',
        dataProcessed: ['cipher proofs', 'state hashes'],
        module: 'src/crypto/verifier.ts',
    },
    {
        id: 'gateway-middleware',
        name: 'CipherTube Gateway Middleware',
        category: 'gateway',
        criticality: 'high',
        description: 'Per-request validation layer between clients and protected routes.',
        dataProcessed: ['proof headers', 'state hashes', 'verified-state cache entries'],
        module: 'src/gateway/sessionMiddleware.ts',
    },
    {
        id: 'policy-engine',
        name: 'Governance Policy Engine',
        category: 'governance',
        criticality: 'high',
        description: 'Policy-as-code evaluation (allow / challenge / block) over request context.',
        dataProcessed: ['routes', 'session scopes', 'session age', 'rotation counts'],
        module: 'src/governance/policyEngine.ts',
    },
    {
        id: 'audit-trail',
        name: 'Hash-Chained Audit Trail',
        category: 'governance',
        criticality: 'high',
        description: 'Append-only tamper-evident record of session and policy events.',
        dataProcessed: ['blinded actor hashes', 'policy decisions', 'event metadata'],
        module: 'src/governance/auditTrail.ts',
    },
    {
        id: 'gateway-guard',
        name: 'Governance Gateway Guard',
        category: 'governance',
        criticality: 'medium',
        description: 'Mounts policy evaluation on guarded routes and audits non-allow decisions.',
        dataProcessed: ['request routes', 'policy decisions'],
        module: 'src/governance/gatewayGuard.ts',
    },
    {
        id: 'redis-pool',
        name: 'Redis Cache Pool',
        category: 'datastore',
        criticality: 'high',
        description: 'Primary datastore for sessions, verified-state cache, and future audit sink.',
        dataProcessed: ['session payloads', 'state hashes', 'rate-limit counters'],
        module: 'src/cache/redisPool.ts',
    },
    {
        id: 'analytics-endpoint',
        name: 'Telemetry Endpoint',
        category: 'observability',
        criticality: 'medium',
        description: 'Guarded diagnostics: uptime, heap, cache pool, audit chain health.',
        dataProcessed: ['process metrics', 'cache status', 'audit chain length'],
        module: '/system/analytics (src/gatewayServer.ts)',
    },
    {
        id: 'health-probes',
        name: 'Liveness & Readiness Probes',
        category: 'observability',
        criticality: 'low',
        description: 'Unguarded LB/orchestrator probes exposing no sensitive data.',
        dataProcessed: ['uptime', 'cache ping result'],
        module: '/health, /ready (src/gatewayServer.ts)',
    },
    {
        id: 'static-ui-bundle',
        name: 'Static UI Bundle',
        category: 'ui',
        criticality: 'low',
        description: 'Extracted static client assets served under /ui (Phase 0).',
        dataProcessed: ['none (static assets only)'],
        module: 'ui/public/, /sw.js',
    },
];

/** Look up a single asset by id. */
export function getAsset(id: string): AssetRecord | undefined {
    return GATEWAY_ASSETS.find((a) => a.id === id);
}

/** All assets at a given criticality tier. */
export function assetsByCriticality(level: Criticality): AssetRecord[] {
    return GATEWAY_ASSETS.filter((a) => a.criticality === level);
}

/**
 * Inventory summary for compliance reporting: counts by tier plus the
 * list of high-criticality component ids (the "crown jewels" set).
 */
export function inventorySummary(): {
    total: number;
    byCriticality: Record<Criticality, number>;
    highCriticalityIds: string[];
} {
    const byCriticality: Record<Criticality, number> = { high: 0, medium: 0, low: 0 };
    for (const a of GATEWAY_ASSETS) byCriticality[a.criticality] += 1;
    return {
        total: GATEWAY_ASSETS.length,
        byCriticality,
        highCriticalityIds: assetsByCriticality('high').map((a) => a.id),
    };
}
