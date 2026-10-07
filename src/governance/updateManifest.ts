/**
 * CipherTube Update Manifest (Phase 4 — Track B, item B1)
 * ------------------------------------------------------------------
 * Serves the current client version + rollout audience flags for the
 * Android/desktop distribution channels. Prerequisite for public APK
 * distribution (BUILD.md release gate).
 *
 * Staged rollout model:
 *   stage = 10 | 50 | 100  — percent of clients offered the update
 *   hold  = kill switch    — freezes distribution instantly without a
 *                            redeploy (runtime override via Redis)
 *
 * Audience assignment is deterministic: a client id is bucketed by
 * SHA-256 (ct-update prefix), so a given device always lands in the
 * same bucket — no sticky state, no per-device records, no PII.
 *
 * Configuration precedence (highest wins):
 *   1. Redis runtime overrides: ct:update:stage / ct:update:hold
 *      (cached 30s) — the kill switch can be flipped live.
 *   2. Environment: CIPHERTUBE_UPDATE_STAGE / CIPHERTUBE_UPDATE_HOLD,
 *      APP_VERSION, APP_VERSION_CODE, CIPHERTUBE_MIN_VERSION_CODE,
 *      CIPHERTUBE_APK_URL, CIPHERTUBE_DESKTOP_URL.
 *
 * Original CipherTube design.
 */
import crypto from 'crypto';
import { cache } from '../cache/redisPool';

export interface UpdateManifest {
    product: 'CipherTube';
    /** Semver of the current release build. */
    version: string;
    /** Integer version code (BUILD.md: 1.6.0 -> 10600). */
    versionCode: number;
    /** 'live' serves updates; 'hold' is the kill switch — clients stay put. */
    status: 'live' | 'hold';
    /** Rollout stage: percent of the audience offered the update. */
    stage: 10 | 50 | 100;
    /** Convenience mirror of stage for clients. */
    audiencePercent: number;
    /** Clients below this versionCode must update regardless of stage. */
    minSupportedVersionCode: number;
    /** Artifact URLs when published (absent until the first signed release). */
    artifacts: { android?: string; desktop?: string };
    /** Suggested poll cadence — respects the gateway's rate posture. */
    checkIntervalSeconds: number;
    generatedAt: number;
}

const OVERRIDE_CACHE_MS = 30_000;
let overrideCache: { at: number; stage?: number; hold?: boolean } | null = null;

interface RuntimeOverrides {
    stage?: number;
    hold?: boolean;
}

async function readOverrides(force: boolean = false): Promise<RuntimeOverrides> {
    const fresh = overrideCache && Date.now() - overrideCache.at < OVERRIDE_CACHE_MS;
    if (!force && fresh && overrideCache) {
        const { at: _at, ...values } = overrideCache;
        return values;
    }
    const result: RuntimeOverrides = {};
    try {
        if (cache.rawClient.isOpen) {
            const [stage, hold] = await Promise.all([
                cache.get('ct:update:stage'),
                cache.get('ct:update:hold'),
            ]);
            if (stage !== null && ['10', '50', '100'].includes(stage)) {
                result.stage = Number(stage) as 10 | 50 | 100;
            }
            if (hold !== null) result.hold = hold === '1' || hold === 'true';
        }
    } catch {
        /* cache pool down: fall through to environment defaults */
    }
    overrideCache = { at: Date.now(), ...result };
    return result;
}

/** Test seam: clear the override cache between cases. */
export function _clearOverrideCacheForTests(): void {
    overrideCache = null;
}

function stageFromEnv(): 10 | 50 | 100 {
    const raw = Number(process.env.CIPHERTUBE_UPDATE_STAGE ?? 10);
    return raw === 50 || raw === 100 ? (raw as 50 | 100) : 10;
}

/**
 * Build the current manifest. Environment sets the base; live Redis
 * overrides (kill switch / stage bump) win when present.
 */
export async function currentManifest(): Promise<UpdateManifest> {
    const overrides = await readOverrides();
    const stage = (overrides.stage ?? stageFromEnv()) as 10 | 50 | 100;
    const hold = overrides.hold ?? process.env.CIPHERTUBE_UPDATE_HOLD === '1';

    const artifacts: UpdateManifest['artifacts'] = {};
    if (process.env.CIPHERTUBE_APK_URL) artifacts.android = process.env.CIPHERTUBE_APK_URL;
    if (process.env.CIPHERTUBE_DESKTOP_URL) artifacts.desktop = process.env.CIPHERTUBE_DESKTOP_URL;

    return {
        product: 'CipherTube',
        version: process.env.APP_VERSION ?? '1.6.0-alpha.1',
        versionCode: Number(process.env.APP_VERSION_CODE ?? 10600),
        status: hold ? 'hold' : 'live',
        stage,
        audiencePercent: stage,
        minSupportedVersionCode: Number(process.env.CIPHERTUBE_MIN_VERSION_CODE ?? 0),
        artifacts,
        checkIntervalSeconds: 3600,
        generatedAt: Date.now(),
    };
}

/**
 * Deterministic audience assignment: stable per client id, stateless on
 * the server. A client is eligible when its bucket index falls within
 * the current stage. Clients below minSupportedVersionCode are always
 * eligible (security floor), regardless of stage.
 */
export function isAudienceEnabled(
    clientId: string,
    audiencePercent: number,
    currentVersionCode?: number,
    minSupportedVersionCode: number = 0
): boolean {
    if (
        typeof currentVersionCode === 'number' &&
        currentVersionCode < minSupportedVersionCode
    ) {
        return true; // security floor: outdated clients must update
    }
    const digest = crypto
        .createHash('sha256')
        .update(`ct-update:${clientId}`)
        .digest('hex');
    const bucket = parseInt(digest.slice(0, 8), 16) % 100;
    return bucket < audiencePercent;
}
