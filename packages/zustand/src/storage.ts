/**
 * Encrypted storage layer for vault middleware
 * Supports both legacy recovery key and new CipherJWK encryption
 * 
 * Refactored to follow SOLID principles:
 * - Uses IStorageProvider interface (Dependency Inversion)
 * - Separates encryption concerns from storage access (Single Responsibility)
 * - Injectable storage provider for testing
 */

import {
  encrypt,
  decrypt,
  deriveKey,
  recoveryKeyToBytes,
  encryptWithJwk,
  decryptWithJwk,
  type CipherJWK,
} from "@zod-vault/crypto";
import type { IStorageProvider, IVaultStorage } from "./interfaces/storage.js";
import { LocalStorageProvider } from "./providers/local-storage.js";

// Re-export for backward compatibility
export interface VaultStorage extends IVaultStorage {}
export type { IStorageProvider } from "./interfaces/storage.js";

/** Legacy options using recovery key string */
export interface LegacyEncryptedStorageOptions {
  /** Recovery key for encryption (legacy mode) */
  recoveryKey: string;
  /** Underlying storage provider (default: LocalStorageProvider) */
  storageProvider?: IStorageProvider;
  /** Key prefix in storage */
  prefix?: string;
  /** @deprecated Use storageProvider instead. For backward compatibility with VaultStorage */
  storage?: VaultStorage;
}

/** New options using CipherJWK directly */
export interface JwkEncryptedStorageOptions {
  /** CipherJWK for encryption (from ZKCredentials) */
  cipherJwk: CipherJWK;
  /** Underlying storage provider (default: LocalStorageProvider) */
  storageProvider?: IStorageProvider;
  /** Key prefix in storage */
  prefix?: string;
  /** @deprecated Use storageProvider instead. For backward compatibility with VaultStorage */
  storage?: VaultStorage;
}

export type EncryptedStorageOptions = LegacyEncryptedStorageOptions | JwkEncryptedStorageOptions;

/** Stored data format for legacy mode */
interface LegacyStoredData {
  /** Encrypted payload (base64) */
  data: string;
  /** Salt for key derivation (base64) */
  salt: string;
  /** Version for future migrations */
  version: number;
  /** Last updated timestamp */
  updatedAt: number;
}

/** Stored data format for JWK mode */
interface JwkStoredData {
  /** Encrypted payload (base64) - iv + ciphertext combined */
  data: string;
  /** Version for future migrations */
  version: number;
  /** Last updated timestamp */
  updatedAt: number;
  /** Mode identifier */
  mode: "jwk";
}

type StoredData = LegacyStoredData | JwkStoredData;

function isJwkMode(options: EncryptedStorageOptions): options is JwkEncryptedStorageOptions {
  return "cipherJwk" in options;
}

function isJwkStoredData(data: StoredData): data is JwkStoredData {
  return "mode" in data && data.mode === "jwk";
}

/**
 * Create an encrypted storage wrapper
 * Supports both legacy recovery key and new CipherJWK modes
 * 
 * Uses dependency injection for storage provider (Dependency Inversion Principle)
 */
export function createVaultStorage(options: EncryptedStorageOptions): VaultStorage {
  const prefix = options.prefix ?? "zod-vault:";
  
  // Prefer new storageProvider, fall back to legacy storage, finally default to localStorage
  const storageProvider = 
    options.storageProvider ?? 
    options.storage ?? 
    new LocalStorageProvider();

  if (isJwkMode(options)) {
    return createJwkStorage(options.cipherJwk, storageProvider, prefix);
  } else {
    return createLegacyStorage(options.recoveryKey, storageProvider, prefix);
  }
}

/**
 * Create JWK-based encrypted storage (new mode)
 * Separates encryption logic from storage access (Single Responsibility)
 */
