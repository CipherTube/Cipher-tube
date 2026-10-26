import { cache } from '../src/cache/redisPool';
import { verifyCryptographicProof } from '../src/crypto/verifier';
import { cipherTubeGateway } from '../src/gateway/sessionMiddleware';
import crypto from 'crypto';
import { Request, Response } from 'express';

describe('Sentinel: Sanitized Error Logging Verification', () => {
    let originalConsoleError: typeof console.error;
    let consoleErrorCalls: any[][];

    beforeEach(() => {
        originalConsoleError = console.error;
        consoleErrorCalls = [];
        console.error = (...args: any[]) => {
            consoleErrorCalls.push(args);
        };
    });

    afterEach(() => {
        console.error = originalConsoleError;
    });

    it('should sanitize Redis error event logs and only print err.message', () => {
        const sensitiveError = new Error('Redis connection failed with secret redis://admin:password123@redis-cluster:6379');
        (sensitiveError as any).leakedStackDetails = 'highly_sensitive_stack_or_payload';

        // Emit 'error' event on raw Redis client
        cache.rawClient.emit('error', sensitiveError);

        expect(consoleErrorCalls.length).toBeGreaterThan(0);
        const callArgs = consoleErrorCalls[0];

        // Ensure we logged the message
        expect(callArgs[0]).toContain('[Cache Critical]');
        expect(callArgs[1]).toBe(sensitiveError.message);

        // Ensure we did NOT log the raw error object which could print stack traces or sensitive custom fields
        expect(callArgs[1]).not.toBe(sensitiveError);
        expect(callArgs[1]).not.toHaveProperty('leakedStackDetails');
    });

    it('should sanitize verifier failure logs to avoid logging raw error objects', async () => {
        const sensitiveError = new Error('Crypto Engine Hmac Fault');
        (sensitiveError as any).sensitiveInternalKey = '0xDEADBEEF';

        // Framework-agnostic mock of crypto.createHmac
        const originalCreateHmac = crypto.createHmac;
        (crypto as any).createHmac = () => {
            throw sensitiveError;
        };

        try {
            // Generate a valid proof base but execution will fail at HMAC creation
            const mockPayload = Buffer.from(JSON.stringify({
                salt: Date.now(),
                structuralHash: 'valid_hash_structure',
                challengeProof: 'a1b2c3d4'
            })).toString('base64');

            const result = await verifyCryptographicProof(mockPayload);
            expect(result).toBe(false);

            expect(consoleErrorCalls.length).toBeGreaterThan(0);
            const callArgs = consoleErrorCalls[0];

            // Ensure we logged the message
            expect(callArgs[0]).toContain('Critical: Security framework evaluation failure inside verifier engine:');
            expect(callArgs[1]).toBe(sensitiveError.message);

            // Ensure we did NOT log the raw error object which contains sensitive properties
            expect(callArgs[1]).not.toBe(sensitiveError);
            expect(callArgs[1]).not.toHaveProperty('sensitiveInternalKey');
        } finally {
            // Restore original createHmac
            (crypto as any).createHmac = originalCreateHmac;
        }
    });

    it('should sanitize gateway middleware failure logs to avoid logging raw error objects', async () => {
        const sensitiveError = new Error('Database cluster partition fault on connection postgresql://user:pass@db:5432');
        (sensitiveError as any).sensitiveDbState = 'table_leak_internal';

        // Framework-agnostic mock of cache.get
        const originalCacheGet = cache.get;
        cache.get = async () => {
            throw sensitiveError;
        };

        try {
            const mockReq = {
                headers: {
                    'x-cipher-proof': 'valid-proof',
                    'x-cipher-hash': 'valid-hash'
                }
            } as unknown as Request;

            const mockRes = {
                status: function(s: number) {
                    (this as any).statusCode = s;
                    return this;
                },
                json: function(j: any) {
                    (this as any).body = j;
                    return this;
                }
            } as unknown as Response;

            const next = () => {};

            await cipherTubeGateway(mockReq, mockRes, next);

            expect((mockRes as any).statusCode).toBe(500);
            expect((mockRes as any).body).toEqual({
                status: 'error',
                message: 'Internal cryptographic channel fault.'
            });

            expect(consoleErrorCalls.length).toBeGreaterThan(0);
            const callArgs = consoleErrorCalls[0];

            // Ensure we logged the message
            expect(callArgs[0]).toContain('Gateway Processing Error:');
            expect(callArgs[1]).toBe(sensitiveError.message);

            // Ensure we did NOT log the raw error object
            expect(callArgs[1]).not.toBe(sensitiveError);
            expect(callArgs[1]).not.toHaveProperty('sensitiveDbState');
        } finally {
            // Restore original cache.get
            cache.get = originalCacheGet;
        }
    });
});
