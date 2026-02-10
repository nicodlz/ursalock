/**
 * Concrete vault repository implementation
 * Wraps existing DB client functions
 */

import type { IVaultRepository, VaultEntity } from "#interfaces/repositories.js";
import {
  createVault,
  getVaultByUid,
  getVaultByName,
  getVaultsByUserId,
  updateVault,
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
    data: string;
    salt: string;
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

  update(
    uid: string,
    userId: number,
    data: {
      data: string;
      salt: string;
      version?: number;
    }
  ): VaultEntity | undefined {
    return updateVault(uid, userId, data);
  }

  delete(uid: string, userId: number): boolean {
    return deleteVault(uid, userId);
  }
}
