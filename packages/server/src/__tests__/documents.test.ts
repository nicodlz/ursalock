/**
 * Document API integration tests
 *
 * Tests the full CRUD lifecycle for individually encrypted documents within vaults.
 * Uses Hono's app.request() for direct HTTP-level testing.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "#app.js";
import { getCsrfToken } from "./test-utils.js";

// Fresh app per test to reset in-memory rate limiter
let app = createApp();

beforeEach(() => {
  app = createApp();
});

/** Helper: register a user and return the auth token */
async function registerAndGetToken(email = `doc-${crypto.randomUUID()}@test.com`) {
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

/** Helper: create a vault and return the UID */
async function createVault(token: string, name: string) {
  const csrf = await getCsrfToken(app);
  const res = await app.request("/vault", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Cookie": `__csrf=${csrf}`,
      "X-CSRF-Token": csrf,
    },
    body: JSON.stringify({ name, data: "encrypted-vault", salt: "salt" }),
  });
  const body = await res.json();
  return body.uid as string;
}

/** Helper: create a document and return the response */
async function createDocument(
  token: string,
  vaultUid: string,
  collection: string,
  data = "encrypted-doc-base64",
  hmac?: string,
) {
  const csrf = await getCsrfToken(app);
  const res = await app.request(`/vault/${vaultUid}/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Cookie": `__csrf=${csrf}`,
      "X-CSRF-Token": csrf,
    },
    body: JSON.stringify({ collection, data, hmac }),
  });
  return { res, body: await res.json() };
}

describe("Document CRUD", () => {
  let token: string;
  let vaultUid: string;

  beforeEach(async () => {
    token = await registerAndGetToken();
    vaultUid = await createVault(token, `vault-${crypto.randomUUID()}`);
  });

  // ── CREATE ────────────────────────────────────────────

  it("creates a document and returns 201", async () => {
    const { res, body } = await createDocument(token, vaultUid, "passwords");

    expect(res.status).toBe(201);
    expect(body.uid).toBeDefined();
    expect(body.collection).toBe("passwords");
    expect(body.data).toBe("encrypted-doc-base64");
    expect(body.hmac).toBeNull();
    expect(body.version).toBe(1);
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
    expect(body.deletedAt).toBeNull();
  });

  it("creates a document with HMAC", async () => {
    const { res, body } = await createDocument(
      token,
      vaultUid,
      "notes",
      "encrypted-note",
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
    );

    expect(res.status).toBe(201);
    expect(body.hmac).toBe("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2");
  });

  it("requires vault ownership to create documents", async () => {
    const otherToken = await registerAndGetToken();
    const { res } = await createDocument(otherToken, vaultUid, "passwords");

    expect(res.status).toBe(404); // Vault not found for other user
  });

  it("returns 404 when creating document in non-existent vault", async () => {
    const { res } = await createDocument(token, "nonexistent-vault", "passwords");

    expect(res.status).toBe(404);
  });

  // ── READ ──────────────────────────────────────────────

  it("retrieves a document by UID", async () => {
    const { body: created } = await createDocument(token, vaultUid, "passwords");

    const res = await app.request(`/vault/${vaultUid}/documents/${created.uid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.uid).toBe(created.uid);
    expect(body.collection).toBe("passwords");
  });

  it("returns 404 for non-existent document", async () => {
    const res = await app.request(`/vault/${vaultUid}/documents/nonexistent-uid`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });

  it("prevents accessing another user's documents", async () => {
    const { body: created } = await createDocument(token, vaultUid, "passwords");
    const otherToken = await registerAndGetToken();

    const res = await app.request(`/vault/${vaultUid}/documents/${created.uid}`, {
      headers: { Authorization: `Bearer ${otherToken}` },
    });

    expect(res.status).toBe(404);
  });

  // ── LIST ──────────────────────────────────────────────

  it("lists all documents in a vault", async () => {
    await createDocument(token, vaultUid, "passwords", "doc1");
    await createDocument(token, vaultUid, "notes", "doc2");
    await createDocument(token, vaultUid, "passwords", "doc3");

    const res = await app.request(`/vault/${vaultUid}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents).toHaveLength(3);
  });

  it("filters documents by collection", async () => {
    await createDocument(token, vaultUid, "passwords", "doc1");
    await createDocument(token, vaultUid, "notes", "doc2");
    await createDocument(token, vaultUid, "passwords", "doc3");

    const res = await app.request(`/vault/${vaultUid}/documents?collection=passwords`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents).toHaveLength(2);
    body.documents.forEach((doc: any) => {
      expect(doc.collection).toBe("passwords");
    });
  });

  it("supports pagination with limit and offset", async () => {
    await createDocument(token, vaultUid, "passwords", "doc1");
    await createDocument(token, vaultUid, "passwords", "doc2");
    await createDocument(token, vaultUid, "passwords", "doc3");
    await createDocument(token, vaultUid, "passwords", "doc4");

    const res = await app.request(`/vault/${vaultUid}/documents?limit=2&offset=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents).toHaveLength(2);
  });

  it("excludes soft-deleted documents by default", async () => {
    const { body: doc1 } = await createDocument(token, vaultUid, "passwords", "doc1");
    await createDocument(token, vaultUid, "passwords", "doc2");

    // Soft delete doc1
    const csrf = await getCsrfToken(app);
    await app.request(`/vault/${vaultUid}/documents/${doc1.uid}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Cookie": `__csrf=${csrf}`,
        "X-CSRF-Token": csrf,
      },
    });

    const res = await app.request(`/vault/${vaultUid}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].data).toBe("doc2");
  });

  it("includes soft-deleted documents when includeDeleted=true", async () => {
    const { body: doc1 } = await createDocument(token, vaultUid, "passwords", "doc1");
    await createDocument(token, vaultUid, "passwords", "doc2");

    // Soft delete doc1
    const csrf = await getCsrfToken(app);
    await app.request(`/vault/${vaultUid}/documents/${doc1.uid}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Cookie": `__csrf=${csrf}`,
        "X-CSRF-Token": csrf,
      },
    });

    const res = await app.request(`/vault/${vaultUid}/documents?includeDeleted=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents).toHaveLength(2);
    const deleted = body.documents.find((d: any) => d.uid === doc1.uid);
    expect(deleted.deletedAt).toBeDefined();
    expect(deleted.deletedAt).not.toBeNull();
  });

  // ── UPDATE ────────────────────────────────────────────

  it("updates a document's data", async () => {
    const { body: created } = await createDocument(token, vaultUid, "passwords", "old-data");

    const csrf = await getCsrfToken(app);
    const res = await app.request(`/vault/${vaultUid}/documents/${created.uid}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cookie": `__csrf=${csrf}`,
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({ data: "new-data", hmac: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBe("new-data");
    expect(body.hmac).toBe("b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3");
    expect(body.version).toBe(2);
  });

  it("supports optimistic locking with version", async () => {
    const { body: created } = await createDocument(token, vaultUid, "passwords");

    const csrf = await getCsrfToken(app);
    const res = await app.request(`/vault/${vaultUid}/documents/${created.uid}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cookie": `__csrf=${csrf}`,
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({ data: "updated", version: 1 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(2);
  });

  it("returns 409 on version conflict", async () => {
    const { body: created } = await createDocument(token, vaultUid, "passwords");

    // First update
    const csrf = await getCsrfToken(app);
    await app.request(`/vault/${vaultUid}/documents/${created.uid}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cookie": `__csrf=${csrf}`,
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({ data: "update1" }),
    });

    // Second update with stale version
    const res = await app.request(`/vault/${vaultUid}/documents/${created.uid}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cookie": `__csrf=${csrf}`,
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({ data: "update2", version: 1 }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("document_conflict");
  });

  // ── DELETE ────────────────────────────────────────────

  it("soft deletes a document", async () => {
    const { body: created } = await createDocument(token, vaultUid, "passwords");

    const csrf = await getCsrfToken(app);
    const res = await app.request(`/vault/${vaultUid}/documents/${created.uid}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Cookie": `__csrf=${csrf}`,
        "X-CSRF-Token": csrf,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Document still exists but is marked deleted
    const getRes = await app.request(
      `/vault/${vaultUid}/documents?includeDeleted=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const getBody = await getRes.json();
    const deleted = getBody.documents.find((d: any) => d.uid === created.uid);
    expect(deleted.deletedAt).not.toBeNull();
  });

  it("returns 404 when deleting non-existent document", async () => {
    const csrf = await getCsrfToken(app);
    const res = await app.request(`/vault/${vaultUid}/documents/nonexistent`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Cookie": `__csrf=${csrf}`,
        "X-CSRF-Token": csrf,
      },
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting already deleted document", async () => {
    const { body: created } = await createDocument(token, vaultUid, "passwords");

    const csrf = await getCsrfToken(app);
    // First delete
    await app.request(`/vault/${vaultUid}/documents/${created.uid}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Cookie": `__csrf=${csrf}`,
        "X-CSRF-Token": csrf,
      },
    });

    // Second delete
    const res = await app.request(`/vault/${vaultUid}/documents/${created.uid}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Cookie": `__csrf=${csrf}`,
        "X-CSRF-Token": csrf,
      },
    });

    expect(res.status).toBe(404);
  });

  // ── DELTA SYNC ────────────────────────────────────────

  it("returns documents modified since timestamp", async () => {
    const now = Math.floor(Date.now() / 1000);
    
    // Create some documents
    await createDocument(token, vaultUid, "passwords", "doc1");
    await new Promise(resolve => setTimeout(resolve, 1100)); // Wait to ensure timestamp difference
    
    const syncTimestamp = Math.floor(Date.now() / 1000);
    
    await createDocument(token, vaultUid, "passwords", "doc2");
    await createDocument(token, vaultUid, "notes", "doc3");

    const res = await app.request(
      `/vault/${vaultUid}/documents/sync?since=${syncTimestamp}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents).toHaveLength(2);
    expect(body.syncedAt).toBeDefined();
    expect(body.syncedAt).toBeGreaterThanOrEqual(syncTimestamp);
  });

  it("sync includes deleted documents", async () => {
    const { body: doc1 } = await createDocument(token, vaultUid, "passwords");
    
    const syncTimestamp = Math.floor(Date.now() / 1000);
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Delete a document
    const csrf = await getCsrfToken(app);
    await app.request(`/vault/${vaultUid}/documents/${doc1.uid}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Cookie": `__csrf=${csrf}`,
        "X-CSRF-Token": csrf,
      },
    });

    const res = await app.request(
      `/vault/${vaultUid}/documents/sync?since=${syncTimestamp}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].deletedAt).not.toBeNull();
  });

  // ── AUTH ENFORCEMENT ──────────────────────────────────

  it("requires authentication for all document operations", async () => {
    const res = await app.request(`/vault/${vaultUid}/documents`);
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    const res = await app.request(`/vault/${vaultUid}/documents`, {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(401);
  });
});
