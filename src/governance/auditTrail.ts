/**
 * CipherTube Hash-Chained Audit Trail
 * ------------------------------------------------------------------
 * Append-only audit records chained with SHA-256: every entry commits
 * the hash of its predecessor, so any retroactive edit, deletion, or
 * reordering is detectable by re-verifying the chain.
 *
 * Actors are recorded as blinded hashes — raw identifiers never enter
 * the trail (data minimization guardrail).
 *
 * Original CipherTube design. Persistence sink (signed .ctube state
 * files / Redis stream) is planned alongside Priority 4 metrics.
 */
import crypto from 'crypto';

export type AuditOutcome = 'success' | 'failure';

export interface AuditEvent {
    /** Event type, e.g. 'session.create' | 'session.rotate' | 'policy.block' */
    type: string;
    /** Blinded actor hash — never a raw user id or token */
    actor: string;
    outcome: AuditOutcome;
    /** Minimal, non-sensitive structured detail */
    detail?: Record<string, string | number | boolean>;
}

export interface AuditRecord extends AuditEvent {
    timestamp: number;
    sequence: number;
    prevHash: string;
    entryHash: string;
}

export const GENESIS_HASH = '0'.repeat(64);

export function computeEntryHash(
    prevHash: string,
    timestamp: number,
    sequence: number,
    event: AuditEvent
): string {
    const canonical = JSON.stringify({
        type: event.type,
        actor: event.actor,
        outcome: event.outcome,
        detail: event.detail ?? null,
    });
    return crypto
        .createHash('sha256')
        .update(`${prevHash}|${timestamp}|${sequence}|${canonical}`)
        .digest('hex');
}

export class AuditTrail {
    private records: AuditRecord[] = [];

    /** Append an event and extend the chain. Returns the sealed record. */
    append(event: AuditEvent, now: number = Date.now()): AuditRecord {
        const prevHash =
            this.records.length > 0
                ? this.records[this.records.length - 1].entryHash
                : GENESIS_HASH;
        const sequence = this.records.length;
        const entryHash = computeEntryHash(prevHash, now, sequence, event);
        const record: AuditRecord = { ...event, timestamp: now, sequence, prevHash, entryHash };
        this.records.push(record);
        return record;
    }

    /** Re-verify the full chain. False on any tampering. */
    verify(): boolean {
        return this.firstTamperedSequence() === -1;
    }

    /** Sequence number of the first tampered record, or -1 if intact. */
    firstTamperedSequence(): number {
        let prevHash = GENESIS_HASH;
        for (const rec of this.records) {
            if (rec.prevHash !== prevHash) return rec.sequence;
            if (computeEntryHash(rec.prevHash, rec.timestamp, rec.sequence, rec) !== rec.entryHash) {
                return rec.sequence;
            }
            prevHash = rec.entryHash;
        }
        return -1;
    }

    toJSON(): AuditRecord[] {
        return [...this.records];
    }

    get length(): number {
        return this.records.length;
    }
}
