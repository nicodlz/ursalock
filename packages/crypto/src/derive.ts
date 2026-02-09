/**
 * Key derivation using Argon2id
 * 
 * Parameters based on OWASP 2026 recommendations:
 * - Memory: 64 MiB
 * - Iterations: 3
 * - Parallelism: 4
 */

import { argon2id } from 'hash-wasm'
import { randomBytes } from './utils.js'

export interface DeriveKeyOptions {
  /** Password or recovery key bytes */
  password: Uint8Array
  /** Salt (32 bytes recommended, auto-generated if not provided) */
  salt?: Uint8Array
  /** Memory cost in KiB (default: 65536 = 64 MiB) */
  memoryCost?: number
  /** Time cost / iterations (default: 3) */
  timeCost?: number
  /** Parallelism (default: 4) */
  parallelism?: number
  /** Output key length in bytes (default: 32 for AES-256) */
  keyLength?: number
}

export interface DerivedKey {
  /** The derived key bytes */
  key: Uint8Array
  /** The salt used (save this for re-derivation) */
  salt: Uint8Array
}

/**
 * Derive an encryption key from a password/recovery key using Argon2id
 * 
 * @example
 * ```ts
 * const { key, salt } = await deriveKey({
 *   password: recoveryKeyBytes,
 * })
 * // Save salt alongside encrypted data
 * // Use key for AES-256-GCM encryption
 * ```
 */
export async function deriveKey(options: DeriveKeyOptions): Promise<DerivedKey> {
  const {
    password,
    salt = randomBytes(32),
    memoryCost = 65536, // 64 MiB
    timeCost = 3,
    parallelism = 4,
    keyLength = 32,
  } = options

  const hash = await argon2id({
    password,
    salt,
    memorySize: memoryCost,
    iterations: timeCost,
    parallelism,
    hashLength: keyLength,
    outputType: 'binary',
  })

  return {
    key: new Uint8Array(hash),
    salt,
  }
}

/**
 * Default parameters for key derivation
 * Matches OWASP 2026 recommendations for high-security applications
 */
export const DEFAULT_ARGON2_PARAMS = {
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
  keyLength: 32,
  saltLength: 32,
} as const
