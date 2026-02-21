/**
 * AgentVault - Headless SDK for AI agents
 * 
 * Thin wrapper around DocumentClient with:
 * - Base64 key decoding (agents receive keys as strings)
 * - API key authentication
 * - Clean, self-documenting interface
 */

import { DocumentClient, Collection } from "@ursalock/client";
import { deriveVaultKeys } from "@ursalock/crypto";
import { base64ToBytes, bytesToBase64 } from "./types.js";

/**
 * Configuration options for AgentVault
 */
export interface AgentVaultOptions {
  /** Server URL (e.g., "https://vault.ndlz.net") */
  serverUrl: string;
  
  /** API key for authentication (starts with "ulk_") */
  apiKey: string;
  
  /** Vault UID to access */
  vaultUid: string;
  
  /** 
   * Encryption key (base64-encoded 32-byte key)
   * This is the vault's encryption key shared by the human
   */
  encryptionKey: string;
  
  /**
   * Optional HMAC key (base64-encoded 32-byte key)
   * If not provided, HMAC integrity checking is disabled
   */
  hmacKey?: string;
}

/**
 * AgentVault provides headless access to encrypted documents
 * 
 * This is a thin wrapper around DocumentClient that:
 * 1. Handles base64 key encoding/decoding
 * 2. Injects API key authentication
 * 3. Provides a clean API for agent use
 * 
 * All encryption/decryption logic is delegated to Collection from @ursalock/client
 * 
 * @example
 * ```ts
 * const vault = new AgentVault({
 *   serverUrl: 'https://vault.ndlz.net',
 *   apiKey: 'ulk_abc123...',
 *   vaultUid: 'vault-xyz',
 *   encryptionKey: 'base64-encoded-key',
 *   hmacKey: 'base64-encoded-hmac-key',
 * });
 * 
 * const notes = vault.collection<{ title: string; content: string }>('notes');
 * await notes.create({ title: 'Secret', content: 'Hello world' });
 * const allNotes = await notes.list();
 * ```
 */
export class AgentVault {
  private client: DocumentClient;

  constructor(options: AgentVaultOptions) {
    // Decode base64 keys to Uint8Array
    const encKey = base64ToBytes(options.encryptionKey);
    const hmacKey = options.hmacKey ? base64ToBytes(options.hmacKey) : undefined;

    // Create document client with API key auth
    this.client = new DocumentClient({
      serverUrl: options.serverUrl,
      vaultUid: options.vaultUid,
      encryptionKey: encKey,
      hmacKey,
      getAuthHeader: () => ({
        Authorization: `Bearer ${options.apiKey}`,
      }),
    });
  }

  /**
   * Get a typed collection
   * 
   * Collections provide CRUD operations on encrypted documents.
   * All documents are encrypted client-side before being sent to the server.
   * 
   * @param name - Collection name (e.g., "notes", "tasks")
   * @returns Typed collection instance
   * 
   * @example
   * ```ts
   * interface Note {
   *   title: string;
   *   content: string;
   * }
   * 
   * const notes = vault.collection<Note>('notes');
   * await notes.create({ title: 'Shopping list', content: 'Milk, eggs' });
   * ```
   */
  collection<T>(name: string): Collection<T> {
    return this.client.collection<T>(name);
  }
}

/**
 * Create an AgentVault from a master key
 * 
 * For cases where the agent has the full master key (highest trust level),
 * this helper derives vault-specific encryption and HMAC keys using HKDF.
 * 
 * The master key is typically:
 * - Derived from a recovery key via Argon2id
 * - Derived from ZKC PRF (passkey-based key derivation)
 * - Shared directly by the human in a secure channel
 * 
 * @param options - Configuration with master key
 * @returns AgentVault instance ready to use
 * 
 * @example
 * ```ts
 * const vault = await createAgentVaultFromMasterKey({
 *   serverUrl: 'https://vault.ndlz.net',
 *   apiKey: 'ulk_abc123...',
 *   vaultUid: 'vault-xyz',
 *   masterKey: 'base64-encoded-master-key',
 * });
 * 
 * const notes = vault.collection<Note>('notes');
 * ```
 */
export async function createAgentVaultFromMasterKey(options: {
  serverUrl: string;
  apiKey: string;
  vaultUid: string;
  masterKey: string; // base64-encoded
}): Promise<AgentVault> {
  // Decode master key from base64
  const masterKeyBytes = base64ToBytes(options.masterKey);
  
  // Derive vault-specific keys using HKDF
  const keys = await deriveVaultKeys(masterKeyBytes, options.vaultUid);
  
  // Create AgentVault with derived keys
  return new AgentVault({
    serverUrl: options.serverUrl,
    apiKey: options.apiKey,
    vaultUid: options.vaultUid,
    encryptionKey: bytesToBase64(keys.encryptionKey),
    hmacKey: bytesToBase64(keys.hmacKey),
  });
}
