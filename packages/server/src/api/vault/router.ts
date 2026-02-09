/**
 * Vault router - encrypted blob storage CRUD
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createVault,
  getVaultByUid,
  getVaultByName,
  getVaultsByUserId,
  updateVault,
  deleteVault,
} from "#db/client.js";
import { requireAuthMiddleware, type SessionContext } from "#features/auth/middleware.js";
import { errors, ApiException } from "#errors.js";
import {
  CreateVaultRequest,
  UpdateVaultRequest,
  type VaultResponse,
  type VaultsListResponse,
} from "#api/schemas.js";

/** Transform DB vault to API response */
function toVaultResponse(vault: {
  uid: string;
  name: string;
  data: string;
  salt: string;
  version: number;
  updatedAt: number;
}): VaultResponse {
  return {
    uid: vault.uid,
    name: vault.name,
    data: vault.data,
    salt: vault.salt,
    version: vault.version,
    updatedAt: vault.updatedAt,
  };
}

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
      const vaults = getVaultsByUserId(session.user.id);

      return c.json({
        vaults: vaults.map(toVaultResponse),
      } satisfies VaultsListResponse);
    },
  )

  // Get vault by name (for sync engine)
  .get(
    "/by-name/:name",
    (c) => {
      const session = c.get("session");
      const { name } = c.req.param();

      const vault = getVaultByName(name, session.user.id);
      if (!vault) {
        throw new ApiException(errors.vault_not_found, 404);
      }

      return c.json(toVaultResponse(vault) satisfies VaultResponse);
    },
  )

  // Get vault by UID
  .get(
    "/:uid",
    (c) => {
      const session = c.get("session");
      const { uid } = c.req.param();

      const vault = getVaultByUid(uid, session.user.id);
      if (!vault) {
        throw new ApiException(errors.vault_not_found, 404);
      }

      return c.json(toVaultResponse(vault) satisfies VaultResponse);
    },
  )

  // Create new vault
  .post(
    "/",
    zValidator("json", CreateVaultRequest),
    (c) => {
      const session = c.get("session");
      const { name, data, salt } = c.req.valid("json");

      // Check if vault with same name exists
      const existing = getVaultByName(name, session.user.id);
      if (existing) {
        throw new ApiException(errors.vault_already_exists(name), 409);
      }

      const vault = createVault({
        userId: session.user.id,
        name,
        data,
        salt,
      });

      return c.json(toVaultResponse(vault) satisfies VaultResponse, 201);
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

      const vault = updateVault(uid, session.user.id, { data, salt, version });
      if (!vault) {
        throw new ApiException(errors.vault_not_found, 404);
      }

      return c.json(toVaultResponse(vault) satisfies VaultResponse);
    },
  )

  // Delete vault
  .delete(
    "/:uid",
    (c) => {
      const session = c.get("session");
      const { uid } = c.req.param();

      const deleted = deleteVault(uid, session.user.id);
      if (!deleted) {
        throw new ApiException(errors.vault_not_found, 404);
      }

      return c.json({ success: true });
    },
  );
