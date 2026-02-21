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

/** Document entity from database */
export interface DocumentEntity {
  uid: string;
  vaultUid: string;
  userId: number;
  collection: string;
  data: string;
  hmac: string | null;
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
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

/**
 * Document repository interface
 * Abstracts database operations for documents
 */
export interface IDocumentRepository {
  /**
   * Create a new document
   */
  create(document: {
    vaultUid: string;
    userId: number;
    collection: string;
    data: string;
    hmac?: string;
  }): DocumentEntity;

  /**
   * Find document by UID within a vault
   */
  findByUid(uid: string, vaultUid: string, userId: number): DocumentEntity | undefined;

  /**
   * List documents in a vault with optional filters
   */
  list(
    vaultUid: string,
    userId: number,
    opts?: {
      collection?: string;
      since?: number;
      includeDeleted?: boolean;
      limit?: number;
      offset?: number;
    }
  ): DocumentEntity[];

  /**
   * Update a document
   */
  update(
    uid: string,
    vaultUid: string,
    userId: number,
    data: {
      data: string;
      hmac?: string;
      version?: number;
    }
  ): DocumentEntity | undefined;

  /**
   * Soft delete a document
   */
  softDelete(uid: string, vaultUid: string, userId: number): DocumentEntity | undefined;

  /**
   * Get documents modified since timestamp (for delta sync)
   */
  getSince(vaultUid: string, userId: number, since: number): DocumentEntity[];
}
