/**
 * HKDF-SHA256 key derivation (RFC 5869)
 * 
 * Uses Web Crypto's native HKDF implementation for deriving sub-keys
 * from a master key. This is used to generate vault-specific keys for
 * encryption, HMAC, and indexing from a single master key.
 * 
 * Design rationale:
 * - Key separation: Each purpose gets its own derived key
 * - Context binding: Vault UID prevents key reuse across vaults
 * - Versioned info strings: "ursalock:v1:..." allows future changes
 * - Domain separation: Different info → different keys (collision-free)
 */

/** Vault-specific derived keys */
export interface VaultKeys {
  /** AES-256-GCM encryption key for vault documents */
  encryptionKey: Uint8Array;
  /** HMAC-SHA256 key for integrity verification */
  hmacKey: Uint8Array;
  /** Key for encrypted search indexes (future use) */
  indexKey: Uint8Array;
}

/**
 * Derive a sub-key using HKDF-SHA256 (RFC 5869)
 * 
 * Uses Web Crypto's native HKDF implementation.
 * 
 * @param ikm - Input keying material (master key)
 * @param info - Context string (e.g., "ursalock:vault:abc123:encrypt") or raw bytes
 * @param salt - Optional salt (default: empty buffer)
 * @param length - Output key length in bytes (default: 32 for AES-256)
 * @returns Derived key material
 */
export async function hkdf(
  ikm: Uint8Array,
  info: string | Uint8Array,
  salt?: Uint8Array,
  length: number = 32,
): Promise<Uint8Array> {
  // Convert string info to bytes
  const infoBytes = typeof info === 'string'
    ? new TextEncoder().encode(info)
    : info;

  // Use empty salt if not provided (Web Crypto requires non-null salt)
  const actualSalt = salt ?? new Uint8Array(0);

  // Import IKM as raw key material for HKDF
  const baseKey = await crypto.subtle.importKey(
    'raw',
    (ikm.buffer as ArrayBuffer).slice(ikm.byteOffset, ikm.byteOffset + ikm.byteLength),
    { name: 'HKDF' },
    false,
    ['deriveBits'],
  );

  // Derive key bits using HKDF-SHA256
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: (actualSalt.buffer as ArrayBuffer).slice(actualSalt.byteOffset, actualSalt.byteOffset + actualSalt.byteLength),
      info: (infoBytes.buffer as ArrayBuffer).slice(infoBytes.byteOffset, infoBytes.byteOffset + infoBytes.byteLength),
    },
    baseKey,
    length * 8, // Convert bytes to bits
  );

  return new Uint8Array(derivedBits);
}

/**
 * Derive a complete set of vault keys from a master key
 * 
 * Uses HKDF with vault-specific context strings to derive:
 * - encryptionKey: for AES-256-GCM document encryption
 * - hmacKey: for integrity verification (Encrypt-then-MAC)
 * - indexKey: for encrypted search indexes (future)
 * 
 * Context format: "ursalock:v1:<purpose>:<vaultUid>"
 * - Versioned to allow future changes
 * - Vault UID prevents key reuse across vaults
 * - Purpose string provides domain separation
 * 
 * @param masterKey - Master key (from Argon2id or ZKC PRF)
 * @param vaultUid - Vault unique identifier (used as context)
 * @returns Set of derived vault keys
 */
export async function deriveVaultKeys(
  masterKey: Uint8Array,
  vaultUid: string,
): Promise<VaultKeys> {
  // Derive three independent keys with different context strings
  const [encryptionKey, hmacKey, indexKey] = await Promise.all([
    hkdf(masterKey, `ursalock:v1:encrypt:${vaultUid}`),
    hkdf(masterKey, `ursalock:v1:hmac:${vaultUid}`),
    hkdf(masterKey, `ursalock:v1:index:${vaultUid}`),
  ]);

  return { encryptionKey, hmacKey, indexKey };
}