function createJwkStorage(
  cipherJwk: CipherJWK,
  storage: IStorageProvider,
  prefix: string
): VaultStorage {
  return {
    async getItem(name: string): Promise<string | null> {
      const raw = await storage.getItem(prefix + name);
      if (!raw) return null;

      try {
        const stored: StoredData = JSON.parse(raw);
        
        // Decrypt
        const encrypted = base64ToBytes(stored.data);
        const decrypted = await decryptWithJwk(encrypted, cipherJwk);
        
        return new TextDecoder().decode(decrypted);
      } catch (error) {
        console.error("[zod-vault] Failed to decrypt stored data:", error);
        return null;
      }
    },

    async setItem(name: string, value: string): Promise<void> {
      try {
        // Encrypt
        const plaintext = new TextEncoder().encode(value);
        const encrypted = await encryptWithJwk(plaintext, cipherJwk);
        
        // Store
        const stored: JwkStoredData = {
          data: bytesToBase64(encrypted.combined),
          version: 2,
          updatedAt: Date.now(),
          mode: "jwk",
        };
        
        await storage.setItem(prefix + name, JSON.stringify(stored));
      } catch (error) {
        console.error("[zod-vault] Failed to encrypt data:", error);
        throw error;
      }
    },

    async removeItem(name: string): Promise<void> {
      await storage.removeItem(prefix + name);
    },
  };
}

/**
 * Create legacy recovery-key-based encrypted storage
 * Separates encryption logic from storage access (Single Responsibility)
 */
function createLegacyStorage(
  recoveryKey: string,
  storage: IStorageProvider,
  prefix: string
): VaultStorage {
  // Derive key lazily and cache
  let cachedKey: Uint8Array | null = null;
  let cachedSalt: Uint8Array | null = null;

  async function getOrDeriveKey(salt?: Uint8Array): Promise<{ key: Uint8Array; salt: Uint8Array }> {
    if (cachedKey && cachedSalt && (!salt || arrayEqual(salt, cachedSalt))) {
      return { key: cachedKey, salt: cachedSalt };
    }

    const keyBytes = recoveryKeyToBytes(recoveryKey);
    const result = await deriveKey({
      password: keyBytes,
      salt,
    });

    cachedKey = result.key;
    cachedSalt = result.salt;
    return result;
  }

  return {
    async getItem(name: string): Promise<string | null> {
      const raw = await storage.getItem(prefix + name);
      if (!raw) return null;

      try {
        const stored: StoredData = JSON.parse(raw);
        
        // Handle JWK mode data (shouldn't happen but just in case)
        if (isJwkStoredData(stored)) {
          console.error("[zod-vault] Cannot decrypt JWK data with recovery key");
          return null;
        }
        
        // Derive key with stored salt
        const salt = base64ToBytes(stored.salt);
        const { key } = await getOrDeriveKey(salt);
        
        // Decrypt
        const encrypted = base64ToBytes(stored.data);
        const decrypted = await decrypt(encrypted, key);
        
        return new TextDecoder().decode(decrypted);
      } catch (error) {
        console.error("[zod-vault] Failed to decrypt stored data:", error);
        return null;
      }
    },

    async setItem(name: string, value: string): Promise<void> {
      try {
        // Get or derive key
        const { key, salt } = await getOrDeriveKey();
        
        // Encrypt
        const plaintext = new TextEncoder().encode(value);
        const encrypted = await encrypt(plaintext, key);
        
        // Store
        const stored: LegacyStoredData = {
          data: bytesToBase64(encrypted.combined),
          salt: bytesToBase64(salt),
          version: 1,
          updatedAt: Date.now(),
        };
        
        await storage.setItem(prefix + name, JSON.stringify(stored));
      } catch (error) {
        console.error("[zod-vault] Failed to encrypt data:", error);
        throw error;
      }
    },

    async removeItem(name: string): Promise<void> {
      await storage.removeItem(prefix + name);
    },
  };
}

/**
 * Create async wrapper around localStorage
 */
function createLocalStorageWrapper(): VaultStorage {
  return {
    async getItem(name: string): Promise<string | null> {
      if (typeof window === "undefined") return null;
      return localStorage.getItem(name);
    },
    async setItem(name: string, value: string): Promise<void> {
      if (typeof window === "undefined") return;
      localStorage.setItem(name, value);
    },
    async removeItem(name: string): Promise<void> {
      if (typeof window === "undefined") return;
      localStorage.removeItem(name);
    },
  };
}

// Utils
function bytesToBase64(bytes: Uint8Array): string {
  // Process in chunks to avoid "Maximum call stack size exceeded"
  // String.fromCharCode(...bytes) fails when bytes.length > ~65536
  const CHUNK_SIZE = 0x8000; // 32KB chunks
  let result = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    result += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(result);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function arrayEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
