/**
 * CipherTube Governance Policy Engine
 * ------------------------------------------------------------------
 * Machine-readable policy rules evaluated at runtime against session
 * and request context. Turns written governance requirements into
 * enforceable controls on the Express/Redis pipeline.
 *
 * Design: rules are data, not code. First matching rule wins; unmatched
 * contexts default to 'allow' (tighten via catch-all rules as needed).
 * Original CipherTube design — no third-party governance dependencies.
 */

export type PolicyAction = 'allow' | 'challenge' | 'block';

export interface PolicyContext {
    /** Gateway route being accessed, e.g. '/v1/channel/verify' */
    route: string;
    /** Scopes attached to the caller's session payload (v1+) */
    scopes: string[];
    /** Session age in seconds, if known */
    sessionAgeSeconds?: number;
    /** Rotation count of the caller's session payload (v1+) */
    rotationCount?: number;
}

export interface PolicyRule {
    id: string;
    description: string;
    match: (ctx: PolicyContext) => boolean;
    action: PolicyAction;
    reason: string;
}

export interface PolicyDecision {
    action: PolicyAction;
    ruleId: string | null;
    reason: string;
}

/** Route pattern supporting a single trailing wildcard, e.g. '/v1/*'. */
function routeMatches(pattern: string, route: string): boolean {
    if (pattern.endsWith('*')) {
        return route.startsWith(pattern.slice(0, -1));
    }
    return pattern === route;
}

/** Rule factory: block requests to a route pattern when a scope is missing. */
export function requireScope(ruleId: string, pattern: string, scope: string): PolicyRule {
    return {
        id: ruleId,
        description: `Requests to ${pattern} require the '${scope}' scope.`,
        match: (ctx) => routeMatches(pattern, ctx.route) && !ctx.scopes.includes(scope),
        action: 'block',
        reason: `missing required scope: ${scope}`,
    };
}

/** Rule factory: force re-validation for sessions older than maxAgeSeconds. */
export function maxSessionAge(ruleId: string, maxAgeSeconds: number): PolicyRule {
    return {
        id: ruleId,
        description: `Sessions older than ${maxAgeSeconds}s must re-validate.`,
        match: (ctx) =>
            ctx.sessionAgeSeconds !== undefined && ctx.sessionAgeSeconds > maxAgeSeconds,
        action: 'challenge',
        reason: `session age exceeds ${maxAgeSeconds}s`,
    };
}

/** Rule factory: block sessions with insufficient rotation history. */
export function requireRotation(ruleId: string, minRotations: number): PolicyRule {
    return {
        id: ruleId,
        description: `Sessions with fewer than ${minRotations} rotations are blocked.`,
        match: (ctx) =>
            ctx.rotationCount !== undefined && ctx.rotationCount < minRotations,
        action: 'block',
        reason: `insufficient rotation count (minimum ${minRotations})`,
    };
}

/** Evaluate a context against an ordered rule set. First match wins. */
export function evaluatePolicies(ctx: PolicyContext, rules: PolicyRule[]): PolicyDecision {
    for (const rule of rules) {
        if (rule.match(ctx)) {
            return { action: rule.action, ruleId: rule.id, reason: rule.reason };
        }
    }
    return { action: 'allow', ruleId: null, reason: 'no policy matched — default allow' };
}

/**
 * Baseline rule set. OPT-IN: the scope rule must not be enforced until
 * scope issuance (createSession scopes) is rolled out to all clients.
 */
export const BASELINE_RULES: PolicyRule[] = [
    maxSessionAge('baseline.session-age', 60 * 60 * 12), // 12h re-validation
];
