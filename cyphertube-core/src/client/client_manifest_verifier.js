import crypto from "crypto";

/**
 * CypherTube Client-Side Asymmetric Manifest Verifier
 * Validates short-lived signing keys and intercepts revoked operations.
 */
export class ClientManifestVerifier {
  constructor() {
    this.trustedNodes = new Map(); // nodeDid -> K_node public key
    this.revocationBlacklist = new Set(); // Set of blacklisted K_op keys
  }

  _importPublicKey(pubKey) {
    if (!pubKey) return pubKey;
    if (
      pubKey.type === "public" ||
      typeof pubKey === "string" ||
      pubKey.constructor?.name === "KeyObject"
    ) {
      return pubKey;
    }
    if (Buffer.isBuffer(pubKey)) {
      if (pubKey.toString().includes("PUBLIC KEY")) {
        return pubKey.toString();
      }
      if (pubKey.length === 32) {
        try {
          return crypto.createPublicKey({
            key: pubKey,
            format: "raw",
            type: "public",
          });
        } catch (e) {}
      }
      try {
        return crypto.createPublicKey({
          key: pubKey,
          format: "der",
          type: "spki",
        });
      } catch (e) {}
    }
    return pubKey;
  }

  registerTrustedNode(nodeDid, kNodePublicKeyBuffer) {
    this.trustedNodes.set(nodeDid, kNodePublicKeyBuffer);
  }

  ingestRevocationTicket(ticket) {
    if (!ticket || typeof ticket !== "object" || Array.isArray(ticket)) {
      throw new Error("REVOCATION_VERIFY_ERR: Revocation ticket must be a valid non-null object.");
    }

    const {
      revocation_target,
      revocation_epoch,
      reason_code,
      issuer_node_did,
      revocation_signature,
    } = ticket;

    if (
      typeof revocation_target !== "string" ||
      typeof reason_code !== "string" ||
      typeof issuer_node_did !== "string" ||
      typeof revocation_signature !== "string"
    ) {
      throw new Error("REVOCATION_VERIFY_ERR: Invalid revocation field types.");
    }

    if (typeof revocation_epoch !== "number" || !Number.isSafeInteger(revocation_epoch)) {
      throw new Error("REVOCATION_VERIFY_ERR: Invalid revocation_epoch.");
    }

    const kNodePubKey = this.trustedNodes.get(issuer_node_did);
    if (!kNodePubKey)
      throw new Error("REVOCATION_VERIFY_ERR: Origin node unknown.");

    const serialized = JSON.stringify({
      target: revocation_target,
      epoch: Number(revocation_epoch),
      reason: reason_code,
    });
    const isValid = crypto.verify(
      null,
      Buffer.from(serialized),
      this._importPublicKey(kNodePubKey),
      Buffer.from(revocation_signature, "hex"),
    );

    if (!isValid)
      throw new Error("SECURITY_ALERT: Invalid revocation signature detected.");
    this.revocationBlacklist.add(revocation_target);
  }

  verifyManifest(manifest) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new Error("CYPHERTUBE_CRYPTO_ERR: Manifest must be a valid non-null object.");
    }

    const {
      delegation_token,
      manifest_signature,
      canonical_blind_id,
      segment_index,
      crypto_metadata,
    } = manifest;

    if (!delegation_token || typeof delegation_token !== 'object' || Array.isArray(delegation_token)) {
      throw new Error("CYPHERTUBE_CRYPTO_ERR: Delegation token must be a valid non-null object.");
    }

    // Sentinel: Defensive type and structure validation of fields
    if (typeof manifest_signature !== 'string' ||
        typeof canonical_blind_id !== 'string' ||
        typeof delegation_token.op_public_key !== 'string' ||
        typeof delegation_token.issuer_node_did !== 'string' ||
        typeof delegation_token.delegation_signature !== 'string') {
      throw new Error("CYPHERTUBE_CRYPTO_ERR: Invalid manifest field types.");
    }

    // Prevent NaN bypasses or unsafe integer values on cryptographic constraints
    if (typeof delegation_token.valid_until_epoch !== 'number' ||
        !Number.isSafeInteger(delegation_token.valid_until_epoch)) {
      throw new Error("CYPHERTUBE_CRYPTO_ERR: Invalid valid_until_epoch.");
    }

    if (typeof segment_index !== 'number' ||
        !Number.isSafeInteger(segment_index)) {
      throw new Error("CYPHERTUBE_CRYPTO_ERR: Invalid segment_index.");
    }

    if (this.revocationBlacklist.has(delegation_token.op_public_key)) {
      throw new Error(
        "CYPHERTUBE_CRYPTO_ERR: Operation rejected. Key is revoked.",
      );
    }
    if (Math.floor(Date.now() / 1000) > delegation_token.valid_until_epoch) {
      throw new Error(
        "CYPHERTUBE_CRYPTO_ERR: Key authority windows has expired.",
      );
    }

    const kNodePubKey = this.trustedNodes.get(delegation_token.issuer_node_did);
    if (!kNodePubKey)
      throw new Error(
        "CYPHERTUBE_CRYPTO_ERR: Unrecognized manifest authority.",
      );

    const serializedDelegation = JSON.stringify({
      pubKey: delegation_token.op_public_key,
      expiry: Number(delegation_token.valid_until_epoch),
    });
    const isDelegationValid = crypto.verify(
      null,
      Buffer.from(serializedDelegation),
      this._importPublicKey(kNodePubKey),
      Buffer.from(delegation_token.delegation_signature, "hex"),
    );
    if (!isDelegationValid)
      throw new Error("SECURITY_ALERT: Forged delegation token.");

    const serializedManifest = JSON.stringify({
      blindId: canonical_blind_id,
      idx: Number(segment_index),
      meta: crypto_metadata,
    });
    const isManifestValid = crypto.verify(
      null,
      Buffer.from(serializedManifest),
      this._importPublicKey(Buffer.from(delegation_token.op_public_key, "hex")),
      Buffer.from(manifest_signature, "hex"),
    );
    if (!isManifestValid)
      throw new Error(
        "SECURITY_ALERT: Manifest structural signature mismatch.",
      );

    return true;
  }
}
