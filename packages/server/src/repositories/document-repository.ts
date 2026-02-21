/**
 * Concrete document repository implementation
 * Wraps existing DB client functions
 */

import type { IDocumentRepository, DocumentEntity } from "#interfaces/repositories.js";
import {
  createDocument,
  getDocumentByUid,
  listDocuments,
  updateDocument,
  softDeleteDocument,
  getDocumentsSince,
} from "#db/client.js";

/**
 * Document repository using existing DB client
 * Implements IDocumentRepository (Dependency Inversion)
 */
export class DocumentRepository implements IDocumentRepository {
  create(document: {
    vaultUid: string;
    userId: number;
    collection: string;
    data: string;
    hmac?: string;
  }): DocumentEntity {
    return createDocument(document);
  }

  findByUid(uid: string, vaultUid: string, userId: number): DocumentEntity | undefined {
    return getDocumentByUid(uid, vaultUid, userId);
  }

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
  ): DocumentEntity[] {
    return listDocuments(vaultUid, userId, opts);
  }

  update(
    uid: string,
    vaultUid: string,
    userId: number,
    data: {
      data: string;
      hmac?: string;
      version?: number;
    }
  ): DocumentEntity | undefined {
    return updateDocument(uid, vaultUid, userId, data);
  }

  softDelete(uid: string, vaultUid: string, userId: number): DocumentEntity | undefined {
    return softDeleteDocument(uid, vaultUid, userId);
  }

  getSince(vaultUid: string, userId: number, since: number): DocumentEntity[] {
    return getDocumentsSince(vaultUid, userId, since);
  }
}
