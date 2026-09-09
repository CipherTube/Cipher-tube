import { describe, it, expect } from 'vitest';
import {
    GATEWAY_ASSETS,
    getAsset,
    assetsByCriticality,
    inventorySummary,
    AssetRecord,
} from '../../src/governance/assetRegistry';

describe('governance asset registry', () => {
    it('has unique ids for every asset', () => {
        const ids = GATEWAY_ASSETS.map((a) => a.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('every asset declares data classes and a source module', () => {
        for (const a of GATEWAY_ASSETS as AssetRecord[]) {
            expect(a.dataProcessed.length).toBeGreaterThan(0);
            expect(a.module.length).toBeGreaterThan(0);
            expect(['high', 'medium', 'low']).toContain(a.criticality);
        }
    });

    it('looks up an asset by id', () => {
        expect(getAsset('session-store')?.category).toBe('session');
        expect(getAsset('does-not-exist')).toBeUndefined();
    });

    it('filters by criticality tier', () => {
        const high = assetsByCriticality('high');
        expect(high.length).toBeGreaterThan(0);
        expect(high.every((a) => a.criticality === 'high')).toBe(true);
    });

    it('summarizes the inventory consistently', () => {
        const s = inventorySummary();
        expect(s.total).toBe(GATEWAY_ASSETS.length);
        expect(s.byCriticality.high + s.byCriticality.medium + s.byCriticality.low).toBe(s.total);
        expect(s.highCriticalityIds).toEqual(assetsByCriticality('high').map((a) => a.id));
        // Core compliance record-keeping components are always present
        expect(s.highCriticalityIds).toContain('session-store');
        expect(s.highCriticalityIds).toContain('audit-trail');
        expect(s.highCriticalityIds).toContain('policy-engine');
    });
});
