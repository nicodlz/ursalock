/**
 * API key authentication tests
 * Tests API key creation, authentication, and permission enforcement
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "#app.js";

// Fresh app per test to reset in-memory rate limiter
let app = createApp();

beforeEach(() => {
  app = createApp();
});

/** Register a user and return JWT token */
async function registerAndGetToken(email = `apikey-${crypto.randomUUID()}@test.com`) {
  const res = await app.request("/auth/email/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  const data = (await res.json()) as { token: string; user: { id: string } };
  return data.token;
}

/** Create a vault and return its UID */
async function createVault(token: string, name = `vault-${crypto.randomUUID()}`) {
  const res = await app.request("/vault", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, data: "dGVzdA==", salt: "c2FsdA==" }),
  });
  const data = (await res.json()) as { uid: string };
  return data.uid;
}

/** Create an API key and return full response (including raw key) */
async function createApiKey(
  token: string,
  opts: {
    name?: string;
    permissions?: string[];
    vaultUids?: string[];
    collections?: string[];
    expiresAt?: number;
  } = {},
) {
  const res = await app.request("/auth/api-keys", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: opts.name ?? "Test Agent",
      permissions: opts.permissions,
      vaultUids: opts.vaultUids,
      collections: opts.collections,
      expiresAt: opts.expiresAt,
    }),
  });
  return { res, data: (await res.json()) as Record<string, unknown> };
}

// ===================
// API Key Management
// ===================

