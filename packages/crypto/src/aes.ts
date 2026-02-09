/**
 * AES-256-GCM encryption/decryption using Web Crypto API
 * 
 * - 256-bit key
 * - 96-bit (12 byte) IV (NIST recommended for GCM)
 * - 128-bit auth tag (included in ciphertext by Web Crypto)
 */

import { randomBytes, concatBytes } from './utils.js'

/** IV length for AES-GCM (96 bits = 12 bytes, NIST recommended) */
const IV_LENGTH = 12

/** Encrypted payload structure */
export interface EncryptedPayload {
  /** Initialization vector (12 bytes) */
  iv: Uint8Array
  /** Ciphertext with auth tag appended */
  ciphertext: Uint8Array
  /** Combined iv + ciphertext for storage */
  combined: Uint8Array
}

/**
 * Encrypt data using AES-256-GCM
 * 
 * @param plaintext - Data to encrypt
 * @param key - 256-bit encryption key
 * @returns Encrypted payload with IV
 * 
 * @example
 * ```ts
 * const data = new TextEncoder().encode(JSON.stringify(state))
 * const encrypted = await encrypt(data, key)
 * // Store encrypted.combined (iv + ciphertext)
 * ```
 */
export async function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array
): Promise<EncryptedPayload> {
  // Validate key length
  if (key.length !== 32) {
    throw new Error(`Invalid key length: expected 32 bytes, got ${key.length}`)
  }

  // Generate random IV
  const iv = randomBytes(IV_LENGTH)

  // Import key for Web Crypto
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )

  // Encrypt
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      plaintext
    )
  )

  // Combine IV + ciphertext for easy storage
  const combined = concatBytes(iv, ciphertext)

  return { iv, ciphertext, combined }
}

/**
 * Decrypt data using AES-256-GCM
 * 
 * @param encrypted - Combined IV + ciphertext, or separate components
 * @param key - 256-bit encryption key
 * @returns Decrypted plaintext
 * 
 * @example
 * ```ts
 * const plaintext = await decrypt(encrypted.combined, key)
 * const state = JSON.parse(new TextDecoder().decode(plaintext))
 * ```
 */
export async function decrypt(
  encrypted: Uint8Array | EncryptedPayload,
  key: Uint8Array
): Promise<Uint8Array> {
  // Validate key length
  if (key.length !== 32) {
    throw new Error(`Invalid key length: expected 32 bytes, got ${key.length}`)
  }

  let iv: Uint8Array
  let ciphertext: Uint8Array

  if (encrypted instanceof Uint8Array) {
    // Combined format: first 12 bytes are IV
    if (encrypted.length < IV_LENGTH + 16) {
      throw new Error('Invalid encrypted data: too short')
    }
    iv = encrypted.slice(0, IV_LENGTH)
    ciphertext = encrypted.slice(IV_LENGTH)
  } else {
    // Separate components
    iv = encrypted.iv
    ciphertext = encrypted.ciphertext
  }

  // Import key for Web Crypto
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )

  // Decrypt
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      ciphertext
    )
    return new Uint8Array(plaintext)
  } catch (error) {
    throw new Error('Decryption failed: invalid key or corrupted data')
  }
}

/**
 * Encrypt a string (convenience wrapper)
 */
export async function encryptString(
  plaintext: string,
  key: Uint8Array
): Promise<EncryptedPayload> {
  const data = new TextEncoder().encode(plaintext)
  return encrypt(data, key)
}

/**
 * Decrypt to a string (convenience wrapper)
 */
export async function decryptString(
  encrypted: Uint8Array | EncryptedPayload,
  key: Uint8Array
): Promise<string> {
  const plaintext = await decrypt(encrypted, key)
  return new TextDecoder().decode(plaintext)
}
