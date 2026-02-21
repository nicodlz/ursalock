/**
 * Document service - business logic layer
 * Follows Single Responsibility Principle - separates business logic from routing
 */

import type { IDocumentRepository, IVaultRepository, DocumentEntity } from "#interfaces/repositories.js";
import { ApiException, errors } from "#errors.js";
import type { DocumentResponse, DocumentListResponse, DocumentSyncResponse } from "#api/schemas.js";

/**
 * Transform DB document entity to API response
 * Separates data transformation logic (Single Responsibility)
 */
function toDocumentResponse(document: DocumentEntity): DocumentResponse {
  return {
    uid: document.uid,
    collection: document.collection,
    data: document.data,
    hmac: document.hmac,
    version: document.version,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    deletedAt: document.deletedAt,
  };
}

/**
 * Document service
 * Contains business logic for document operations
 * Depends on IDocumentRepository and IVaultRepository abstractions (Dependency Inversion)
 */
export class DocumentService {
  constructor(
    private documentRepo: IDocumentRepository,
    private vaultRepo: IVaultRepository
  ) {}

  /**
   * Verify vault ownership before any operation
   * Throws 404 if vault doesn't exist or doesn't belong to user
   */
  private verifyVaultOwnership(vaultUid: string, userId: number): void {
    const vault = this.vaultRepo.findByUid(vaultUid, userId);
    if (!vault) {
      throw new ApiException(errors.vault_not_found, 404);
    }
  }

  /**
   * Create a new document
   */
  createDocument(
    userId: number,
    vaultUid: string,
    data: { collection: string; data: string; hmac?: string }
  ): DocumentResponse {
    // Verify vault ownership first
    this.verifyVaultOwnership(vaultUid, userId);

    const document = this.documentRepo.create({
      vaultUid,
      userId,
      collection: data.collection,
      data: data.data,
      hmac: data.hmac,
    });

    return toDocumentResponse(document);
  }

  /**
   * Get document by UID
   */
  getDocument(uid: string, vaultUid: string, userId: number): DocumentResponse {
    // Verify vault ownership first
    this.verifyVaultOwnership(vaultUid, userId);

    const document = this.documentRepo.findByUid(uid, vaultUid, userId);
    if (!document) {
      throw new ApiException(errors.document_not_found, 404);
    }
    return toDocumentResponse(document);
  }

  /**
   * List documents in a vault
   */
  listDocuments(
    vaultUid: string,
    userId: number,
    opts?: {
      collection?: string;
      since?: number;
      includeDeleted?: boolean;
      limit?: number;
      offset?: number;
    }
  ): DocumentListResponse {
    // Verify vault ownership first
    this.verifyVaultOwnership(vaultUid, userId);

    const documents = this.documentRepo.list(vaultUid, userId, opts);
    return {
      documents: documents.map(toDocumentResponse),
    };
  }

  /**
   * Update a document
   */
  updateDocument(
    uid: string,
    vaultUid: string,
    userId: number,
    data: { data: string; hmac?: string; version?: number }
  ): DocumentResponse {
    // Verify vault ownership first
    this.verifyVaultOwnership(vaultUid, userId);

    const document = this.documentRepo.update(uid, vaultUid, userId, data);
    if (!document) {
      // If version was provided, check if document exists to distinguish 404 vs 409
      if (data.version != null) {
        const existing = this.documentRepo.findByUid(uid, vaultUid, userId);
        if (existing) {
          throw new ApiException(errors.document_conflict, 409);
        }
      }
      throw new ApiException(errors.document_not_found, 404);
    }
    return toDocumentResponse(document);
  }

  /**
   * Soft delete a document
   */
  deleteDocument(uid: string, vaultUid: string, userId: number): { success: boolean } {
    // Verify vault ownership first
    this.verifyVaultOwnership(vaultUid, userId);

    const document = this.documentRepo.softDelete(uid, vaultUid, userId);
    if (!document) {
      throw new ApiException(errors.document_not_found, 404);
    }
    return { success: true };
  }

  /**
   * Delta sync - get documents modified since timestamp
   */
  syncDocuments(vaultUid: string, userId: number, since: number): DocumentSyncResponse {
    // Verify vault ownership first
    this.verifyVaultOwnership(vaultUid, userId);

    const documents = this.documentRepo.getSince(vaultUid, userId, since);
    return {
      documents: documents.map(toDocumentResponse),
      syncedAt: Math.floor(Date.now() / 1000),
    };
  }
}
