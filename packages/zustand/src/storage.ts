/**
 * Encrypted storage layer for vault middleware
 * Supports both legacy recovery key and new CipherJWK encryption
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

export interface VaultStorage {
  /** Get encrypted state from storage */
  getItem: (name: string) => Promise<string | null>;
  /** Set encrypted state in storage */
  setItem: (name: string, value: string) => Promise<void>;
  /** Remove state from storage */
  removeItem: (name: string) => Promise<void>;
}

/** Legacy options using recovery key string */
export interface LegacyEncryptedStorageOptions {
  /** Recovery key for encryption (legacy mode) */
  recoveryKey: string;
  /** Underlying storage (default: localStorage) */
  storage?: VaultStorage;
  /** Key prefix in storage */
  prefix?: string;
}

/** New options using CipherJWK directly */
export interface JwkEncryptedStorageOptions {
  /** CipherJWK for encryption (from ZKCredentials) */
  cipherJwk: CipherJWK;
  /** Underlying storage (default: localStorage) */
  storage?: VaultStorage;
  /** Key prefix in storage */
  prefix?: string;
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
 */
export function createVaultStorage(options: EncryptedStorageOptions): VaultStorage {
  const prefix = options.prefix ?? "zod-vault:";
  
  // Default to localStorage with async wrapper
  const storage = options.storage ?? createLocalStorageWrapper();

  if (isJwkMode(options)) {
    return createJwkStorage(options.cipherJwk, storage, prefix);
  } else {
    return createLegacyStorage(options.recoveryKey, storage, prefix);
  }
}

/**
 * Create JWK-based encrypted storage (new mode)
 */
function createJwkStorage(
  cipherJwk: CipherJWK,
  storage: VaultStorage,
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
 */
function createLegacyStorage(
  recoveryKey: string,
  storage: VaultStorage,
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
  return btoa(String.fromCharCode(...bytes));
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
