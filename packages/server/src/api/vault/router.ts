/**
 * Vault router - encrypted blob storage CRUD
 * 
 * Refactored to follow SOLID principles:
 * - Uses VaultService for business logic (Single Responsibility)
 * - Depends on IVaultRepository abstraction (Dependency Inversion)
 * - Router only handles HTTP concerns (Single Responsibility)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireAuthMiddleware, requirePermission, requireVaultAccess, type SessionContext } from "#features/auth/middleware.js";
import {
  CreateVaultRequest,
  UpdateVaultRequest,
} from "#api/schemas.js";
import { VaultService } from "#services/vault-service.js";
import { VaultRepository } from "#repositories/vault-repository.js";
import { ApiException, errors } from "#errors.js";

// Create service with repository (Dependency Injection)
const vaultRepo = new VaultRepository();
const vaultService = new VaultService(vaultRepo);

export const vaultRouter = new Hono<{
  Variables: { session: SessionContext };
}>()
  // All vault routes require authentication
  .use("/*", requireAuthMiddleware)

  // List all vaults for user
  .get(
    "/",
    requirePermission("read"),
    (c) => {
      const session = c.get("session");
      const result = vaultService.listVaults(session.user.id);
      
      // Filter vaults by API key scope.
      // In-memory filter is fine here: users have O(10) vaults max.
      // Move to SQL WHERE uid IN (...) if vault count grows significantly.
      if (session.apiKey?.vaultUids) {
        const allowed = new Set(session.apiKey.vaultUids);
        result.vaults = result.vaults.filter(v => allowed.has(v.uid));
      }
      
      return c.json(result);
    },
  )

  // Get vault by name (for sync engine)
  .get(
    "/by-name/:name",
    requirePermission("read"),
    (c) => {
      const session = c.get("session");
      const { name } = c.req.param();
      const vault = vaultService.getVaultByName(name, session.user.id);
      
      // Vault scope check (can't use requireVaultAccess — param is :name not :uid)
      if (session.apiKey?.vaultUids && !session.apiKey.vaultUids.includes(vault.uid)) {
        throw new ApiException(errors.vault_not_found, 404);
      }
      
      return c.json(vault);
    },
  )

  // Get vault by UID
  .get(
    "/:uid",
    requirePermission("read"),
    requireVaultAccess,
    (c) => {
      const session = c.get("session");
      const { uid } = c.req.param();
      return c.json(vaultService.getVaultByUid(uid, session.user.id));
    },
  )

  // Create new vault
  .post(
    "/",
    requirePermission("write"),
    zValidator("json", CreateVaultRequest),
    (c) => {
      const session = c.get("session");
      const { name, data, salt } = c.req.valid("json");
      return c.json(
        vaultService.createVault(session.user.id, { name, data, salt }),
        201
      );
    },
  )

  // Update vault
  .put(
    "/:uid",
    requirePermission("write"),
    requireVaultAccess,
    zValidator("json", UpdateVaultRequest),
    (c) => {
      const session = c.get("session");
      const { uid } = c.req.param();
      const { data, salt, version } = c.req.valid("json");
      return c.json(
        vaultService.updateVault(uid, session.user.id, { data, salt, version })
      );
    },
  )

  // Delete vault
  .delete(
    "/:uid",
    requirePermission("delete"),
    requireVaultAccess,
    (c) => {
      const session = c.get("session");
      const { uid } = c.req.param();
      return c.json(vaultService.deleteVault(uid, session.user.id));
    },
  );
