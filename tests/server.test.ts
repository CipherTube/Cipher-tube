/* eslint-disable @typescript-eslint/no-explicit-any */
import request from "supertest";
import { app, sessionCache } from "../src/server";

// Mock Redis client
jest.mock("redis", () => {
  const mRedis = {
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    get: jest.fn(),
  };
  return {
    createClient: jest.fn(() => mRedis),
  };
});

import { createClient } from "redis";

describe("Server Security and Health", () => {
  let redisMock: any;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionCache.clear();
    redisMock = (createClient as jest.Mock)();
  });

  it("should have security headers from helmet", async () => {
    const response = await request(app).get("/health");
    expect(response.headers["x-dns-prefetch-control"]).toBe("off");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["strict-transport-security"]).toContain(
      "max-age=31536000",
    );
    expect(response.headers["strict-transport-security"]).toContain(
      "includeSubDomains",
    );
    expect(response.headers["strict-transport-security"]).toContain("preload");
    expect(response.headers["content-security-policy"]).toContain(
      "base-uri 'none'",
    );
    expect(response.headers["content-security-policy"]).toContain(
      "form-action 'self'",
    );
    expect(response.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
  });

  it("should NOT have x-powered-by header", async () => {
    const response = await request(app).get("/health");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("should return ok from /health", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("should verify session ownership", async () => {
    const userId = "user-owner";
    const other = "user-other";

    redisMock.get.mockResolvedValue(userId);

    const create = await request(app).post("/mcp").set("x-user-id", userId);
    const token = create.body.sessionToken;
    expect(token).toBeDefined();

    // Mock redis for subsequent check
    redisMock.get.mockResolvedValueOnce(userId);

    const checkOk = await request(app)
      .get(`/mcp/check`)
      .set("x-user-id", userId)
      .set("x-session-token", token);
    expect(checkOk.status).toBe(200);

    // Mock redis for fail check
    redisMock.get.mockResolvedValueOnce(userId);
    const checkFail = await request(app)
      .get(`/mcp/check`)
      .set("x-user-id", other)
      .set("x-session-token", token);
    expect(checkFail.status).toBe(403);

    const checkInvalid = await request(app)
      .get("/mcp/check")
      .set("x-user-id", userId);
    // No x-session-token header
    expect(checkInvalid.status).toBe(401);
  });

  it("should reject large JSON payloads", async () => {
    const largePayload = {
      data: "a".repeat(11 * 1024),
    };
    const response = await request(app)
      .post("/mcp")
      .set("x-user-id", "test-user")
      .send(largePayload);
    expect(response.status).toBe(413);
  });

  it("should render the Cosmology Map .info-placeholder and contain mouseleave / blur event listeners", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.text).toContain('class="info-placeholder"');
    expect(response.text).toContain(
      "Hover or focus on an archetype node to view its mandate.",
    );
    expect(response.text).toContain(
      "node.addEventListener('mouseleave', hideInfo);",
    );
    expect(response.text).toContain("node.addEventListener('blur', hideInfo);");
    // Verify high-contrast accessibility focus visible styles
    expect(response.text).toContain(".archetype-node:focus-visible");
    expect(response.text).toContain("outline: 3px solid var(--primary);");
    expect(response.text).toContain("outline-offset: 2px;");
  });

  it("should render accessible Cosmology Map nodes with visible hover and focus indicators", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    // Ensure the old outline: none and white shadow are removed
    expect(response.text).not.toContain("box-shadow: 0 0 15px white");
    expect(response.text).not.toContain("outline: none;");
    // Ensure the new primary-based styles are present
    expect(response.text).toContain("box-shadow: 0 0 15px var(--primary);");
    expect(response.text).toContain("outline: 3px solid var(--primary);");
    expect(response.text).toContain("outline-offset: 2px;");
  });

  it("should render an accessible clear button for user-id-input", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.text).toContain('id="clear-user-id-btn"');
    expect(response.text).toContain('aria-label="Clear User ID"');
    expect(response.text).toContain("clearUserIdBtn.addEventListener('click'");
  });
});
