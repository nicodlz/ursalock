/**
 * Key derivation using Argon2id
 * 
 * Current parameters based on OWASP 2026 high-security recommendations:
 * - Memory: 128 MiB (OWASP "higher memory" profile)
 * - Iterations: 4
 * - Parallelism: 4
 * 
 * Legacy parameters (64 MiB / 3 iterations) are preserved for backward
 * compatibility — existing vaults encrypted with the old defaults can
 * still be decrypted by passing LEGACY_ARGON2_PARAMS explicitly.
 * 
 * References:
 * - OWASP Password Storage Cheat Sheet (2026 revision)
 * - RFC 9106 §4 (Argon2 recommended parameters)
 */

import { argon2id } from 'hash-wasm'
import { randomBytes } from './utils.js'

export interface DeriveKeyOptions {
  /** Password or recovery key bytes */
  password: Uint8Array
  /** Salt (32 bytes recommended, auto-generated if not provided) */
  salt?: Uint8Array
  /** Memory cost in KiB (default: 131072 = 128 MiB) */
  memoryCost?: number
  /** Time cost / iterations (default: 4) */
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
 * 
 * @example Decrypt data encrypted with older parameters
 * ```ts
 * const { key } = await deriveKey({
 *   password: recoveryKeyBytes,
 *   salt: storedSalt,
 *   ...LEGACY_ARGON2_PARAMS,
 * })
 * ```
 */
export async function deriveKey(options: DeriveKeyOptions): Promise<DerivedKey> {
  const {
    password,
    salt = randomBytes(32),
    memoryCost = 131072, // 128 MiB — OWASP 2026 high-security recommendation
    timeCost = 4,
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
 * 
 * OWASP 2026 high-security recommendation:
 * - 128 MiB memory, 4 iterations, parallelism 4
 * - Provides ≈ 2× the work factor of the previous defaults
 */
export const DEFAULT_ARGON2_PARAMS = {
  memoryCost: 131072, // 128 MiB
  timeCost: 4,
  parallelism: 4,
  keyLength: 32,
  saltLength: 32,
} as const

/**
 * Legacy Argon2id parameters (pre-2026)
 * 
 * Use these when decrypting data that was encrypted with older defaults.
 * New encryptions should always use DEFAULT_ARGON2_PARAMS.
 */
export const LEGACY_ARGON2_PARAMS = {
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
  keyLength: 32,
  saltLength: 32,
} as const
