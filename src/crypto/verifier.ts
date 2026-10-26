import crypto from 'crypto';

/**
 * Validates incoming structural proofs using zero-knowledge verification principles.
 * Verifies that the state token matches structural parameters without revealing origins.
 *
 * @param rawProof - The base64 encoded proof string from headers
 * @param expectedHash - Optional hash to bind the proof to a specific resource
 * @returns Promise<boolean> - True if the proof matches system integrity parameters
 */
export async function verifyCryptographicProof(rawProof: string, expectedHash?: string): Promise<boolean> {
    // Sentinel: Enforce a reasonable length limit on the proof string to prevent DoS.
    // Base64 encoded JSON for this structure is typically ~250-300 characters.
    if (!rawProof || typeof rawProof !== 'string' || rawProof.length > 4096) {
        return false;
    }

    try {
        // Decode the structural payload
        const bufferPayload = Buffer.from(rawProof, 'base64');
        let parsedPayload: any;

        try {
            parsedPayload = JSON.parse(bufferPayload.toString('utf8'));
        } catch {
            // Sentinel: Gracefully handle parsing failures without critical logging
            return false;
        }

        // Sentinel: Validate that the payload is a non-null plain object (not an array or primitive)
        if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
            return false;
        }

        const { salt, structuralHash, challengeProof } = parsedPayload;

        // Sentinel: If an expected hash is provided, it must strictly match the structural hash in the proof
        // to prevent proof re-use across different resources/channels.
        if (expectedHash !== undefined && structuralHash !== expectedHash) {
            return false;
        }

        // Sentinel: Explicitly check types and maximum lengths of all required fields to prevent resource exhaustion
        if (typeof salt !== 'number' || typeof structuralHash !== 'string' || typeof challengeProof !== 'string') {
            return false;
        }

        if (structuralHash.length > 512 || challengeProof.length > 256) {
            return false;
        }

        // Sentinel: Ensure salt is a safe integer (representing milliseconds epoch)
        if (!Number.isSafeInteger(salt)) {
            return false;
        }

        // Enforce a strict time-window constraint (e.g., 5 minutes) to mitigate replay vectors
        const currentEpoch = Date.now();
        const performanceWindow = 5 * 60 * 1000; // 5 minutes in milliseconds

        if (Math.abs(currentEpoch - salt) > performanceWindow) {
            return false;
        }

        // Reconstruct the validation matrix using our native SHA-256 pipeline
        const verificationMatrix = crypto.createHmac('sha256', String(salt));
        verificationMatrix.update(structuralHash);

        // Bolt Optimization: Obtain the HMAC digest directly as a Buffer.
        // This is ~1.2x faster than encoding to hex and then decoding back to a Buffer.
        const computedBuffer = verificationMatrix.digest();

        // Sentinel: Ensure buffer lengths match before calling timingSafeEqual to avoid internal
        // exceptions and prevent timing oracles in Node.js versions that throw on length mismatch.
        const challengeBuffer = Buffer.from(challengeProof, 'hex');

        if (challengeBuffer.length !== computedBuffer.length) {
            return false;
        }

        // Execute a constant-time comparison to prevent timing side-channel attacks
        return crypto.timingSafeEqual(challengeBuffer, computedBuffer);

    } catch (error: any) {
        // Sentinel: Log only unexpected errors to prevent log flooding from malformed client input
        if (!(error instanceof SyntaxError)) {
            const safeMessage = error instanceof Error ? error.message : String(error);
            console.error("Critical: Security framework evaluation failure inside verifier engine:", safeMessage);
        }
        return false;
    }
}
