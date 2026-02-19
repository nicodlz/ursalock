/**
 * Vault service - business logic layer
 * Follows Single Responsibility Principle - separates business logic from routing
 */

import type { IVaultRepository, VaultEntity } from "#interfaces/repositories.js";
import { ApiException, errors } from "#errors.js";
import type { VaultResponse, VaultsListResponse } from "#api/schemas.js";

/**
 * Transform DB vault entity to API response
 * Separates data transformation logic (Single Responsibility)
 */
function toVaultResponse(vault: VaultEntity): VaultResponse {
  return {
    uid: vault.uid,
    name: vault.name,
    data: vault.data,
    salt: vault.salt,
    version: vault.version,
    updatedAt: vault.updatedAt,
  };
}

/**
 * Vault service
 * Contains business logic for vault operations
 * Depends on IVaultRepository abstraction (Dependency Inversion)
 */
export class VaultService {
  constructor(private vaultRepo: IVaultRepository) {}

  /**
   * List all vaults for a user
   */
  listVaults(userId: number): VaultsListResponse {
    const vaults = this.vaultRepo.findByUserId(userId);
    return {
      vaults: vaults.map(toVaultResponse),
    };
  }

  /**
   * Get vault by name
   */
  getVaultByName(name: string, userId: number): VaultResponse {
    const vault = this.vaultRepo.findByName(name, userId);
    if (!vault) {
      throw new ApiException(errors.vault_not_found, 404);
    }
    return toVaultResponse(vault);
  }

  /**
   * Get vault by UID
   */
  getVaultByUid(uid: string, userId: number): VaultResponse {
    const vault = this.vaultRepo.findByUid(uid, userId);
    if (!vault) {
      throw new ApiException(errors.vault_not_found, 404);
    }
    return toVaultResponse(vault);
  }

  /**
   * Create a new vault
   */
  createVault(
    userId: number,
    data: { name: string; data: string; salt: string }
  ): VaultResponse {
    // Check if vault with same name exists
    const existing = this.vaultRepo.findByName(data.name, userId);
    if (existing) {
      throw new ApiException(errors.vault_already_exists(data.name), 409);
    }

    const vault = this.vaultRepo.create({
      userId,
      name: data.name,
      data: data.data,
      salt: data.salt,
    });

    return toVaultResponse(vault);
  }

  /**
   * Update a vault
   */
  updateVault(
    uid: string,
    userId: number,
    data: { data: string; salt: string; version?: number }
  ): VaultResponse {
    const vault = this.vaultRepo.update(uid, userId, data);
    if (!vault) {
      // If version was provided, check if vault exists to distinguish 404 vs 409
      if (data.version != null) {
        const existing = this.vaultRepo.findByUid(uid, userId);
        if (existing) {
          throw new ApiException(
            { code: "version_conflict", message: "Vault has been modified by another request" },
            409,
          );
        }
      }
      throw new ApiException(errors.vault_not_found, 404);
    }
    return toVaultResponse(vault);
  }

  /**
   * Delete a vault
   */
  deleteVault(uid: string, userId: number): { success: boolean } {
    const deleted = this.vaultRepo.delete(uid, userId);
    if (!deleted) {
      throw new ApiException(errors.vault_not_found, 404);
    }
    return { success: true };
  }
}
