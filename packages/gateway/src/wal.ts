import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface WalEntry {
  seq: number;
  ts: string;
  op: "CREATE" | "EXTEND" | "DELETE";
  sessionId: string;
  ownerId: string;
  /** SHA-256 of the encrypted blob, so the log itself never holds the blob twice. */
  blobSha256: string;
  ttlSeconds: number;
  /** Absolute expiry. Recovery refuses anything past this. */
  expiresAtMs: number;
  /** Hash chain: sha256(prevHash + canonical entry body). Detects edits and gaps. */
  prevHash: string;
  hash: string;
}

export const GENESIS = "0".repeat(64);

const bodyOf = (e: Omit<WalEntry, "hash">): string =>
  JSON.stringify([e.seq, e.ts, e.op, e.sessionId, e.ownerId, e.blobSha256, e.ttlSeconds, e.expiresAtMs, e.prevHash]);

export const hashEntry = (e: Omit<WalEntry, "hash">): string =>
  crypto.createHash("sha256").update(bodyOf(e)).digest("hex");

export interface WalReadResult {
  entries: WalEntry[];
  /** Lines that were unparseable, or broke the chain. Recovery skips them and reports them. */
  corrupt: { line: number; reason: string }[];
}

/**
 * Append-only, hash-chained write-ahead log.
 *
 * Each entry commits to the previous one, so an edited, deleted or reordered
 * line is detected. A torn final line (crash mid-write) is tolerated and
 * reported, never allowed to break recovery for other sessions. The log holds
 * a blob hash, not the blob: the blob lives in the session store, so the log
 * stays small and a leaked log does not leak ciphertext.
 */
export class WriteAheadLog {
  private seq = 0;
  private lastHash = GENESIS;

  constructor(private readonly file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const { entries } = this.read();
    if (entries.length) {
      const last = entries[entries.length - 1];
      this.seq = last.seq;
      this.lastHash = last.hash;
    }
  }

  append(e: Pick<WalEntry, "op" | "sessionId" | "ownerId" | "blobSha256" | "ttlSeconds" | "expiresAtMs">, now = new Date()): WalEntry {
    const base: Omit<WalEntry, "hash"> = {
      seq: this.seq + 1,
      ts: now.toISOString(),
      ...e,
      prevHash: this.lastHash,
    };
    const entry: WalEntry = { ...base, hash: hashEntry(base) };
    // fsync so an acknowledged write survives a crash.
    const fd = fs.openSync(this.file, "a");
    try {
      fs.writeSync(fd, JSON.stringify(entry) + "\n");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    this.seq = entry.seq;
    this.lastHash = entry.hash;
    return entry;
  }

  read(): WalReadResult {
    const corrupt: WalReadResult["corrupt"] = [];
    const entries: WalEntry[] = [];
    if (!fs.existsSync(this.file)) return { entries, corrupt };
    const lines = fs.readFileSync(this.file, "utf8").split("\n");
    let prev = GENESIS;
    let expectSeq = 1;
    lines.forEach((line, i) => {
      if (!line.trim()) return;
      let e: WalEntry;
      try {
        e = JSON.parse(line) as WalEntry;
      } catch {
        corrupt.push({ line: i + 1, reason: "unparseable line (torn write?)" });
        return;
      }
      const { hash, ...rest } = e;
      if (typeof hash !== "string" || hashEntry(rest) !== hash) {
        corrupt.push({ line: i + 1, reason: "entry hash mismatch" });
        return;
      }
      if (e.prevHash !== prev || e.seq !== expectSeq) {
        corrupt.push({ line: i + 1, reason: "chain break: entry missing, reordered or removed" });
        // Resync on this entry so one bad line does not condemn everything after it.
      }
      prev = e.hash;
      expectSeq = e.seq + 1;
      entries.push(e);
    });
    return { entries, corrupt };
  }

  get length(): number {
    return this.seq;
  }
}