describe("API Key Management", () => {
  it("creates an API key with JWT auth", async () => {
    const token = await registerAndGetToken();
    const { res, data } = await createApiKey(token, {
      name: "Atlas",
      permissions: ["read", "write"],
    });

    expect(res.status).toBe(200);
    expect(data.name).toBe("Atlas");
    expect(data.key).toBeDefined();
    expect(data.key).toMatch(/^ulk_[a-f0-9]{48}$/);
    expect(data.keyPrefix).toBe((data.key as string).substring(0, 8));
    expect(data.permissions).toEqual(["read", "write"]);
    expect(data.vaultUids).toBeNull();
    expect(data.collections).toBeNull();
  });

  it("creates a scoped API key", async () => {
    const token = await registerAndGetToken();
    const vaultUid = await createVault(token);
    const { res, data } = await createApiKey(token, {
      name: "Scoped",
      permissions: ["read"],
      vaultUids: [vaultUid],
      collections: ["notes"],
    });

    expect(res.status).toBe(200);
    expect(data.permissions).toEqual(["read"]);
    expect(data.vaultUids).toEqual([vaultUid]);
    expect(data.collections).toEqual(["notes"]);
  });

  it("creates API key with expiration", async () => {
    const token = await registerAndGetToken();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const { res, data } = await createApiKey(token, { expiresAt });

    expect(res.status).toBe(200);
    expect(data.expiresAt).toBe(expiresAt);
  });

  it("lists API keys without exposing secrets", async () => {
    const token = await registerAndGetToken();
    await createApiKey(token, { name: "Key 1" });
    await createApiKey(token, { name: "Key 2" });

    const res = await app.request("/auth/api-keys", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { apiKeys: Record<string, unknown>[] };
    expect(data.apiKeys.length).toBe(2);
    for (const key of data.apiKeys) {
      expect(key.key).toBeUndefined();
      expect(key.keyHash).toBeUndefined();
      expect(key.keyPrefix).toBeDefined();
    }
  });

  it("revokes an API key", async () => {
    const token = await registerAndGetToken();
    const { data: keyData } = await createApiKey(token);

    const res = await app.request(`/auth/api-keys/${keyData.uid}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });

  it("rejects API key management with API key auth", async () => {
    const token = await registerAndGetToken();
    const { data: keyData } = await createApiKey(token);

    const res = await app.request("/auth/api-keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${keyData.key}`,
      },
      body: JSON.stringify({ name: "Nested" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 404 for revoking non-existent key", async () => {
    const token = await registerAndGetToken();
    const res = await app.request("/auth/api-keys/nonexistent", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });
});

// ===================
// API Key Authentication
// ===================

describe("API Key Authentication", () => {
  it("authenticates with valid API key", async () => {
    const token = await registerAndGetToken();
    const { data: keyData } = await createApiKey(token);

    const res = await app.request("/vault", {
      method: "GET",
      headers: { Authorization: `Bearer ${keyData.key}` },
    });

    expect(res.status).toBe(200);
  });

  it("rejects invalid API key format", async () => {
    const res = await app.request("/vault", {
      method: "GET",
      headers: { Authorization: "Bearer ulk_tooshort" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects non-existent API key", async () => {
    const res = await app.request("/vault", {
      method: "GET",
      headers: { Authorization: `Bearer ulk_${"0".repeat(48)}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects revoked API key", async () => {
    const token = await registerAndGetToken();
    const { data: keyData } = await createApiKey(token);

    // Revoke
    await app.request(`/auth/api-keys/${keyData.uid}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    // Use revoked key
    const res = await app.request("/vault", {
      method: "GET",
      headers: { Authorization: `Bearer ${keyData.key}` },
    });

    expect(res.status).toBe(401);
  });

  it("rejects expired API key", async () => {
    const token = await registerAndGetToken();
    const expiresAt = Math.floor(Date.now() / 1000) - 3600; // expired
    const { data: keyData } = await createApiKey(token, { expiresAt });

    const res = await app.request("/vault", {
      method: "GET",
      headers: { Authorization: `Bearer ${keyData.key}` },
    });

    expect(res.status).toBe(401);
  });
});

// ===================
// Permission Enforcement
// ===================

describe("Permission Enforcement", () => {
  it("read-only key can read", async () => {
    const token = await registerAndGetToken();
    const vaultUid = await createVault(token);
    const { data: keyData } = await createApiKey(token, { permissions: ["read"] });

    const res = await app.request(`/vault/${vaultUid}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${keyData.key}` },
    });

    expect(res.status).toBe(200);
  });

  it("read-only key cannot write documents", async () => {
    const token = await registerAndGetToken();
    const vaultUid = await createVault(token);
    const { data: keyData } = await createApiKey(token, { permissions: ["read"] });

    const res = await app.request(`/vault/${vaultUid}/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${keyData.key}`,
      },
      body: JSON.stringify({ collection: "test", data: "dGVzdA==" }),
    });

    expect(res.status).toBe(403);
  });

  it("read-only key cannot delete documents", async () => {
    const token = await registerAndGetToken();
    const vaultUid = await createVault(token);
    
    // Create doc with JWT
    const createRes = await app.request(`/vault/${vaultUid}/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ collection: "test", data: "dGVzdA==" }),
    });
    const doc = (await createRes.json()) as { uid: string };

    const { data: keyData } = await createApiKey(token, { permissions: ["read"] });

    const res = await app.request(`/vault/${vaultUid}/documents/${doc.uid}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${keyData.key}` },
    });

    expect(res.status).toBe(403);
  });

  it("vault-scoped key can access scoped vault", async () => {
    const token = await registerAndGetToken();
    const vaultUid = await createVault(token);
    const { data: keyData } = await createApiKey(token, { vaultUids: [vaultUid] });

    const res = await app.request(`/vault/${vaultUid}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${keyData.key}` },
    });

    expect(res.status).toBe(200);
  });

  it("vault-scoped key cannot access other vault", async () => {
    const token = await registerAndGetToken();
    const vault1 = await createVault(token);
    const vault2 = await createVault(token);
    const { data: keyData } = await createApiKey(token, { vaultUids: [vault1] });

    const res = await app.request(`/vault/${vault2}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${keyData.key}` },
    });

    expect(res.status).toBe(404);
  });

  it("collection-scoped key can access allowed collection", async () => {
    const token = await registerAndGetToken();
    const vaultUid = await createVault(token);
    const { data: keyData } = await createApiKey(token, {
      permissions: ["read", "write"],
      collections: ["notes"],
    });

    const res = await app.request(`/vault/${vaultUid}/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${keyData.key}`,
      },
      body: JSON.stringify({ collection: "notes", data: "dGVzdA==" }),
    });

    expect(res.status).toBe(201);
  });

  it("collection-scoped key cannot access forbidden collection", async () => {
    const token = await registerAndGetToken();
    const vaultUid = await createVault(token);
    const { data: keyData } = await createApiKey(token, {
      permissions: ["read", "write"],
      collections: ["notes"],
    });

    const res = await app.request(`/vault/${vaultUid}/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${keyData.key}`,
      },
      body: JSON.stringify({ collection: "secrets", data: "dGVzdA==" }),
    });

    expect(res.status).toBe(403);
  });

  it("JWT user has full access regardless", async () => {
    const token = await registerAndGetToken();
    await createVault(token, "v1");
    await createVault(token, "v2");

    const res = await app.request("/vault", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { vaults: unknown[] };
    expect(data.vaults.length).toBe(2);
  });
});
