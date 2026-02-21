/**
 * Document types for UrsaLock v2
 * E2E encrypted document storage
 */

/** A decrypted document with typed content */
export interface Document<T> {
  uid: string;
  collection: string;
  content: T;
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** Server response shape (encrypted) */
export interface DocumentResponse {
  uid: string;
  collection: string;
  data: string;        // base64 encrypted
  hmac?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** Options for listing documents */
export interface ListOptions {
  collection?: string;
  since?: number;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

/** Sync result */
export interface SyncResult<T> {
  documents: Document<T>[];
  syncedAt: number;
}
