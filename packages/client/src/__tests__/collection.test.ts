/**
 * Collection tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Collection } from '../collection.js';
import { DocumentClient } from '../document-client.js';
import type { IHttpClient } from '../interfaces/http-client.js';
import type { DocumentResponse } from '../document.js';
import { randomBytes } from '@ursalock/crypto';

// Test types
interface TestDocument {
  title: string;
  content: string;
}

// Mock HTTP client
class MockHttpClient implements IHttpClient {
  public lastRequest: { url: string; options?: RequestInit } | null = null;
  private mockResponse: unknown = null;
  private mockError: Error | null = null;
  private mockStatus = 200;

  setMockResponse(response: unknown, status = 200): void {
    this.mockResponse = response;
    this.mockStatus = status;
    this.mockError = null;
  }

  setMockError(error: Error, status = 500): void {
    this.mockError = error;
    this.mockStatus = status;
    this.mockResponse = null;
  }

  async fetch(url: string, options?: RequestInit): Promise<Response> {
    this.lastRequest = { url, options };

    if (this.mockError) {
      return {
        ok: this.mockStatus >= 200 && this.mockStatus < 300,
        status: this.mockStatus,
        statusText: this.mockError.message,
        json: async () => ({ message: this.mockError!.message }),
      } as Response;
    }

    return {
      ok: this.mockStatus >= 200 && this.mockStatus < 300,
      status: this.mockStatus,
      statusText: 'OK',
      json: async () => this.mockResponse,
    } as Response;
  }
}

describe('Collection', () => {
  let mockHttp: MockHttpClient;
  let encryptionKey: Uint8Array;
  let hmacKey: Uint8Array;
  let collection: Collection<TestDocument>;
  let getAuthHeader: () => Record<string, string>;

  beforeEach(() => {
    mockHttp = new MockHttpClient();
    encryptionKey = randomBytes(32); // 256-bit key
    hmacKey = randomBytes(32);
    getAuthHeader = () => ({ Authorization: 'Bearer test-token' });

    collection = new Collection<TestDocument>(
      'http://test.com',
      'vault-123',
      'notes',
      encryptionKey,
      hmacKey,
      getAuthHeader,
      mockHttp,
    );
  });

  describe('create', () => {
    it('encrypts content and sends to server', async () => {
      const mockResponse: DocumentResponse = {
        uid: 'doc-1',
        collection: 'notes',
        data: 'encrypted-data', // Will be replaced by actual encrypted data
        hmac: 'mock-hmac',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // We'll need to intercept the actual encrypted data
      let capturedData = '';
      let capturedHmac = '';

      mockHttp.fetch = async (url: string, options?: RequestInit) => {
        mockHttp.lastRequest = { url, options };
        const body = JSON.parse(options!.body as string);
        capturedData = body.data;
        capturedHmac = body.hmac;

        // Return response with the same encrypted data
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            ...mockResponse,
            data: capturedData,
            hmac: capturedHmac,
          }),
        } as Response;
      };

      const testDoc = {
        title: 'Test Note',
        content: 'Secret content',
      };

      const result = await collection.create(testDoc);

      // Verify request
      expect(mockHttp.lastRequest?.url).toBe('http://test.com/vault/vault-123/documents');
      expect(mockHttp.lastRequest?.options?.method).toBe('POST');
      expect(mockHttp.lastRequest?.options?.headers).toMatchObject({
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      });

      const body = JSON.parse(mockHttp.lastRequest!.options!.body as string);
      expect(body.collection).toBe('notes');
      expect(body.data).toBeDefined();
      expect(body.hmac).toBeDefined();

      // Verify decrypted result
      expect(result.uid).toBe('doc-1');
      expect(result.collection).toBe('notes');
      expect(result.content).toEqual(testDoc);
      expect(result.version).toBe(1);
    });

    it('creates document without HMAC when hmacKey not provided', async () => {
      const collectionNoHmac = new Collection<TestDocument>(
        'http://test.com',
        'vault-123',
        'notes',
        encryptionKey,
        undefined, // No HMAC key
        getAuthHeader,
        mockHttp,
      );

      let capturedData = '';

      mockHttp.fetch = async (url: string, options?: RequestInit) => {
        mockHttp.lastRequest = { url, options };
        const body = JSON.parse(options!.body as string);
        capturedData = body.data;

        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            uid: 'doc-1',
            collection: 'notes',
            data: capturedData,
            version: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
        } as Response;
      };

      const testDoc = { title: 'Test', content: 'Content' };
      await collectionNoHmac.create(testDoc);

      const body = JSON.parse(mockHttp.lastRequest!.options!.body as string);
      expect(body.hmac).toBeUndefined();
    });
  });

  describe('get', () => {
    it('fetches and decrypts document from server', async () => {
      const testDoc = { title: 'Fetched Note', content: 'Secret' };

      // First encrypt the test document to get valid encrypted data
      const tempCollection = new Collection<TestDocument>(
        'http://test.com',
        'vault-123',
        'notes',
        encryptionKey,
        hmacKey,
        getAuthHeader,
        mockHttp,
      );

      let encryptedData = '';
      let encryptedHmac = '';
      let lastUrl = '';
      let lastOptions: RequestInit | undefined;

      // Capture encrypted data by creating a document
      mockHttp.fetch = async (url: string, options?: RequestInit) => {
        lastUrl = url;
        lastOptions = options;

        if (options?.body) {
          // POST request to create document
          const body = JSON.parse(options.body as string);
          encryptedData = body.data;
          encryptedHmac = body.hmac;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            uid: 'doc-1',
            collection: 'notes',
            data: encryptedData,
            hmac: encryptedHmac,
            version: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
        } as Response;
      };

      await tempCollection.create(testDoc);

      // Now test GET with the encrypted data
      const result = await collection.get('doc-1');

      expect(lastUrl).toBe('http://test.com/vault/vault-123/documents/doc-1');
      expect(lastOptions?.method).toBeUndefined(); // GET is default
      expect(result.content).toEqual(testDoc);
    });

    it('verifies HMAC on get', async () => {
      const testDoc = { title: 'Test', content: 'Content' };

      // Create document to get valid encrypted data
      let encryptedData = '';
      let encryptedHmac = '';

      mockHttp.fetch = async (url: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          const body = JSON.parse(options.body as string);
          encryptedData = body.data;
          encryptedHmac = body.hmac;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              uid: 'doc-1',
              collection: 'notes',
              data: encryptedData,
              hmac: encryptedHmac,
              version: 1,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }),
          } as Response;
        }

        // GET request
        return {
          ok: true,
          status: 200,
          json: async () => ({
            uid: 'doc-1',
            collection: 'notes',
            data: encryptedData,
            hmac: 'invalid-hmac', // Wrong HMAC!
            version: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
        } as Response;
      };

      await collection.create(testDoc);

      // GET should fail due to invalid HMAC
      await expect(collection.get('doc-1')).rejects.toThrow('HMAC verification failed');
    });

    it('throws error when HMAC missing but hmacKey provided', async () => {
      const mockResponse: DocumentResponse = {
        uid: 'doc-1',
        collection: 'notes',
        data: 'some-encrypted-data',
        // No HMAC!
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockHttp.setMockResponse(mockResponse);

      await expect(collection.get('doc-1')).rejects.toThrow('no HMAC in response');
    });
  });

  describe('list', () => {
    it('fetches and decrypts multiple documents', async () => {
      const testDocs = [
        { title: 'Note 1', content: 'Content 1' },
        { title: 'Note 2', content: 'Content 2' },
      ];

      const encryptedDocs: DocumentResponse[] = [];
      let lastUrl = '';

      // Create encrypted documents
      mockHttp.fetch = async (url: string, options?: RequestInit) => {
        lastUrl = url;

        if (options?.method === 'POST') {
          const body = JSON.parse(options.body as string);
          const doc: DocumentResponse = {
            uid: `doc-${encryptedDocs.length + 1}`,
            collection: 'notes',
            data: body.data,
            hmac: body.hmac,
            version: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          encryptedDocs.push(doc);
          return { ok: true, status: 200, json: async () => doc } as Response;
        }

        // LIST request
        return {
          ok: true,
          status: 200,
          json: async () => ({ documents: encryptedDocs }),
        } as Response;
      };

      await collection.create(testDocs[0]);
      await collection.create(testDocs[1]);

      const results = await collection.list();

      expect(lastUrl).toContain('/vault/vault-123/documents?collection=notes');
      expect(results).toHaveLength(2);
      expect(results[0].content).toEqual(testDocs[0]);
      expect(results[1].content).toEqual(testDocs[1]);
    });

    it('includes query parameters in list request', async () => {
      mockHttp.setMockResponse({ documents: [] });

      await collection.list({
        since: 1234567890,
        includeDeleted: true,
        limit: 10,
        offset: 5,
      });

      const url = mockHttp.lastRequest!.url;
      expect(url).toContain('collection=notes');
      expect(url).toContain('since=1234567890');
      expect(url).toContain('includeDeleted=true');
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=5');
    });
  });

  describe('update', () => {
    it('merges partial content and re-encrypts', async () => {
      const originalDoc = { title: 'Original', content: 'Original content' };
      const updatedFields = { title: 'Updated' };

      let encryptedData = '';
      let encryptedHmac = '';
      let updateData = '';
      let updateHmac = '';
      let lastUrl = '';
      let lastOptions: RequestInit | undefined;

      mockHttp.fetch = async (url: string, options?: RequestInit) => {
        lastUrl = url;
        lastOptions = options;

        if (options?.method === 'POST') {
          // Create
          const body = JSON.parse(options.body as string);
          encryptedData = body.data;
          encryptedHmac = body.hmac;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              uid: 'doc-1',
              collection: 'notes',
              data: encryptedData,
              hmac: encryptedHmac,
              version: 1,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }),
          } as Response;
        } else if (options?.method === 'PUT') {
          // Update
          const body = JSON.parse(options.body as string);
          updateData = body.data;
          updateHmac = body.hmac;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              uid: 'doc-1',
              collection: 'notes',
              data: updateData,
              hmac: updateHmac,
              version: 2,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }),
          } as Response;
        } else {
          // GET
          return {
            ok: true,
            status: 200,
            json: async () => ({
              uid: 'doc-1',
              collection: 'notes',
              data: encryptedData,
              hmac: encryptedHmac,
              version: 1,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }),
          } as Response;
        }
      };

      await collection.create(originalDoc);
      const result = await collection.update('doc-1', updatedFields);

      expect(result.content).toEqual({
        title: 'Updated',
        content: 'Original content',
      });
      expect(result.version).toBe(2);

      // Verify PUT request
      expect(lastOptions?.method).toBe('PUT');
      const body = JSON.parse(lastOptions!.body as string);
      expect(body.version).toBe(1); // Original version sent for optimistic locking
    });
  });

  describe('delete', () => {
    it('sends DELETE request', async () => {
      mockHttp.setMockResponse({ success: true });

      await collection.delete('doc-1');

      expect(mockHttp.lastRequest?.url).toBe('http://test.com/vault/vault-123/documents/doc-1');
      expect(mockHttp.lastRequest?.options?.method).toBe('DELETE');
    });
  });

  describe('sync', () => {
    it('fetches delta sync with timestamp', async () => {
      const testDoc = { title: 'Synced', content: 'Content' };

      let encryptedData = '';
      let encryptedHmac = '';
      let lastUrl = '';

      mockHttp.fetch = async (url: string, options?: RequestInit) => {
        lastUrl = url;

        if (options?.method === 'POST') {
          const body = JSON.parse(options.body as string);
          encryptedData = body.data;
          encryptedHmac = body.hmac;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              uid: 'doc-1',
              collection: 'notes',
              data: encryptedData,
              hmac: encryptedHmac,
              version: 1,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }),
          } as Response;
        }

        // SYNC request
        return {
          ok: true,
          status: 200,
          json: async () => ({
            documents: [
              {
                uid: 'doc-1',
                collection: 'notes',
                data: encryptedData,
                hmac: encryptedHmac,
                version: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            ],
            syncedAt: 9999999999,
          }),
        } as Response;
      };

      await collection.create(testDoc);

      const result = await collection.sync(1234567890);

      expect(lastUrl).toContain('/vault/vault-123/documents/sync?since=1234567890');
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].content).toEqual(testDoc);
      expect(result.syncedAt).toBe(9999999999);
    });
  });

  describe('error handling', () => {
    it('throws error on 404', async () => {
      mockHttp.setMockError(new Error('Not found'), 404);

      await expect(collection.get('nonexistent')).rejects.toThrow('Document not found');
    });

    it('throws error on 409 conflict', async () => {
      mockHttp.setMockError(new Error('Version conflict'), 409);

      await expect(collection.update('doc-1', { title: 'Updated' })).rejects.toThrow('Conflict');
    });

    it('throws error on 401 unauthorized', async () => {
      mockHttp.setMockError(new Error('Unauthorized'), 401);

      await expect(collection.get('doc-1')).rejects.toThrow('Unauthorized');
    });

    it('throws generic error on other status codes', async () => {
      mockHttp.setMockError(new Error('Server error'), 500);

      await expect(collection.get('doc-1')).rejects.toThrow('HTTP 500');
    });
  });
});

describe('DocumentClient', () => {
  it('creates typed collections with shared config', () => {
    const encryptionKey = randomBytes(32);
    const hmacKey = randomBytes(32);
    const getAuthHeader = () => ({ Authorization: 'Bearer token' });

    const client = new DocumentClient({
      serverUrl: 'http://test.com',
      vaultUid: 'vault-123',
      encryptionKey,
      hmacKey,
      getAuthHeader,
    });

    const notes = client.collection<TestDocument>('notes');
    const tasks = client.collection<{ task: string }>('tasks');

    expect(notes).toBeInstanceOf(Collection);
    expect(tasks).toBeInstanceOf(Collection);
  });
});
