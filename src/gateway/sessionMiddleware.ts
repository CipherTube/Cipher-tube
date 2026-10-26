import { Request, Response, NextFunction } from 'express';
import { cache } from '../cache/redisPool';
import { verifyCryptographicProof } from '../crypto/verifier';

/**
 * Core validation gateway layer.
 * Intercepts incoming requests, queries the in-memory cache layer,
 * and executes token processing completely off the primary database hot path.
 */
export async function cipherTubeGateway(req: Request, res: Response, next: NextFunction) {
    const x_cipher_proof = req.headers['x-cipher-proof'];
    const x_cipher_hash = req.headers['x-cipher-hash'];

    if (!x_cipher_proof || !x_cipher_hash) {
        return res.status(401).json({
            status: "denied",
            message: "Cipher-tube verification tokens missing from payload header."
        });
    }

    // Sentinel: Standardize headers to handle potential array format from duplicates.
    // We take the first element if it's an array to ensure we validate a single string.
    const proof: string | undefined = Array.isArray(x_cipher_proof) ? x_cipher_proof[0] : (typeof x_cipher_proof === 'string' ? x_cipher_proof : undefined);
    const hash: string | undefined = Array.isArray(x_cipher_hash) ? x_cipher_hash[0] : (typeof x_cipher_hash === 'string' ? x_cipher_hash : undefined);

    if (proof === undefined || hash === undefined) {
        return res.status(401).json({
            status: "denied",
            message: "Cipher-tube verification tokens missing from payload header."
        });
    }

    // Sentinel: Validate header lengths to prevent DoS/cache exhaustion
    if (hash.length > 128) {
      return res.status(400).json({ error: "Invalid x-cipher-hash: exceeds maximum length" });
    }
    if (proof.length > 4096) {
      return res.status(400).json({ error: "Invalid x-cipher-proof: exceeds maximum length" });
    }

    try {
        // Step 1: Query local memory pool for verified state hashes
        const persistentState = await cache.get(`state:${hash}`);
        if (persistentState) {
            // Keep window dynamic via rolling expiry (3600 seconds)
            await cache.expire(`state:${hash}`, 3600);
            (req as any).cipherState = JSON.parse(persistentState);
            return next();
        }

        // Step 2: Fall back to cryptographic proof validation if hash is missing
        // Sentinel: Bind the proof to the specific hash provided to prevent token re-use.
        const structuralIntegrityVerified = await verifyCryptographicProof(proof, hash);
        if (!structuralIntegrityVerified) {
            return res.status(403).json({
                status: "failed",
                message: "Cryptographic proof structural validation failed."
            });
        }

        // Step 3: Write confirmed token to local memory cache pool
        const safePayload = { identitySecured: true, originEpoch: Date.now() };
        await cache.setEx(`state:${hash}`, 3600, JSON.stringify(safePayload));

        (req as any).cipherState = safePayload;
        next();

    } catch (err: any) {
        // Enforce fallback state containment
        const safeMessage = err instanceof Error ? err.message : String(err);
        console.error("Gateway Processing Error:", safeMessage);
        return res.status(500).json({
            status: "error",
            message: "Internal cryptographic channel fault."
        });
    }
}
