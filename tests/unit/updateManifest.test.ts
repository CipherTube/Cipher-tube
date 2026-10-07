/**
 * Phase 4 / Track B (B1) unit tests: update manifest + audience bucketing.
 */
import { isAudienceEnabled, currentManifest, _clearOverrideCacheForTests } from '../../src/governance/updateManifest';

describe('isAudienceEnabled (deterministic bucketing)', () => {
    test('assigns the same bucket to the same client id every time', () => {
        const first = isAudienceEnabled('device-123', 50);
        for (let i = 0; i < 20; i++) {
            expect(isAudienceEnabled('device-123', 50)).toBe(first);
        }
    });

    test('at 100% stage everyone is eligible; at 0% (hold) nobody is', () => {
        const ids = ['a', 'b', 'c', 'd', 'e'];
        ids.forEach((id) => expect(isAudienceEnabled(id, 100)).toBe(true));
        ids.forEach((id) => expect(isAudienceEnabled(id, 0)).toBe(false));
    });

    test('roughly honors the stage percent across a large population', () => {
        let eligible = 0;
        const N = 5000;
        for (let i = 0; i < N; i++) {
            if (isAudienceEnabled(`client-${i}`, 10)) eligible++;
        }
        // 10% ± 3 percentage points — deterministic hash, no flaky margin
        expect(eligible / N).toBeGreaterThan(0.07);
        expect(eligible / N).toBeLessThan(0.13);
    });

    test('security floor: clients below minSupportedVersionCode are always eligible', () => {
        expect(isAudienceEnabled('anyone', 0, 10500, 10600)).toBe(true);
        expect(isAudienceEnabled('anyone', 0, 10700, 10600)).toBe(false);
    });
});

describe('currentManifest', () => {
    beforeEach(() => {
        _clearOverrideCacheForTests();
        process.env.APP_VERSION = '1.6.0-alpha.1';
        process.env.APP_VERSION_CODE = '10600';
        delete process.env.CIPHERTUBE_UPDATE_HOLD;
        delete process.env.CIPHERTUBE_UPDATE_STAGE;
    });

    test('defaults: live status, stage 10, no artifacts until published', async () => {
        const m = await currentManifest();
        expect(m.product).toBe('CipherTube');
        expect(m.version).toBe('1.6.0-alpha.1');
        expect(m.versionCode).toBe(10600);
        expect(m.status).toBe('live');
        expect(m.stage).toBe(10);
        expect(m.audiencePercent).toBe(10);
        expect(m.artifacts).toEqual({});
    });

    test('CIPHERTUBE_UPDATE_HOLD=1 is the environment kill switch', async () => {
        process.env.CIPHERTUBE_UPDATE_HOLD = '1';
        const m = await currentManifest();
        expect(m.status).toBe('hold');
    });
});
