/**
 * DocumentClient - Factory for creating typed Collections
 * 
 * Provides a simple interface to create Collection instances
 * with shared configuration (server URL, vault UID, encryption keys).
 */

import { Collection } from "./collection.js";
import type { IHttpClient } from "./interfaces/http-client.js";

export interface DocumentClientOptions {
  /** Server URL */
  serverUrl: string;
  /** Vault UID */
  vaultUid: string;
  /** 256-bit encryption key */
  encryptionKey: Uint8Array;
  /** Optional HMAC key for integrity verification */
  hmacKey?: Uint8Array;
  /** Function to get current auth header */
  getAuthHeader: () => Record<string, string>;
  /** Optional HTTP client (defaults to fetch) */
  httpClient?: IHttpClient;
}

/**
 * DocumentClient creates typed Collections with shared configuration
 * 
 * @example
 * ```ts
 * const client = new DocumentClient({
 *   serverUrl: 'https://api.ursalock.com',
 *   vaultUid: 'vault-123',
 *   encryptionKey: key,
 *   hmacKey: hmacKey,
 *   getAuthHeader: () => ({ Authorization: `Bearer ${token}` }),
 * });
 * 
 * const notes = client.collection<Note>('notes');
 * await notes.create({ title: 'Secret note', content: 'Hello' });
 * ```
 */
export class DocumentClient {
  constructor(private options: DocumentClientOptions) {}

  /**
   * Get a typed collection
   * @param name Collection name
   * @returns Collection instance
   */
  collection<T>(name: string): Collection<T> {
    return new Collection<T>(
      this.options.serverUrl,
      this.options.vaultUid,
      name,
      this.options.encryptionKey,
      this.options.hmacKey,
      this.options.getAuthHeader,
      this.options.httpClient,
    );
  }
}
