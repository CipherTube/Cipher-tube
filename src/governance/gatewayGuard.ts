/**
 * CipherTube Governance Gateway Guard
 * ------------------------------------------------------------------
 * Composable Express middleware that applies the policy engine to
 * guarded routes and records every non-allow decision in the
 * hash-chained audit trail.
 *
 * Safety contract: DEFAULT-ALLOW. The active rule set is empty unless
 * CT_GOVERNANCE_RULES=baseline is set in the environment, so wiring
 * this in never changes behavior until rules are deliberately enabled.
 *
 * Mount order: cipherTubeGateway (ZK validation) -> governanceGuard
 * (policy + audit) -> route handler.
 */
import { Request, Response, NextFunction } from 'express';
import {
    evaluatePolicies,
    BASELINE_RULES,
    PolicyContext,
    PolicyRule,
} from './policyEngine';
import { AuditTrail, AuditEvent } from './auditTrail';

/** Shared governance audit trail (hash-chained, tamper-evident). */
export const governanceAudit = new AuditTrail();

/**
 * Active rule set. Opt-in via CT_GOVERNANCE_RULES=baseline.
 * Rules are data: deployments extend this with their own sets.
 */
export function activeRules(): PolicyRule[] {
    return process.env.CT_GOVERNANCE_RULES === 'baseline' ? BASELINE_RULES : [];
}

/**
 * Build the policy context from the request. Session-scoped fields
 * (scopes, rotationCount) arrive via req.session* once session auth
 * integration lands (P1 payloads); until then they are undefined and
 * rules that depend on them simply do not match.
 */
export function buildPolicyContext(req: Request): PolicyContext {
    const cipherState = (req as any).cipherState as { originEpoch?: number } | undefined;
    const sessionAgeSeconds =
        cipherState && typeof cipherState.originEpoch === 'number'
            ? Math.max(0, Math.round((Date.now() - cipherState.originEpoch) / 1000))
            : undefined;
    return {
        route: req.path,
        scopes: (req as any).sessionScopes ?? [],
        sessionAgeSeconds,
        rotationCount: (req as any).sessionRotationCount,
    };
}

/**
 * Governance guard middleware. Evaluates policy, audits non-allow
 * decisions, and enforces the decision.
 */
export function governanceGuard(req: Request, res: Response, next: NextFunction) {
    const decision = evaluatePolicies(buildPolicyContext(req), activeRules());

    if (decision.action === 'allow') {
        return next();
    }

    // Rule of engagement: every block/challenge decision is auditable.
    governanceAudit.append({
        type: `policy.${decision.action}`,
        actor: 'gateway', // system actor; session-bound actors use blinded hashes
        outcome: 'failure',
        detail: {
            route: req.path,
            ruleId: decision.ruleId ?? 'unknown',
        },
    });

    if (decision.action === 'block') {
        return res.status(403).json({
            status: 'denied',
            governance: decision.reason,
            ruleId: decision.ruleId,
        });
    }

    // challenge — force re-validation (hooks into P3 handshake when it lands)
    return res.status(401).json({
        status: 'challenge_required',
        governance: decision.reason,
        ruleId: decision.ruleId,
    });
}
