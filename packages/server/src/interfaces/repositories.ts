/**
 * Repository interfaces for data access
 * Follows Dependency Inversion Principle - controllers depend on abstractions
 */

/** Vault entity from database */
export interface VaultEntity {
  uid: string;
  userId: number;
  name: string;
  data: string;
  salt: string;
  version: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Vault repository interface
 * Abstracts database operations for vaults
 */
export interface IVaultRepository {
  /**
   * Create a new vault
   */
  create(vault: {
    userId: number;
    name: string;
    data: string;
    salt: string;
  }): VaultEntity;

  /**
   * Find vault by UID and user ID
   */
  findByUid(uid: string, userId: number): VaultEntity | undefined;

  /**
   * Find vault by name and user ID
   */
  findByName(name: string, userId: number): VaultEntity | undefined;

  /**
   * Find all vaults for a user
   */
  findByUserId(userId: number): VaultEntity[];

  /**
   * Update a vault
   */
  update(
    uid: string,
    userId: number,
    data: {
      data: string;
      salt: string;
      version?: number;
    }
  ): VaultEntity | undefined;

  /**
   * Delete a vault
   */
  delete(uid: string, userId: number): boolean;
}
