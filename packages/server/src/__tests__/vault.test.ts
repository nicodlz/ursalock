/**
 * Vault API integration tests
 *
 * Tests the full CRUD lifecycle for encrypted vaults.
 * Uses Hono's app.request() for direct HTTP-level testing.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "#app.js";
import { getCsrfToken, csrfHeaders } from "./test-utils.js";

// Fresh app per test to reset in-memory rate limiter
let app = createApp();

beforeEach(() => {
  app = createApp();
});

/** Helper: register a user and return the auth token */
async function registerAndGetToken(email = `vault-${crypto.randomUUID()}@test.com`) {
  const csrf = await getCsrfToken(app);
  const res = await app.request("/auth/email/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": `__csrf=${csrf}`,
      "X-CSRF-Token": csrf,
    },
    body: JSON.stringify({ email, password: "password123" }),
  });
  const body = await res.json();
  return body.token as string;
}

/** Helper: create a vault and return the response body */
async function createVault(
  token: string,
  name: string,
  data = "encrypted-blob-base64",
  salt = "salt-base64",
) {
  const csrf = await getCsrfToken(app);
  const res = await app.request("/vault", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Cookie": `__csrf=${csrf}`,
      "X-CSRF-Token": csrf,
    },
    body: JSON.stringify({ name, data, salt }),
  });
  return { res, body: await res.json() };
}

describe("Vault CRUD", () => {
  let token: string;

  beforeEach(async () => {
    token = await registerAndGetToken();
  });

  // ── CREATE ────────────────────────────────────────────

  it("creates a vault and returns 201", async () => {
    const { res, body } = await createVault(token, "my-vault");

    expect(res.status).toBe(201);
    expect(body.uid).toBeDefined();
    expect(body.name).toBe("my-vault");
    expect(body.data).toBe("encrypted-blob-base64");
    expect(body.salt).toBe("salt-base64");
  });

  it("rejects duplicate vault names for the same user", async () => {
    await createVault(token, "dup-vault");
    const { res, body } = await createVault(token, "dup-vault");

    expect(res.status).toBe(409);
    expect(body.error.code).toBeDefined();
  });

  // ── READ (owner only) ────────────────────────────────

  it("retrieves a vault by uid (owner)", async () => {
    const { body: created } = await createVault(token, "read-vault");

    const res = await app.request(`/vault/${created.uid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.uid).toBe(created.uid);
    expect(body.name).toBe("read-vault");
  });

  it("lists all vaults for the authenticated user", async () => {
    await createVault(token, "v1");
    await createVault(token, "v2");
    await createVault(token, "v3");

    const res = await app.request("/vault", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vaults).toHaveLength(3);
  });

  // ── UPDATE ────────────────────────────────────────────

  it("updates vault data and salt", async () => {
    const { body: created } = await createVault(token, "update-vault", "old-data", "old-salt");

    const csrf = await getCsrfToken(app);
    const res = await app.request(`/vault/${created.uid}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cookie": `__csrf=${csrf}`,
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({ data: "new-data", salt: "new-salt" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBe("new-data");
    expect(body.salt).toBe("new-salt");
  });

  // ── DELETE ────────────────────────────────────────────

  it("deletes a vault and confirms it's gone (404)", async () => {
    const { body: created } = await createVault(token, "delete-vault");

    const csrf = await getCsrfToken(app);
    const delRes = await app.request(`/vault/${created.uid}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Cookie": `__csrf=${csrf}`,
        "X-CSRF-Token": csrf,
      },
    });
    expect(delRes.status).toBe(200);

    // Verify it's gone
    const getRes = await app.request(`/vault/${created.uid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(getRes.status).toBe(404);
  });

  // ── AUTH ENFORCEMENT ──────────────────────────────────

  it("returns 401 when accessing vaults without a token", async () => {
    const res = await app.request("/vault");
    expect(res.status).toBe(401);
  });

  it("returns 401 with an invalid token", async () => {
    const res = await app.request("/vault", {
      headers: { Authorization: "Bearer totally-invalid-jwt" },
    });
    expect(res.status).toBe(401);
  });

  it("prevents user A from accessing user B's vault", async () => {
    const tokenA = token;
    const tokenB = await registerAndGetToken("other-user@test.com");

    const { body: vault } = await createVault(tokenA, "private-vault");

    // User B tries to read user A's vault
    const res = await app.request(`/vault/${vault.uid}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    // Should be 404 (not 403) to avoid leaking vault existence
    expect(res.status).toBe(404);
  });

  // ── 404 ───────────────────────────────────────────────

  it("returns 404 for a non-existent vault uid", async () => {
    const res = await app.request("/vault/does-not-exist-at-all", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });
});
