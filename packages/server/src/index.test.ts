/**
 * Server API tests
 * Updated to handle CSRF double-submit cookie pattern
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "#app.js";
import { getCsrfToken, csrfHeaders } from "./__tests__/test-utils.js";

let app = createApp();

beforeEach(() => {
  app = createApp();
});

/** Register a user and return token */
async function register(email: string, password = "password123") {
  const csrf = await csrfHeaders(app);
  const res = await app.request("/auth/email/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrf },
    body: JSON.stringify({ email, password }),
  });
  return { res, body: await res.json() };
}

/** Login and return token */
async function login(email: string, password = "password123") {
  const csrf = await csrfHeaders(app);
  const res = await app.request("/auth/email/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrf },
    body: JSON.stringify({ email, password }),
  });
  return { res, body: await res.json() };
}

describe("Health check", () => {
  it("returns ok status", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });
});

describe("Auth - Email/Password", () => {
  describe("POST /auth/email/register", () => {
    it("creates a new user and returns token", async () => {
      const { res, body } = await register("test@example.com");

      expect(res.status).toBe(200);
      expect(body.user.id).toBeDefined();
      expect(body.user.email).toBe("test@example.com");
      expect(body.token).toBeDefined();
    });

    it("rejects duplicate email", async () => {
      await register("dupe@example.com");
      const { res, body } = await register("dupe@example.com");

      expect(res.status).toBe(409);
      expect(body.error.code).toBe("email_already_exists");
    });

    it("validates email format", async () => {
      const { res } = await register("not-an-email");
      expect(res.status).toBe(400);
    });

    it("validates password length", async () => {
      const { res } = await register("test@example.com", "short");
      expect(res.status).toBe(400);
    });
  });

  describe("POST /auth/email/login", () => {
    beforeEach(async () => {
      await register("login@example.com");
    });

    it("returns token for valid credentials", async () => {
      const { res, body } = await login("login@example.com");

      expect(res.status).toBe(200);
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe("login@example.com");
    });

    it("rejects invalid password", async () => {
      const { res, body } = await login("login@example.com", "wrongpassword");

      expect(res.status).toBe(401);
      expect(body.error.code).toBe("invalid_credentials");
    });

    it("rejects non-existent email", async () => {
      const { res } = await login("nobody@example.com");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /auth/me", () => {
    it("returns current user with valid token", async () => {
      const { body: regBody } = await register("me@example.com");

      const res = await app.request("/auth/me", {
        headers: { Authorization: `Bearer ${regBody.token}` },
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
    const { body } = await register("vault@example.com");
    token = body.token;
  });

  async function createVault(name: string, data: string, salt: string) {
    const csrf = await csrfHeaders(app);
    return app.request("/vault", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...csrf },
      body: JSON.stringify({ name, data, salt }),
    });
  }

  describe("POST /vault", () => {
    it("creates a new vault", async () => {
      const res = await createVault("my-vault", "encrypted-data-base64", "salt-base64");

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.uid).toBeDefined();
      expect(body.name).toBe("my-vault");
      expect(body.data).toBe("encrypted-data-base64");
    });

    it("rejects duplicate vault name", async () => {
      await createVault("unique-vault", "data1", "salt1");
      const res = await createVault("unique-vault", "data2", "salt2");
      expect(res.status).toBe(409);
    });
  });

  describe("GET /vault", () => {
    it("lists all user vaults", async () => {
      await createVault("vault1", "d1", "s1");
      await createVault("vault2", "d2", "s2");

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
      const createRes = await createVault("get-vault", "data", "salt");
      const { uid } = await createRes.json();

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
      const createRes = await createVault("update-vault", "old", "s1");
      const { uid } = await createRes.json();

      const csrf = await csrfHeaders(app);
      const res = await app.request(`/vault/${uid}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...csrf },
        body: JSON.stringify({ data: "new", salt: "s2" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBe("new");
      expect(body.salt).toBe("s2");
    });
  });

  describe("DELETE /vault/:uid", () => {
    it("deletes vault", async () => {
      const createRes = await createVault("delete-vault", "d", "s");
      const { uid } = await createRes.json();

      const csrf = await csrfHeaders(app);
      const res = await app.request(`/vault/${uid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, ...csrf },
      });

      expect(res.status).toBe(200);

      const getRes = await app.request(`/vault/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(getRes.status).toBe(404);
    });
  });
});
