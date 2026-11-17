/* eslint-disable @typescript-eslint/no-explicit-any */
import { verifyCryptographicProof } from "../src/crypto/verifier";
import { cipherTubeGateway } from "../src/gateway/sessionMiddleware";
import { cache } from "../src/cache/redisPool";

// Mock Redis client to capture error listener and prevent real connections.
// Using globalThis to bypass the Jest hoist ReferenceError on local variables.
jest.mock("redis", () => {
  const mRedis = {
    on: jest.fn((event: string, callback: any) => {
      if (event === 'error') {
        (globalThis as any).errorListener = callback;
      }
    }),
    connect: jest.fn().mockResolvedValue(null),
    get: jest.fn(),
    setEx: jest.fn(),
    expire: jest.fn(),
    isOpen: true,
  };
  return {
    createClient: jest.fn(() => mRedis),
  };
});

describe("Sentinel Sanitized Error Logging", () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("should securely log error message and not leak raw error object in redisPool error listener", () => {
    const errorListener = (globalThis as any).errorListener;
    expect(errorListener).toBeDefined();

    const complexError = new Error("Redis connection timed out");
    (complexError as any).secretToken = "super-secret-redis-password";

    // Trigger the registered error listener
    errorListener(complexError);

    expect(consoleSpy).toHaveBeenCalled();
    // Verify that the error message is printed
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Redis memory pool encountered an error:"),
      "Redis connection timed out"
    );

    // Verify that the entire error object containing sensitive fields is NOT leaked
    const loggedArgs = consoleSpy.mock.calls[0];
    expect(loggedArgs).not.toContain(complexError);
  });

  it("should securely log error message and not leak raw error object in verifyCryptographicProof", async () => {
    // Generate a payload proxy whose property getter throws a custom error (not a SyntaxError)
    const mockPayloadProxy = new Proxy({}, {
      get(target, prop) {
        if (prop === "salt") {
          const customErr = new Error("Unsecured custom evaluation failure");
          (customErr as any).secretDetails = "private-key-leak";
          throw customErr;
        }
        return undefined;
      }
    });

    // Mock JSON.parse to return our throwing proxy
    const originalJsonParse = JSON.parse;
    JSON.parse = jest.fn().mockReturnValue(mockPayloadProxy);

    try {
      const dummyProof = Buffer.from(JSON.stringify({ dummy: true })).toString("base64");
      const result = await verifyCryptographicProof(dummyProof);
      expect(result).toBe(false);

      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Critical: Security framework evaluation failure inside verifier engine:"),
        "Unsecured custom evaluation failure"
      );

      const loggedArgs = consoleSpy.mock.calls[0];
      // Ensure the error object is not logged directly as a raw reference
      const containsRawRef = loggedArgs.some((arg: any) => arg && typeof arg === 'object' && arg.secretDetails === 'private-key-leak');
      expect(containsRawRef).toBe(false);

    } finally {
      JSON.parse = originalJsonParse;
    }
  });

  it("should securely log error message and not leak raw error object in cipherTubeGateway middleware", async () => {
    const complexError = new Error("Database lookup failed catastrophically");
    (complexError as any).leakage = "internal-db-password-123";

    // Make cache.get throw
    jest.spyOn(cache, "get").mockRejectedValueOnce(complexError);

    const mockReq: any = {
      headers: {
        "x-cipher-proof": "valid-base64-proof",
        "x-cipher-hash": "valid-hash"
      }
    };
    const mockRes: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const mockNext = jest.fn();

    await cipherTubeGateway(mockReq, mockRes, mockNext);

    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      "Gateway Processing Error:",
      "Database lookup failed catastrophically"
    );

    const loggedArgs = consoleSpy.mock.calls[0];
    expect(loggedArgs).not.toContain(complexError);
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      status: "error",
      message: "Internal cryptographic channel fault."
    });
  });
});
