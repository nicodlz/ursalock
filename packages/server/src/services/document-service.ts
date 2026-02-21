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
   * Verify vault exists and belongs to user.
   * Only needed for create (to prevent orphan documents referencing non-existent vaults).
   * Read/update/delete queries already filter by userId — no vault exists = empty result.
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
    // Verify vault exists before creating (prevents orphan documents)
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
    const { document, conflict } = this.documentRepo.update(uid, vaultUid, userId, data);
    if (!document) {
      if (conflict) {
        throw new ApiException(errors.document_conflict, 409);
      }
      throw new ApiException(errors.document_not_found, 404);
    }
    return toDocumentResponse(document);
  }

  /**
   * Soft delete a document
   */
  deleteDocument(uid: string, vaultUid: string, userId: number): { success: boolean } {
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
    const documents = this.documentRepo.getSince(vaultUid, userId, since);
    return {
      documents: documents.map(toDocumentResponse),
      syncedAt: Math.floor(Date.now() / 1000),
    };
  }
}
