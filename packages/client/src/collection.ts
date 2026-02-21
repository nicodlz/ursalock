/**
 * Collection - Typed E2E encrypted document storage
 * 
 * Encrypts documents client-side using AES-GCM and optionally HMAC-SHA256
 * for integrity verification in transit/storage.
 */

import { encrypt, decrypt, computeHmac, verifyHmac } from "@ursalock/crypto";
import type { IHttpClient } from "./interfaces/http-client.js";
import type { Document, DocumentResponse, ListOptions, SyncResult } from "./document.js";

/**
 * Collection provides typed, encrypted document storage
 * 
 * All documents are encrypted client-side before being sent to the server.
 * The server never sees plaintext content, only encrypted blobs.
 */
export class Collection<T> {
  constructor(
    private serverUrl: string,
    private vaultUid: string,
    private collectionName: string,
    private encryptionKey: Uint8Array,
    private hmacKey: Uint8Array | undefined,
    private getAuthHeader: () => Record<string, string>,
    private httpClient?: IHttpClient,
  ) {}

  /**
   * Create a new document
   * @param content Document content (will be encrypted)
   * @returns Created document with server-generated uid
   */
  async create(content: T): Promise<Document<T>> {
    const { data, hmac } = await this.encryptContent(content);

    const body: Record<string, unknown> = {
      collection: this.collectionName,
      data,
    };

    if (hmac) {
      body.hmac = hmac;
    }

    const response = await this.request<DocumentResponse>(`/vault/${this.vaultUid}/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return this.decryptDocument(response);
  }

  /**
   * Get a document by uid
   * @param uid Document uid
   * @returns Decrypted document
   */
  async get(uid: string): Promise<Document<T>> {
    const response = await this.request<DocumentResponse>(`/vault/${this.vaultUid}/documents/${uid}`);
    return this.decryptDocument(response);
  }

  /**
   * List documents in this collection
   * @param options Filter options
   * @returns Array of decrypted documents
   */
  async list(options?: Omit<ListOptions, 'collection'>): Promise<Document<T>[]> {
    const params = new URLSearchParams();
    params.set("collection", this.collectionName);

    if (options?.since !== undefined) {
      params.set("since", String(options.since));
    }
    if (options?.includeDeleted !== undefined) {
      params.set("includeDeleted", String(options.includeDeleted));
    }
    if (options?.limit !== undefined) {
      params.set("limit", String(options.limit));
    }
    if (options?.offset !== undefined) {
      params.set("offset", String(options.offset));
    }

    const response = await this.request<{ documents: DocumentResponse[] }>(
      `/vault/${this.vaultUid}/documents?${params}`
    );

    return Promise.all(response.documents.map((doc) => this.decryptDocument(doc)));
  }

  /**
   * Update a document
   * @param uid Document uid
   * @param content Partial content to merge (or full replacement)
   * @returns Updated document
   */
  async update(uid: string, content: Partial<T>): Promise<Document<T>> {
    // Fetch current document to merge partial content
    const current = await this.get(uid);
    const merged = { ...current.content, ...content };

    const { data, hmac } = await this.encryptContent(merged);

    const body: Record<string, unknown> = {
      data,
      version: current.version,
    };

    if (hmac) {
      body.hmac = hmac;
    }

    const response = await this.request<DocumentResponse>(`/vault/${this.vaultUid}/documents/${uid}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return this.decryptDocument(response);
  }

  /**
   * Delete a document (soft delete)
   * @param uid Document uid
   */
  async delete(uid: string): Promise<void> {
    await this.request<{ success: true }>(`/vault/${this.vaultUid}/documents/${uid}`, {
      method: "DELETE",
    });
  }

  /**
   * Sync documents since a timestamp
   * @param since Timestamp (ms) to sync from
   * @returns Sync result with documents and sync timestamp
   */
  async sync(since?: number): Promise<SyncResult<T>> {
    const params = new URLSearchParams();
    if (since !== undefined) {
      params.set("since", String(since));
    }

    const response = await this.request<{ documents: DocumentResponse[]; syncedAt: number }>(
      `/vault/${this.vaultUid}/documents/sync?${params}`
    );

    const documents = await Promise.all(
      response.documents.map((doc) => this.decryptDocument(doc))
    );

    return {
      documents,
      syncedAt: response.syncedAt,
    };
  }

  // ==================
  // Private Helpers
  // ==================

  /**
   * Encrypt content to base64 string with optional HMAC
   */
  private async encryptContent(content: T): Promise<{ data: string; hmac?: string }> {
    // Serialize to JSON
    const json = JSON.stringify(content);
    const plaintext = new TextEncoder().encode(json);

    // Encrypt with AES-GCM
    const encrypted = await encrypt(plaintext, this.encryptionKey);

    // Convert to base64
    const data = this.bytesToBase64(encrypted.combined);

    // Compute HMAC if key provided
    let hmac: string | undefined;
    if (this.hmacKey) {
      const dataBytes = new TextEncoder().encode(data);
      hmac = await computeHmac(dataBytes, this.hmacKey);
    }

    return { data, hmac };
  }

  /**
   * Decrypt a server response document
   */
  private async decryptDocument(response: DocumentResponse): Promise<Document<T>> {
    // Verify HMAC if key provided (skip for legacy docs without HMAC)
    if (this.hmacKey && response.hmac) {

      const dataBytes = new TextEncoder().encode(response.data);
      const valid = await verifyHmac(dataBytes, this.hmacKey, response.hmac);

      if (!valid) {
        throw new Error("HMAC verification failed: invalid signature");
      }
    }

    // Decode from base64
    const encryptedBytes = this.base64ToBytes(response.data);

    // Decrypt
    const plaintext = await decrypt(encryptedBytes, this.encryptionKey);

    // Deserialize from JSON
    const json = new TextDecoder().decode(plaintext);
    const content = JSON.parse(json) as T;

    return {
      uid: response.uid,
      collection: response.collection,
      content,
      version: response.version,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
      deletedAt: response.deletedAt ?? undefined,
    };
  }

  /**
   * Make authenticated HTTP request
   */
  private async request<R>(path: string, options: RequestInit = {}): Promise<R> {
    const url = path.startsWith("http") ? path : `${this.serverUrl}${path}`;

    const headers = {
      ...this.getAuthHeader(),
      ...options.headers,
    };

    const fetchFn = this.httpClient
      ? (url: string, opts: RequestInit) => this.httpClient!.fetch(url, opts)
      : fetch;

    const response = await fetchFn(url, { ...options, headers });

    if (!response.ok) {
      // Parse error message
      let errorMessage: string;
      try {
        const errorData = await response.json() as { message?: string; error?: string };
        errorMessage = errorData.message || errorData.error || response.statusText;
      } catch {
        errorMessage = response.statusText;
      }

      // Throw typed errors
      if (response.status === 404) {
        throw new Error(`Document not found: ${errorMessage}`);
      } else if (response.status === 409) {
        throw new Error(`Conflict: ${errorMessage}`);
      } else if (response.status === 401) {
        throw new Error(`Unauthorized: ${errorMessage}`);
      } else {
        throw new Error(`HTTP ${response.status}: ${errorMessage}`);
      }
    }

    return response.json() as Promise<R>;
  }

  /**
   * Convert Uint8Array to base64 string
   */
  private bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to Uint8Array
   */
  private base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
