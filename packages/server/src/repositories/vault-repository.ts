/**
 * Concrete vault repository implementation
 * Wraps existing DB client functions
 * 
 * Vaults are now containers for documents only. They do not store encrypted blobs directly.
 */

import type { IVaultRepository, VaultEntity } from "#interfaces/repositories.js";
import {
  createVault,
  getVaultByUid,
  getVaultByName,
  getVaultsByUserId,
  deleteVault,
} from "#db/client.js";

/**
 * Vault repository using existing DB client
 * Implements IVaultRepository (Dependency Inversion)
 */
export class VaultRepository implements IVaultRepository {
  create(vault: {
    userId: number;
    name: string;
  }): VaultEntity {
    return createVault(vault);
  }

  findByUid(uid: string, userId: number): VaultEntity | undefined {
    return getVaultByUid(uid, userId);
  }

  findByName(name: string, userId: number): VaultEntity | undefined {
    return getVaultByName(name, userId);
  }

  findByUserId(userId: number): VaultEntity[] {
    return getVaultsByUserId(userId);
  }

  delete(uid: string, userId: number): boolean {
    return deleteVault(uid, userId);
  }
}
