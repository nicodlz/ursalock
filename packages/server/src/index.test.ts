/**
 * Server API tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { testClient } from "hono/testing";
import { createApp } from "#app.js";
import { getDb } from "#db/client.js";

const app = createApp();
const client = testClient(app);

describe("Health check", () => {
  it("returns ok status", async () => {
    const res = await client.health.$get();
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });
});

describe("Auth - Email/Password", () => {
  describe("POST /auth/email/register", () => {
    it("creates a new user and returns token", async () => {
      const res = await client.auth.email.register.$post({
        json: {
          email: "test@example.com",
          password: "password123",
        },
      });

      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.user.id).toBeDefined();
      expect(body.user.email).toBe("test@example.com");
      expect(body.token).toBeDefined();
    });

    it("rejects duplicate email", async () => {
      // First registration
      await client.auth.email.register.$post({
        json: { email: "dupe@example.com", password: "password123" },
      });

      // Second registration with same email
      const res = await client.auth.email.register.$post({
        json: { email: "dupe@example.com", password: "password456" },
      });

      expect(res.status).toBe(409);
      
      const body = await res.json();
      expect(body.error.code).toBe("email_already_exists");
    });

    it("validates email format", async () => {
      const res = await client.auth.email.register.$post({
        json: { email: "not-an-email", password: "password123" },
      });

      expect(res.status).toBe(400);
    });

    it("validates password length", async () => {
      const res = await client.auth.email.register.$post({
        json: { email: "test@example.com", password: "short" },
      });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /auth/email/login", () => {
    beforeEach(async () => {
      // Create test user
      await client.auth.email.register.$post({
        json: { email: "login@example.com", password: "password123" },
      });
    });

    it("returns token for valid credentials", async () => {
      const res = await client.auth.email.login.$post({
        json: { email: "login@example.com", password: "password123" },
      });

      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe("login@example.com");
    });

    it("rejects invalid password", async () => {
      const res = await client.auth.email.login.$post({
        json: { email: "login@example.com", password: "wrongpassword" },
      });

      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error.code).toBe("invalid_credentials");
    });

    it("rejects non-existent email", async () => {
      const res = await client.auth.email.login.$post({
        json: { email: "nobody@example.com", password: "password123" },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /auth/me", () => {
    it("returns current user with valid token", async () => {
      // Register and get token
      const registerRes = await client.auth.email.register.$post({
        json: { email: "me@example.com", password: "password123" },
      });
      const { token } = await registerRes.json();

      // Get current user
      const res = await app.request("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.user.email).toBe("me@example.com");
    });

    it("rejects without token", async () => {
      const res = await app.request("/auth/me");
      expect(res.status).toBe(401);
    });

    it("rejects invalid token", async () => {
      const res = await app.request("/auth/me", {
        headers: { Authorization: "Bearer invalid-token" },
      });
      expect(res.status).toBe(401);
    });
  });
});

describe("Vault CRUD", () => {
  let token: string;

  beforeEach(async () => {
    // Create test user and get token
    const res = await client.auth.email.register.$post({
      json: { email: "vault@example.com", password: "password123" },
    });
    const body = await res.json();
    token = body.token;
  });

  describe("POST /vault", () => {
    it("creates a new vault", async () => {
      const res = await app.request("/vault", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "my-vault",
          data: "encrypted-data-base64",
          salt: "salt-base64",
        }),
      });

      expect(res.status).toBe(201);
      
      const body = await res.json();
      expect(body.uid).toBeDefined();
      expect(body.name).toBe("my-vault");
      expect(body.data).toBe("encrypted-data-base64");
    });

    it("rejects duplicate vault name", async () => {
      // Create first vault
      await app.request("/vault", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "unique-vault",
          data: "data1",
          salt: "salt1",
        }),
      });

      // Try to create with same name
      const res = await app.request("/vault", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "unique-vault",
          data: "data2",
          salt: "salt2",
        }),
      });

      expect(res.status).toBe(409);
    });
  });

  describe("GET /vault", () => {
    it("lists all user vaults", async () => {
      // Create some vaults
      await app.request("/vault", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "vault1", data: "d1", salt: "s1" }),
      });

      await app.request("/vault", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "vault2", data: "d2", salt: "s2" }),
      });

      const res = await app.request("/vault", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.vaults).toHaveLength(2);
    });
  });

  describe("GET /vault/:uid", () => {
    it("returns vault by uid", async () => {
      // Create vault
      const createRes = await app.request("/vault", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "get-vault", data: "data", salt: "salt" }),
      });
      const { uid } = await createRes.json();

      // Get vault
      const res = await app.request(`/vault/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.uid).toBe(uid);
      expect(body.name).toBe("get-vault");
    });

    it("returns 404 for non-existent vault", async () => {
      const res = await app.request("/vault/nonexistent", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe("PUT /vault/:uid", () => {
    it("updates vault data", async () => {
      // Create vault
      const createRes = await app.request("/vault", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "update-vault", data: "old", salt: "s1" }),
      });
      const { uid } = await createRes.json();

      // Update vault
      const res = await app.request(`/vault/${uid}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: "new", salt: "s2" }),
      });

      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.data).toBe("new");
      expect(body.salt).toBe("s2");
    });
  });

  describe("Auth isolation", () => {
    let tokenA: string;
    let tokenB: string;
    let vaultUidA: string;

    beforeEach(async () => {
      const resA = await client.auth.email.register.$post({
        json: { email: "userA@example.com", password: "password123" },
      });
      tokenA = (await resA.json()).token;

      const resB = await client.auth.email.register.$post({
        json: { email: "userB@example.com", password: "password123" },
      });
      tokenB = (await resB.json()).token;

      const createRes = await app.request("/vault", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "a-secret", data: "secret-data", salt: "salt" }),
      });
      vaultUidA = (await createRes.json()).uid;
    });

    it("user B cannot GET user A's vault", async () => {
      const res = await app.request(`/vault/${vaultUidA}`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      expect(res.status).toBe(404);
    });

    it("user B cannot DELETE user A's vault", async () => {
      const res = await app.request(`/vault/${vaultUidA}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /vault/:uid", () => {
    it("deletes vault", async () => {
      // Create vault
      const createRes = await app.request("/vault", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "delete-vault", data: "d", salt: "s" }),
      });
      const { uid } = await createRes.json();

      // Delete vault
      const res = await app.request(`/vault/${uid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);

      // Verify deleted
      const getRes = await app.request(`/vault/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(getRes.status).toBe(404);
    });
  });
});
