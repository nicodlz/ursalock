/**
 * AES-256-GCM encryption/decryption using Web Crypto API
 * 
 * - 256-bit key
 * - 96-bit (12 byte) IV (NIST recommended for GCM)
 * - 128-bit auth tag (included in ciphertext by Web Crypto)
 * 
 * Refactored to follow Dependency Inversion Principle:
 * - Uses ICryptoProvider interface
 * - Default implementation uses WebCryptoProvider
 * - Can inject alternative implementations for testing
 */

import type { ICryptoProvider, IEncryptedPayload } from './interfaces.js'
import { WebCryptoProvider } from './providers/web-crypto.js'

/** Encrypted payload structure (backward compatibility) */
export interface EncryptedPayload extends IEncryptedPayload {}

/** Default crypto provider instance */
let defaultProvider: ICryptoProvider = new WebCryptoProvider()

/**
 * Set custom crypto provider (for testing or alternative implementations)
 * @param provider Custom crypto provider
 */
export function setCryptoProvider(provider: ICryptoProvider): void {
  defaultProvider = provider
}

/**
 * Get current crypto provider
 */
export function getCryptoProvider(): ICryptoProvider {
  return defaultProvider
}

/**
 * Encrypt data using AES-256-GCM
 * 
 * @param plaintext - Data to encrypt
 * @param key - 256-bit encryption key
 * @param provider - Optional crypto provider (uses default if not provided)
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
  key: Uint8Array,
  provider: ICryptoProvider = defaultProvider
): Promise<EncryptedPayload> {
  return provider.encrypt(plaintext, key)
}

/**
 * Decrypt data using AES-256-GCM
 * 
 * @param encrypted - Combined IV + ciphertext, or separate components
 * @param key - 256-bit encryption key
 * @param provider - Optional crypto provider (uses default if not provided)
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
  key: Uint8Array,
  provider: ICryptoProvider = defaultProvider
): Promise<Uint8Array> {
  return provider.decrypt(encrypted, key)
}

/**
 * Encrypt a string (convenience wrapper)
 */
export async function encryptString(
  plaintext: string,
  key: Uint8Array,
  provider?: ICryptoProvider
): Promise<EncryptedPayload> {
  const data = new TextEncoder().encode(plaintext)
  return encrypt(data, key, provider)
}

/**
 * Decrypt to a string (convenience wrapper)
 */
export async function decryptString(
  encrypted: Uint8Array | EncryptedPayload,
  key: Uint8Array,
  provider?: ICryptoProvider
): Promise<string> {
  const plaintext = await decrypt(encrypted, key, provider)
  return new TextDecoder().decode(plaintext)
}
