import { describe, it, expect } from 'vitest';
import {
    evaluatePolicies,
    requireScope,
    maxSessionAge,
    requireRotation,
} from '../../src/governance/policyEngine';
import { AuditTrail, GENESIS_HASH } from '../../src/governance/auditTrail';

describe('governance policy engine', () => {
    it('allows when no rule matches', () => {
        const d = evaluatePolicies({ route: '/health', scopes: [] }, []);
        expect(d.action).toBe('allow');
        expect(d.ruleId).toBeNull();
    });

    it('blocks a route when the required scope is missing', () => {
        const rule = requireScope('r1', '/v1/channel/*', 'channel.verify');
        const d = evaluatePolicies({ route: '/v1/channel/verify', scopes: [] }, [rule]);
        expect(d.action).toBe('block');
        expect(d.ruleId).toBe('r1');
    });

    it('allows when the required scope is present', () => {
        const rule = requireScope('r1', '/v1/channel/*', 'channel.verify');
        const d = evaluatePolicies(
            { route: '/v1/channel/verify', scopes: ['channel.verify'] },
            [rule]
        );
        expect(d.action).toBe('allow');
    });

    it('does not match the scope rule on other routes', () => {
        const rule = requireScope('r1', '/v1/channel/*', 'channel.verify');
        const d = evaluatePolicies({ route: '/v1/other', scopes: [] }, [rule]);
        expect(d.action).toBe('allow');
    });

    it('challenges sessions older than the max age', () => {
        const d = evaluatePolicies(
            { route: '/x', scopes: [], sessionAgeSeconds: 50000 },
            [maxSessionAge('r2', 3600)]
        );
        expect(d.action).toBe('challenge');
        expect(d.ruleId).toBe('r2');
    });

    it('first matching rule wins', () => {
        const rules = [maxSessionAge('age', 60), requireScope('scope', '/x', 's')];
        const d = evaluatePolicies({ route: '/x', scopes: [], sessionAgeSeconds: 500 }, rules);
        expect(d.ruleId).toBe('age');
    });

    it('blocks sessions with insufficient rotations', () => {
        const d = evaluatePolicies(
            { route: '/x', scopes: [], rotationCount: 0 },
            [requireRotation('r3', 1)]
        );
        expect(d.action).toBe('block');
    });
});

describe('hash-chained audit trail', () => {
    it('builds a verifiable chain from genesis', () => {
        const t = new AuditTrail();
        t.append({ type: 'session.create', actor: 'ab12', outcome: 'success' });
        t.append({
            type: 'session.rotate',
            actor: 'ab12',
            outcome: 'success',
            detail: { rotationCount: 1 },
        });
        t.append({
            type: 'policy.block',
            actor: 'cd34',
            outcome: 'failure',
            detail: { ruleId: 'r1' },
        });

        expect(t.length).toBe(3);
        expect(t.verify()).toBe(true);
        expect(t.toJSON()[0].prevHash).toBe(GENESIS_HASH);
        // Chain linkage: each record commits its predecessor
        expect(t.toJSON()[1].prevHash).toBe(t.toJSON()[0].entryHash);
        expect(t.toJSON()[2].prevHash).toBe(t.toJSON()[1].entryHash);
    });

    it('detects tampering and reports the first tampered sequence', () => {
        const t = new AuditTrail();
        t.append({ type: 'session.create', actor: 'ab12', outcome: 'success' });
        t.append({ type: 'session.rotate', actor: 'ab12', outcome: 'success' });

        (t.toJSON()[0] as any).outcome = 'failure'; // retroactive edit
        expect(t.verify()).toBe(false);
        expect(t.firstTamperedSequence()).toBe(0);
    });

    it('detects record reordering', () => {
        const t = new AuditTrail();
        t.append({ type: 'session.create', actor: 'ab12', outcome: 'success' });
        t.append({ type: 'session.rotate', actor: 'ab12', outcome: 'success' });
        t.append({ type: 'session.verify', actor: 'ab12', outcome: 'success' });

        const json = t.toJSON();
        const reordered = new AuditTrail();
        (reordered as any).records = [json[1], json[0], json[2]];
        expect(reordered.verify()).toBe(false);
    });
});
