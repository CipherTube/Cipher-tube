import { createHash } from 'node:crypto';

export interface LedgerEntry {
  id: string;
  timestamp: number;
  actorId: string;
  action: string;
  resource: string;
  payload: unknown;
  result: unknown;
  prevHash: string;
  hash: string;
}

export interface Snapshot {
  id: string;
  timestamp: number;
  stateHash: string;
  entryCount: number;
}

/**
 * Append-only hash-chained ledger. No deletes, no updates: an entry can only be
 * added on top of the previous hash, so tampering breaks verifyChain().
 */
export class AuditLedger {
  private entries: LedgerEntry[] = [];
  private lastKnownGood: Snapshot | null = null;

  append(input: Omit<LedgerEntry, 'prevHash' | 'hash'>): LedgerEntry {
    const prevHash = this.entries.at(-1)?.hash ?? 'GENESIS';
    const body = { ...input, prevHash };
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const entry: LedgerEntry = { ...body, hash };
    this.entries.push(entry);
    return entry;
  }

  snapshot(id: string): Snapshot {
    const snap: Snapshot = {
      id,
      timestamp: Date.now(),
      stateHash: this.entries.at(-1)?.hash ?? 'GENESIS',
      entryCount: this.entries.length,
    };
    this.lastKnownGood = snap;
    return snap;
  }

  get lkg(): Snapshot | null {
    return this.lastKnownGood;
  }

  verifyChain(): boolean {
    let prev = 'GENESIS';
    for (const e of this.entries) {
      if (e.prevHash !== prev) return false;
      const { hash, ...rest } = e;
      const expect = createHash('sha256').update(JSON.stringify(rest)).digest('hex');
      if (expect !== hash) return false;
      prev = hash;
    }
    return true;
  }

  list(limit = 50): LedgerEntry[] {
    return this.entries.slice(-limit);
  }

  get size(): number {
    return this.entries.length;
  }
}
