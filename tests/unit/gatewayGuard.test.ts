import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { governanceGuard, activeRules, buildPolicyContext, governanceAudit } from '../../src/governance/gatewayGuard';

function mockReq(overrides: Record<string, any> = {}) {
    return { path: '/v1/channel/verify', headers: {}, ...overrides } as any;
}

function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
}

describe('governance gateway guard', () => {
    const originalEnv = process.env.CT_GOVERNANCE_RULES;

    afterEach(() => {
        if (originalEnv === undefined) delete process.env.CT_GOVERNANCE_RULES;
        else process.env.CT_GOVERNANCE_RULES = originalEnv;
    });

    it('is default-allow when no rule set is enabled', () => {
        delete process.env.CT_GOVERNANCE_RULES;
        expect(activeRules()).toHaveLength(0);

        const next = vi.fn();
        governanceGuard(mockReq(), mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it('applies baseline rules when CT_GOVERNANCE_RULES=baseline', () => {
        process.env.CT_GOVERNANCE_RULES = 'baseline';
        expect(activeRules().length).toBeGreaterThan(0);
    });

    it('challenges sessions older than the baseline max age and audits the decision', () => {
        process.env.CT_GOVERNANCE_RULES = 'baseline';
        const twelveHours = 60 * 60 * 12;
        const req = mockReq({ cipherState: { originEpoch: Date.now() - (twelveHours + 60) * 1000 } });
        const res = mockRes();
        const next = vi.fn();
        const trailLengthBefore = governanceAudit.length;

        governanceGuard(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(governanceAudit.length).toBe(trailLengthBefore + 1);
        const last = governanceAudit.toJSON()[governanceAudit.length - 1];
        expect(last.type).toBe('policy.challenge');
        expect(last.outcome).toBe('failure');
    });

    it('allows fresh sessions under baseline rules', () => {
        process.env.CT_GOVERNANCE_RULES = 'baseline';
        const req = mockReq({ cipherState: { originEpoch: Date.now() } });
        const next = vi.fn();
        governanceGuard(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it('derives session age from cipherState.originEpoch', () => {
        const req = mockReq({ cipherState: { originEpoch: Date.now() - 120_000 } });
        const ctx = buildPolicyContext(req);
        expect(ctx.sessionAgeSeconds).toBeGreaterThanOrEqual(119);
        expect(ctx.sessionAgeSeconds).toBeLessThanOrEqual(121);
        expect(ctx.route).toBe('/v1/channel/verify');
    });

    it('keeps the audit chain verifiable across guard activity', () => {
        expect(governanceAudit.verify()).toBe(true);
    });
});
