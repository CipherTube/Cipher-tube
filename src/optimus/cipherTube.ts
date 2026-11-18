import crypto from "node:crypto";
import type { KeyValueStore } from "./store";

export type Jurisdiction = "US-FED" | "EU-AI-ACT" | "GLOBAL";

export interface CipherTubePacket {
  tubeId: string;
  sessionId: string;
  userIdHash: string;
  iv: string;
  authTag: string;
  ciphertext: string;
  complianceAttestation: {
    jurisdiction: Jurisdiction;
    zeroTrainingRetention: true;
    timestampUtc: string;
    auditHash: string;
  };
}

export const AUDIT_LEDGER_KEY = "cta:compliance:audit_ledger";

const sha256Hex = (s: string): string => crypto.createHash("sha256").update(s).digest("hex");

/**
 * Cipher Tube Assembly for the Optimus stack.
 *
 * One 256-bit master key. Per user and per session, HKDF-SHA256 derives a
 * distinct AES-256-GCM key, so a packet sealed for one session cannot be
 * opened under another, and the master key never encrypts data directly.
 * The tube id, user hash and jurisdiction are bound in as additional
 * authenticated data: change any of them and the tag fails.
 */
export class CipherTubeAssembly {
  private readonly masterKey: Buffer;

  constructor(private readonly store: KeyValueStore, hexMasterKey: string) {
    if (!/^[0-9a-fA-F]{64}$/.test(hexMasterKey)) {
      throw new Error("CTA_CRITICAL: Master key must be 256-bit (64 hex chars).");
    }
    this.masterKey = Buffer.from(hexMasterKey, "hex");
  }

  private deriveSessionKey(userId: string, sessionId: string): Buffer {
    const salt = crypto.createHash("sha256").update(sessionId).digest();
    const info = Buffer.from(`CTA-v1-SESSION:${userId}`, "utf8");
    return Buffer.from(crypto.hkdfSync("sha256", this.masterKey, salt, info, 32));
  }

  private aad(tubeId: string, userIdHash: string, jurisdiction: Jurisdiction): Buffer {
    return Buffer.from(`${tubeId}:${userIdHash}:${jurisdiction}`, "utf8");
  }

  public async sealIntoTube(
    userId: string,
    sessionId: string,
    payload: unknown,
    jurisdiction: Jurisdiction = "GLOBAL"
  ): Promise<CipherTubePacket> {
    const key = this.deriveSessionKey(userId, sessionId);
    const iv = crypto.randomBytes(12);
    const userIdHash = sha256Hex(userId);
    const tubeId = `cta_${crypto.randomUUID()}`;

    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(this.aad(tubeId, userIdHash, jurisdiction));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const auditHash = sha256Hex(`${tubeId}:${iv.toString("hex")}:${authTag.toString("hex")}`);
    const packet: CipherTubePacket = {
      tubeId,
      sessionId,
      userIdHash,
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
      ciphertext: encrypted.toString("base64"),
      complianceAttestation: {
        jurisdiction,
        zeroTrainingRetention: true,
        timestampUtc: new Date().toISOString(),
        auditHash,
      },
    };

    // The ledger holds hashes and ids only, never plaintext or ciphertext.
    await this.store.rpush(
      AUDIT_LEDGER_KEY,
      JSON.stringify({ tubeId, userIdHash, jurisdiction, auditHash, at: packet.complianceAttestation.timestampUtc })
    );
    return packet;
  }

  /** The inverse of sealIntoTube. Throws if anything about the packet was altered. */
  public openTube(userId: string, packet: CipherTubePacket): unknown {
    const userIdHash = sha256Hex(userId);
    if (userIdHash !== packet.userIdHash) throw new Error("CTA_REJECT: tube was sealed for a different user.");

    const iv = Buffer.from(packet.iv, "hex");
    const authTag = Buffer.from(packet.authTag, "hex");
    const expected = sha256Hex(`${packet.tubeId}:${packet.iv}:${packet.authTag}`);
    if (expected !== packet.complianceAttestation.auditHash) {
      throw new Error("CTA_REJECT: audit hash does not match the packet.");
    }

    const key = this.deriveSessionKey(userId, packet.sessionId);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(this.aad(packet.tubeId, packet.userIdHash, packet.complianceAttestation.jurisdiction));
    decipher.setAuthTag(authTag);
    try {
      const plain = Buffer.concat([decipher.update(Buffer.from(packet.ciphertext, "base64")), decipher.final()]);
      return JSON.parse(plain.toString("utf8"));
    } catch {
      throw new Error("CTA_REJECT: authentication failed, tube was altered or opened under the wrong session.");
    }
  }
}
