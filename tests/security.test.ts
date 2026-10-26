import request from "supertest";
import { app } from "../src/server";
import { createClient } from "redis";
import { verifyCryptographicProof } from "../src/crypto/verifier";
import crypto from "crypto";

// Mock Redis client
jest.mock("redis", () => {
  const mRedis = {
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    get: jest.fn(),
    expire: jest.fn().mockResolvedValue(1),
  };
  return {
    createClient: jest.fn(() => mRedis),
  };
});

describe("Security Validation", () => {
  let redisMock: any;
  let consoleSpy: jest.SpyInstance;
  const sessionToken = "test-token";

  beforeEach(() => {
    jest.clearAllMocks();
    redisMock = (createClient as jest.Mock)();
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("x-user-id validation", () => {
    it("should reject x-user-id longer than 128 characters in POST /mcp", async () => {
      const longUserId = "a".repeat(129);
      const response = await request(app)
        .post("/mcp")
        .set("x-user-id", longUserId);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid x-user-id");
    });

    it("should reject x-user-id longer than 128 characters in GET /mcp/check", async () => {
      const longUserId = "a".repeat(129);
      const response = await request(app)
        .get(`/mcp/check`)
        .set("x-user-id", longUserId)
        .set("x-session-token", sessionToken);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid x-user-id");
    });

    it("should reject prototype-polluting strings as x-user-id", async () => {
      const forbiddenValues = ["__proto__", "constructor", "prototype"];

      for (const value of forbiddenValues) {
        const response = await request(app).post("/mcp").set("x-user-id", value);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Invalid x-user-id: forbidden value");
      }
    });
  });

  describe("Sanitized Error Logging", () => {
    it("should log only err.message on Redis failure in POST /mcp", async () => {
      const complexError = new Error("Redis connection failed");
      (complexError as any).sensitiveInfo = "secret-password-123";

      redisMock.set.mockRejectedValueOnce(complexError);

      await request(app).post("/mcp").set("x-user-id", "user123");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Session creation failed:"),
        "Redis connection failed",
      );

      // Ensure the full error object (which might contain sensitive info) wasn't logged
      const loggedArgs = consoleSpy.mock.calls[0];
      expect(loggedArgs).not.toContain(complexError);
    });

    it("should log only err.message on Redis failure in ensureSessionOwner", async () => {
      const complexError = new Error("Redis get failed");
      (complexError as any).sensitiveInfo = "secret-password-456";

      redisMock.get.mockRejectedValueOnce(complexError);

      await request(app)
        .get(`/mcp/check`)
        .set("x-user-id", "user123")
        .set("x-session-token", sessionToken);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Session ownership check failed:"),
        "Redis get failed",
      );
    });
  });

  describe("Decryption Fail-Secure", () => {
    const userId = "sentinel-user";
    const masterSeed = "0".repeat(64);

    beforeEach(() => {
      redisMock.get.mockResolvedValue(userId);
    });

    it("should return 400 for too short ciphertext", async () => {
      const response = await request(app)
        .post(`/mcp/decrypt`)
        .set("x-user-id", userId)
        .set("x-session-token", sessionToken)
        .send({
          ciphertext: "00112233",
          masterSeed,
          tubes: Array(25)
            .fill(null)
            .map((_, i) => ({
              layer: i,
              type: i >= 12 ? "aes-256-gcm" : "hash-lock",
              salt: "0",
              iv: "0",
              tag: "0",
              hash: "0",
            })),
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Decryption failed');
    });

    it("should return 400 for invalid hex in ciphertext", async () => {
      const response = await request(app)
        .post(`/mcp/decrypt`)
        .set("x-user-id", userId)
        .set("x-session-token", sessionToken)
        .send({
          ciphertext: "not-hex-at-all",
          masterSeed,
          tubes: Array(25)
            .fill(null)
            .map((_, i) => ({
              layer: i,
              type: i >= 12 ? "aes-256-gcm" : "hash-lock",
              salt: "0",
              iv: "0",
              tag: "0",
              hash: "0",
            })),
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Decryption failed');
    });

    it("should return 400 for missing tube fields", async () => {
      const response = await request(app)
        .post(`/mcp/decrypt`)
        .set("x-user-id", userId)
        .set("x-session-token", sessionToken)
        .send({
          ciphertext: "0".repeat(800),
          masterSeed,
          tubes: [
            { layer: 24, salt: 123, iv: "iv", tag: "tag", type: "aes-256-gcm" },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Decryption failed');
    });

    it('should return 400 for malformed tubes array (null element)', async () => {
        const response = await request(app)
          .post(`/mcp/decrypt`)
          .set('x-user-id', userId)
          .set('x-session-token', sessionToken)
          .send({
            ciphertext: '0'.repeat(800),
            masterSeed,
            tubes: [null]
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Decryption failed');
      });

    it('should return 400 for missing or invalid fields in encryption tube', async () => {
        const response = await request(app)
          .post(`/mcp/decrypt`)
          .set('x-user-id', userId)
          .set('x-session-token', sessionToken)
          .send({
            ciphertext: '0'.repeat(800),
            masterSeed,
            tubes: [
              { layer: 24, type: 'aes-256-gcm' } // missing salt, iv, tag
            ]
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Decryption failed');
    });

    it('should return 400 for invalid layer indexing', async () => {
        const response = await request(app)
          .post(`/mcp/decrypt`)
          .set('x-user-id', userId)
          .set('x-session-token', sessionToken)
          .send({
            ciphertext: '0'.repeat(800),
            masterSeed,
            tubes: [
              { layer: 99, salt: 'salt', iv: 'iv', tag: 'tag', type: 'aes-256-gcm' }
            ]
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Decryption failed');
    });
  });

  describe("Cryptographic Verifier (src/crypto/verifier.ts)", () => {
    it("should reject invalid JSON proof", async () => {
      const invalidJson = Buffer.from("not-json").toString("base64");
      const result = await verifyCryptographicProof(invalidJson);
      expect(result).toBe(false);
    });

    it("should reject proof with timingSafeEqual length mismatch", async () => {
      const salt = Date.now();
      const payload = JSON.stringify({
        salt,
        structuralHash: "test",
        challengeProof: "abc", // Too short
      });
      const proof = Buffer.from(payload).toString("base64");
      const result = await verifyCryptographicProof(proof);
      expect(result).toBe(false);
    });

    it("should reject proof with non-string structuralHash", async () => {
      const salt = Date.now();
      const payload = JSON.stringify({
        salt,
        structuralHash: 123,
        challengeProof: "a".repeat(64),
      });
      const proof = Buffer.from(payload).toString("base64");
      const result = await verifyCryptographicProof(proof);
      expect(result).toBe(false);
    });

    it("should reject null payload", async () => {
      const proof = Buffer.from("null").toString("base64");
      const result = await verifyCryptographicProof(proof);
      expect(result).toBe(false);
    });

    it("should verify a valid proof", async () => {
      const salt = Date.now();
      const structuralHash = "valid-hash";
      const hmac = crypto.createHmac("sha256", String(salt));
      hmac.update(structuralHash);
      const challengeProof = hmac.digest("hex");

      const payload = JSON.stringify({
        salt,
        structuralHash,
        challengeProof,
      });
      const proof = Buffer.from(payload).toString("base64");
      const result = await verifyCryptographicProof(proof);
      expect(result).toBe(true);
    });
  });
});
