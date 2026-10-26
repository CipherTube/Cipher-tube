/* eslint-disable @typescript-eslint/no-explicit-any */
import { verifyCryptographicProof } from '../src/crypto/verifier';
import { cipherTubeGateway } from '../src/gateway/sessionMiddleware';
import { cache } from '../src/cache/redisPool';
import crypto from 'crypto';

describe('Sentinel Sanitized Logs Verification', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('should sanitize errors inside verifier engine to prevent raw error object leakage', async () => {
    // Force verifyCryptographicProof to throw an unexpected error by mocking crypto.createHmac
    const mockHmac = jest.spyOn(crypto, 'createHmac').mockImplementation(() => {
      const err = new Error('Secret Database Password in Stack Trace');
      (err as any).db_password = 'super_secret_redis_password';
      throw err;
    });

    const mockPayload = {
      salt: Date.now(),
      structuralHash: 'abc',
      challengeProof: 'def'
    };
    const rawProof = Buffer.from(JSON.stringify(mockPayload)).toString('base64');

    const result = await verifyCryptographicProof(rawProof);

    expect(result).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();

    // Verify that the logged error did not leak the raw error object
    for (const args of consoleErrorSpy.mock.calls) {
      for (const arg of args) {
        if (typeof arg === 'object' && arg !== null) {
          expect(arg.db_password).toBeUndefined();
        }
        expect(arg).not.toBeInstanceOf(Error);
      }
    }

    mockHmac.mockRestore();
  });

  it('should sanitize errors inside gateway middleware to prevent raw error object leakage', async () => {
    // Force cipherTubeGateway to throw by mocking cache.get to throw an error
    const mockCacheGet = jest.spyOn(cache, 'get').mockImplementation(() => {
      const err = new Error('Connection failed');
      (err as any).sensitive_internal_secret = 'leak_me_if_you_can';
      throw err;
    });

    const mockReq: any = {
      headers: {
        'x-cipher-proof': 'valid_proof',
        'x-cipher-hash': 'valid_hash'
      }
    };
    const mockRes: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    const mockNext = jest.fn();

    await cipherTubeGateway(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(consoleErrorSpy).toHaveBeenCalled();

    for (const args of consoleErrorSpy.mock.calls) {
      for (const arg of args) {
        if (typeof arg === 'object' && arg !== null) {
          expect(arg.sensitive_internal_secret).toBeUndefined();
        }
        expect(arg).not.toBeInstanceOf(Error);
      }
    }

    mockCacheGet.mockRestore();
  });

  it('should sanitize Redis client error event logging to prevent raw error object leakage', () => {
    const errorListeners = cache.rawClient.listeners('error');
    expect(errorListeners.length).toBeGreaterThan(0);

    const firstListener = errorListeners[0];
    const testError = new Error('Redis pool connection timed out');
    (testError as any).redis_password_leaked = 'hunter2';

    // Invoke the listener
    firstListener(testError);

    expect(consoleErrorSpy).toHaveBeenCalled();
    for (const args of consoleErrorSpy.mock.calls) {
      for (const arg of args) {
        if (typeof arg === 'object' && arg !== null) {
          expect(arg.redis_password_leaked).toBeUndefined();
        }
        expect(arg).not.toBeInstanceOf(Error);
      }
    }
  });
});
