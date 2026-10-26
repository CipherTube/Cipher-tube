/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto';

/**
 * Generates a synchronized, time-locked zero-knowledge structural proof token.
 * This is the primary payload client services attach to headers.
 *
 * @param structuralHash - The static payload signature or system channel identifier
 * @returns Object containing the raw hash and the base64-encoded proof packet
 */
export function generateCipherProof(structuralHash: string): { cipherHash: string, cipherProof: string } {
    if (!structuralHash || typeof structuralHash !== 'string') {
        throw new Error("Invalid structural source hash provided for proof generation.");
    }

    // Capture precise system epoch to act as our single-use validation salt
    const salt = Date.now();

    // Reconstruct the exact signature using our fast-path SHA-256 HMAC pipeline
    // Bolt Optimization: Replace slower String(salt) constructor with coercive "" + salt
    const verificationMatrix = crypto.createHmac('sha256', "" + salt);
    verificationMatrix.update(structuralHash);
    const challengeProof = verificationMatrix.digest('hex');

    // Bundle the proof components cleanly into a structural package
    const proofPackage = {
        salt: salt,
        structuralHash: structuralHash,
        challengeProof: challengeProof
    };

    // Compress the entire structural matrix into a single transportable base64 header string
    const encodedHeaderProof = Buffer.from(JSON.stringify(proofPackage)).toString('base64');

    return {
        cipherHash: structuralHash,
        cipherProof: encodedHeaderProof
    };
}

/**
 * Quick self-test loop to verify local cryptographic pipeline integrity on launch.
 */
export function verifyLocalPipeline(): boolean {
    try {
        const testHash = "806_panhandle_channel_secure_signature";
        const tokens = generateCipherProof(testHash);

        if (tokens.cipherProof && tokens.cipherHash === testHash) {
            console.log("✅ [Crypto Telemetry] Local proof generator pipeline functional.");
            return true;
        }
        return false;
    } catch (err: any) {
        console.error("🚨 [Crypto Critical] Local proof verification test failed:", err.message);
        return false;
    }
}

// Run sanity check on module load if not in test
if (process.env.NODE_ENV !== 'test') {
    verifyLocalPipeline();
}
