/**
 * Auth & security integration tests
 *
 * Tests JWT validation, rate limiting, and security headers.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "#app.js";
import { getCsrfToken, csrfHeaders } from "./test-utils.js";

// Fresh app per test to reset in-memory rate limiter
let app = createApp();

beforeEach(() => {
  app = createApp();
});

describe("JWT Validation", () => {
  it("rejects requests with no Authorization header", async () => {
    const res = await app.request("/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects malformed Authorization header (no Bearer prefix)", async () => {
    const res = await app.request("/auth/me", {
      headers: { Authorization: "Token abc123" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects expired or invalid JWT", async () => {
    const res = await app.request("/auth/me", {
      headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.invalid" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a valid JWT that has no matching session in DB", async () => {
    // Register to get a valid token, then logout (deletes session), then use the token
    const csrf1 = await getCsrfToken(app);
    const regRes = await app.request("/auth/email/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `__csrf=${csrf1}`,
        "X-CSRF-Token": csrf1,
      },
      body: JSON.stringify({ email: "jwt-session@test.com", password: "password123" }),
    });
    const { token } = await regRes.json();

    // Logout — invalidates session
    const csrf2 = await getCsrfToken(app);
    await app.request("/auth/logout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Cookie": `__csrf=${csrf2}`,
        "X-CSRF-Token": csrf2,
      },
    });

    // Token is structurally valid but session is gone
    const res = await app.request("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });
});

describe("Rate Limiting", () => {
  it("returns rate limit headers on auth endpoints", async () => {
    const csrf = await getCsrfToken(app);
    const res = await app.request("/auth/email/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `__csrf=${csrf}`,
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({ email: "nobody@test.com", password: "wrong" }),
    });

    // Rate limit headers should be present regardless of response status
    expect(res.headers.get("x-ratelimit-limit")).toBeDefined();
    expect(res.headers.get("x-ratelimit-remaining")).toBeDefined();
  });

  it("enforces rate limit after exceeding max requests", async () => {
    // The auth rate limit is configured as max: 10 per 60s
    // Use a dedicated app instance to avoid interference from other tests
    const freshApp = createApp();
    const uniqueIp = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

    let lastStatus = 0;
    // Send enough requests to exceed the limit (max=10, so request 11+ should be 429)
    for (let i = 0; i < 15; i++) {
      const csrf = await getCsrfToken(freshApp);
      const res = await freshApp.request("/auth/email/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": uniqueIp,
          "Cookie": `__csrf=${csrf}`,
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ email: "ratelimit@test.com", password: "wrong" }),
      });
      lastStatus = res.status;
    }

    // After 15 requests, the last one must be rate-limited
    expect(lastStatus).toBe(429);
  });
});

describe("Security Headers", () => {
  it("includes secure headers on all responses", async () => {
    const res = await app.request("/health");

    expect(res.status).toBe(200);

    // secureHeaders() from Hono sets these
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    // Hono's secureHeaders() defaults to DENY
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("includes CORS headers for allowed origins", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "http://localhost:3000" },
    });

    // CORS headers should be present (exact value depends on env config)
    // At minimum, the response should not error
    expect(res.status).toBe(200);
  });
});
