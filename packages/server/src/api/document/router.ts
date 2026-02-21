/**
 * Document router - individually encrypted items within vaults
 * 
 * Follows SOLID principles:
 * - Uses DocumentService for business logic (Single Responsibility)
 * - Depends on IDocumentRepository abstraction (Dependency Inversion)
 * - Router only handles HTTP concerns (Single Responsibility)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuthMiddleware, requirePermission, requireVaultAccess, assertCollectionAccess, type SessionContext } from "#features/auth/middleware.js";
import {
  CreateDocumentRequest,
  UpdateDocumentRequest,
} from "#api/schemas.js";
import { DocumentService } from "#services/document-service.js";
import { DocumentRepository } from "#repositories/document-repository.js";
import { VaultRepository } from "#repositories/vault-repository.js";

// Create service with repositories (Dependency Injection)
const documentRepo = new DocumentRepository();
const vaultRepo = new VaultRepository();
const documentService = new DocumentService(documentRepo, vaultRepo);

// Query parameter schemas
const ListQuerySchema = z.object({
  collection: z.string().optional(),
  since: z.coerce.number().optional(),
  includeDeleted: z.enum(["true", "false"]).optional().transform(val => val === "true"),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
});

const SyncQuerySchema = z.object({
  since: z.coerce.number(),
});

export const documentRouter = new Hono<{
  Variables: { session: SessionContext };
}>()
  // All document routes require authentication
  .use("/*", requireAuthMiddleware)

  // List documents in a vault
  .get(
    "/vault/:vaultUid/documents",
    requirePermission("read"),
    requireVaultAccess,
    zValidator("query", ListQuerySchema),
    (c) => {
      const session = c.get("session");
      const { vaultUid } = c.req.param();
      const query = c.req.valid("query");
      
      // Check collection access if filtering by specific collection
      if (query.collection) {
        assertCollectionAccess(session, query.collection);
      }
      
      const result = documentService.listDocuments(vaultUid, session.user.id, {
        collection: query.collection,
        since: query.since,
        includeDeleted: query.includeDeleted,
        limit: query.limit,
        offset: query.offset,
      });
      
      // Filter by collection scope when listing all (no specific collection queried)
      if (!query.collection && session.apiKey?.collections) {
        const allowed = new Set(session.apiKey.collections);
        result.documents = result.documents.filter(doc => allowed.has(doc.collection));
      }
      
      return c.json(result);
    },
  )

  // Delta sync - get documents modified since timestamp
  .get(
    "/vault/:vaultUid/documents/sync",
    requirePermission("read"),
    requireVaultAccess,
    zValidator("query", SyncQuerySchema),
    (c) => {
      const session = c.get("session");
      const { vaultUid } = c.req.param();
      const { since } = c.req.valid("query");
      
      const result = documentService.syncDocuments(vaultUid, session.user.id, since);
      
      // Filter by collection scope
      if (session.apiKey?.collections) {
        const allowed = new Set(session.apiKey.collections);
        result.documents = result.documents.filter(doc => allowed.has(doc.collection));
      }
      
      return c.json(result);
    },
  )

  // Get document by UID
  .get(
    "/vault/:vaultUid/documents/:uid",
    requirePermission("read"),
    requireVaultAccess,
    (c) => {
      const session = c.get("session");
      const { vaultUid, uid } = c.req.param();
      
      return c.json(
        documentService.getDocument(uid, vaultUid, session.user.id)
      );
    },
  )

  // Create new document
  .post(
    "/vault/:vaultUid/documents",
    requirePermission("write"),
    requireVaultAccess,
    zValidator("json", CreateDocumentRequest),
    (c) => {
      const session = c.get("session");
      const { vaultUid } = c.req.param();
      const { collection, data, hmac } = c.req.valid("json");
      
      assertCollectionAccess(session, collection);
      
      return c.json(
        documentService.createDocument(session.user.id, vaultUid, {
          collection,
          data,
          hmac,
        }),
        201
      );
    },
  )

  // Update document
  .put(
    "/vault/:vaultUid/documents/:uid",
    requirePermission("write"),
    requireVaultAccess,
    zValidator("json", UpdateDocumentRequest),
    (c) => {
      const session = c.get("session");
      const { vaultUid, uid } = c.req.param();
      const { data, hmac, version } = c.req.valid("json");
      
      return c.json(
        documentService.updateDocument(uid, vaultUid, session.user.id, {
          data,
          hmac,
          version,
        })
      );
    },
  )

  // Delete document (soft delete)
  .delete(
    "/vault/:vaultUid/documents/:uid",
    requirePermission("delete"),
    requireVaultAccess,
    (c) => {
      const session = c.get("session");
      const { vaultUid, uid } = c.req.param();
      
      return c.json(
        documentService.deleteDocument(uid, vaultUid, session.user.id)
      );
    },
  );
