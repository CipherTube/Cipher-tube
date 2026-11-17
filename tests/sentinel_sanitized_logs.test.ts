/* eslint-disable @typescript-eslint/no-explicit-any */
import { cache } from '../src/cache/redisPool';
import { cipherTubeGateway } from '../src/gateway/sessionMiddleware';
import { verifyCryptographicProof } from '../src/crypto/verifier';
import { Request, Response, NextFunction } from 'express';

describe('Sentinel Sanitized Logs', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
        consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleSpy.mockRestore();
        jest.restoreAllMocks();
    });

    it('should sanitize Redis pool connection error event to avoid raw object leakage', () => {
        const sensitiveError = new Error('Connection failed: redis://auth:secret_password@localhost:6379');
        cache.rawClient.emit('error', sensitiveError);

        expect(consoleSpy).toHaveBeenCalled();
        const loggedArgs = consoleSpy.mock.calls[0];
        // Ensure the raw error object is NOT logged
        for (const arg of loggedArgs) {
            expect(arg).not.toBe(sensitiveError);
        }
        // Ensure only safe string representations are logged
        expect(loggedArgs[loggedArgs.length - 1]).toBe(sensitiveError.message);
    });

    it('should sanitize gateway middleware caught errors', async () => {
        const req = {
            headers: {
                'x-cipher-proof': 'valid-proof-format',
                'x-cipher-hash': 'valid-hash'
            }
        } as unknown as Request;
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        } as unknown as Response;
        const next = jest.fn() as NextFunction;

        // Force cache.get to throw a sensitive error
        const sensitiveError = new Error('Database secret stack trace leak here');
        jest.spyOn(cache, 'get').mockRejectedValueOnce(sensitiveError);

        await cipherTubeGateway(req, res, next);

        expect(consoleSpy).toHaveBeenCalled();
        const loggedArgs = consoleSpy.mock.calls[0];
        for (const arg of loggedArgs) {
            expect(arg).not.toBe(sensitiveError);
        }
        expect(loggedArgs[loggedArgs.length - 1]).toBe(sensitiveError.message);
    });

    it('should sanitize cryptographic verifier caught errors', async () => {
        const sensitiveError = new Error('Crypto library internal fault: secret key leak');
        // Force JSON.parse to throw a non-SyntaxError (e.g., TypeError) by overriding Object.prototype or similar,
        // or simply spy on Buffer.from to throw.
        const bufferSpy = jest.spyOn(Buffer, 'from').mockImplementationOnce(() => {
            throw sensitiveError;
        });

        const result = await verifyCryptographicProof('some-raw-proof');
        expect(result).toBe(false);

        expect(consoleSpy).toHaveBeenCalled();
        const loggedArgs = consoleSpy.mock.calls[0];
        for (const arg of loggedArgs) {
            expect(arg).not.toBe(sensitiveError);
        }
        expect(loggedArgs[loggedArgs.length - 1]).toBe(sensitiveError.message);

        bufferSpy.mockRestore();
    });
});
