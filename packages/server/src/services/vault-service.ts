/**
 * Vault service - business logic layer
 * Follows Single Responsibility Principle - separates business logic from routing
 * 
 * Vaults are now containers for documents only. They do not store encrypted blobs directly.
 * Use the Document API (@ursalock/client DocumentClient) for storing encrypted data.
 */

import type { IVaultRepository, VaultEntity } from "#interfaces/repositories.js";
import { ApiException, errors, errorBuilders } from "#errors.js";
import type { VaultResponse, VaultsListResponse } from "#api/schemas.js";

/**
 * Transform DB vault entity to API response
 * Separates data transformation logic (Single Responsibility)
 */
function toVaultResponse(vault: VaultEntity): VaultResponse {
  return {
    uid: vault.uid,
    name: vault.name,
    version: vault.version,
    updatedAt: vault.updatedAt,
  };
}

/**
 * Vault service
 * Contains business logic for vault container operations
 * Depends on IVaultRepository abstraction (Dependency Inversion)
 */
export class VaultService {
  constructor(private vaultRepo: IVaultRepository) {}

  /**
   * List all vault containers for a user
   */
  listVaults(userId: number): VaultsListResponse {
    const vaults = this.vaultRepo.findByUserId(userId);
    return {
      vaults: vaults.map(toVaultResponse),
    };
  }

  /**
   * Get vault container by name
   */
  getVaultByName(name: string, userId: number): VaultResponse {
    const vault = this.vaultRepo.findByName(name, userId);
    if (!vault) {
      throw new ApiException(errors.vault_not_found, 404);
    }
    return toVaultResponse(vault);
  }

  /**
   * Get vault container by UID
   */
  getVaultByUid(uid: string, userId: number): VaultResponse {
    const vault = this.vaultRepo.findByUid(uid, userId);
    if (!vault) {
      throw new ApiException(errors.vault_not_found, 404);
    }
    return toVaultResponse(vault);
  }

  /**
   * Create a new vault container
   */
  createVault(
    userId: number,
    data: { name: string }
  ): VaultResponse {
    // Check if vault with same name exists
    const existing = this.vaultRepo.findByName(data.name, userId);
    if (existing) {
      throw new ApiException(errorBuilders.vaultAlreadyExists(data.name), 409);
    }

    const vault = this.vaultRepo.create({
      userId,
      name: data.name,
    });

    return toVaultResponse(vault);
  }

  /**
   * Delete a vault container
   */
  deleteVault(uid: string, userId: number): { success: boolean } {
    const deleted = this.vaultRepo.delete(uid, userId);
    if (!deleted) {
      throw new ApiException(errors.vault_not_found, 404);
    }
    return { success: true };
  }
}
