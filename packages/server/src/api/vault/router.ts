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
import { requireAuthMiddleware, type SessionContext } from "#features/auth/middleware.js";
import {
  CreateVaultRequest,
  UpdateVaultRequest,
} from "#api/schemas.js";
import { VaultService } from "#services/vault-service.js";
import { VaultRepository } from "#repositories/vault-repository.js";

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
    (c) => {
      const session = c.get("session");
      return c.json(vaultService.listVaults(session.user.id));
    },
  )

  // Get vault by name (for sync engine)
  .get(
    "/by-name/:name",
    (c) => {
      const session = c.get("session");
      const { name } = c.req.param();
      return c.json(vaultService.getVaultByName(name, session.user.id));
    },
  )

  // Get vault by UID
  .get(
    "/:uid",
    (c) => {
      const session = c.get("session");
      const { uid } = c.req.param();
      return c.json(vaultService.getVaultByUid(uid, session.user.id));
    },
  )

  // Create new vault
  .post(
    "/",
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
    (c) => {
      const session = c.get("session");
      const { uid } = c.req.param();
      return c.json(vaultService.deleteVault(uid, session.user.id));
    },
  );
