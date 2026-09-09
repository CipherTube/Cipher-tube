/**
 * Versioned Session Payload — ASSESSMENT.md §3, Priority 1.
 *
 * Migrates session storage from a raw `userId` string (v0) to a typed,
 * versioned payload. Redis values under `session:<sha256(token)>` become
 * deterministic JSON documents, enabling multi-scope tokens, rotation
 * lineage tracking, and forward-compatible schema evolution.
 *
 * Version contract:
 *   - Absent/invalid `v` field => legacy v0 value (raw userId) — migrate on access.
 *   - `v` greater than SESSION_PAYLOAD_VERSION => reject (forward guard).
 */

export const SESSION_PAYLOAD_VERSION = 1;

export interface SessionPayload {
    /** Schema version (starts at 1) */
    v: number;
    userId: string;
    scopes: string[];
    /** Epoch ms when this payload was issued */
    issuedAt: number;
    /** Blinded hash of the previous token (rotation lineage) */
    rotatedFrom?: string;
    rotationCount: number;
}

/** Thrown when a Redis value is a legacy v0 raw userId rather than a payload. */
export class LegacySessionError extends Error {
    constructor(public readonly legacyValue: string) {
        super('Legacy v0 session value (raw user id) — migrate on access.');
        this.name = 'LegacySessionError';
    }
}

/**
 * Serialize with deterministic field ordering so identical payloads
 * always produce identical bytes (stable hashing, diffable logs).
 */
export function serializePayload(payload: SessionPayload): string {
    return JSON.stringify({
        v: payload.v,
        userId: payload.userId,
        scopes: payload.scopes,
        issuedAt: payload.issuedAt,
        rotatedFrom: payload.rotatedFrom,
        rotationCount: payload.rotationCount,
    });
}

/** Parse and validate a raw Redis value. Throws LegacySessionError for v0 values. */
export function deserializePayload(raw: string): SessionPayload {
    let parsed: any;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new LegacySessionError(raw);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new LegacySessionError(raw);
    }
    if (typeof parsed.v !== 'number') {
        // Absent version marker = legacy v0 value
        throw new LegacySessionError(raw);
    }
    if (parsed.v > SESSION_PAYLOAD_VERSION) {
        throw new Error(
            `Unsupported session payload version: ${parsed.v} (max supported: ${SESSION_PAYLOAD_VERSION})`
        );
    }
    if (typeof parsed.userId !== 'string' || !parsed.userId) {
        throw new Error('Session payload missing userId');
    }
    if (!Array.isArray(parsed.scopes)) {
        throw new Error('Session payload scopes must be an array');
    }
    if (typeof parsed.issuedAt !== 'number' || typeof parsed.rotationCount !== 'number') {
        throw new Error('Session payload issuedAt/rotationCount must be numbers');
    }
    const payload: SessionPayload = {
        v: parsed.v,
        userId: parsed.userId,
        scopes: parsed.scopes,
        issuedAt: parsed.issuedAt,
        rotationCount: parsed.rotationCount,
    };
    // Omit lineage key when absent so round-tripped payloads keep an exact shape.
    if (parsed.rotatedFrom !== undefined) {
        payload.rotatedFrom = parsed.rotatedFrom;
    }
    return payload;
}

/**
 * Wrap a legacy v0 raw userId into a v1 payload.
 * Scopes start empty; lineage starts at zero rotations.
 */
export function migrateLegacySession(raw: string, now: number = Date.now()): SessionPayload {
    return {
        v: SESSION_PAYLOAD_VERSION,
        userId: raw,
        scopes: [],
        issuedAt: now,
        rotationCount: 0,
    };
}
