/**
 * Recovery key generation and validation
 * 
 * Recovery key format:
 * - 256 bits of entropy (32 bytes)
 * - Encoded as base32 (RFC 4648, no padding)
 * - Split into groups of 4 chars with dashes for readability
 * - Total: 52 characters + 12 dashes = 64 characters
 * 
 * Example: ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-Q
 */

import { randomBytes } from './utils.js'

/** Base32 alphabet (RFC 4648) */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Recovery key with metadata */
export interface RecoveryKey {
  /** Human-readable recovery key with dashes */
  formatted: string
  /** Raw recovery key without dashes */
  raw: string
  /** Original bytes (32 bytes = 256 bits) */
  bytes: Uint8Array
}

/**
 * Generate a new recovery key
 * 
 * @returns Recovery key in multiple formats
 * 
 * @example
 * ```ts
 * const recovery = generateRecoveryKey()
 * console.log(recovery.formatted)
 * // "ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-Q"
 * ```
 */
export function generateRecoveryKey(): RecoveryKey {
  const bytes = randomBytes(32)
  const raw = bytesToRecoveryKey(bytes)
  const formatted = formatRecoveryKey(raw)
  
  return { formatted, raw, bytes }
}

/**
 * Validate a recovery key format
 * 
 * @param key - Recovery key (with or without dashes)
 * @returns True if valid format
 */
export function validateRecoveryKey(key: string): boolean {
  // Remove dashes and whitespace
  const clean = key.replace(/[-\s]/g, '').toUpperCase()
  
  // Must be exactly 52 characters (256 bits in base32)
  if (clean.length !== 52) return false
  
  // All characters must be valid base32
  for (const char of clean) {
    if (!BASE32_ALPHABET.includes(char)) return false
  }
  
  return true
}

/**
 * Convert recovery key string to bytes
 * 
 * @param key - Recovery key (with or without dashes)
 * @returns 32 bytes
 */
export function recoveryKeyToBytes(key: string): Uint8Array {
  // Remove dashes and whitespace
  const clean = key.replace(/[-\s]/g, '').toUpperCase()
  
  if (!validateRecoveryKey(clean)) {
    throw new Error('Invalid recovery key format')
  }
  
  return base32Decode(clean)
}

/**
 * Convert bytes to recovery key string
 * 
 * @param bytes - 32 bytes
 * @returns Raw base32 string (no dashes)
 */
export function bytesToRecoveryKey(bytes: Uint8Array): string {
  if (bytes.length !== 32) {
    throw new Error(`Invalid bytes length: expected 32, got ${bytes.length}`)
  }
  return base32Encode(bytes)
}

/**
 * Format recovery key with dashes for readability
 * 
 * @param raw - Raw base32 string
 * @returns Formatted string with dashes every 4 characters
 */
export function formatRecoveryKey(raw: string): string {
  const chunks: string[] = []
  for (let i = 0; i < raw.length; i += 4) {
    chunks.push(raw.slice(i, i + 4))
  }
  return chunks.join('-')
}

/**
 * Base32 encode bytes (RFC 4648, no padding)
 */
function base32Encode(bytes: Uint8Array): string {
  let result = ''
  let bits = 0
  let value = 0
  
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    
    while (bits >= 5) {
      bits -= 5
      result += BASE32_ALPHABET[(value >> bits) & 0x1f]
    }
  }
  
  // Handle remaining bits
  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f]
  }
  
  return result
}

/**
 * Base32 decode string to bytes (RFC 4648, no padding)
 */
function base32Decode(str: string): Uint8Array {
  const output: number[] = []
  let bits = 0
  let value = 0
  
  for (const char of str) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) {
      throw new Error(`Invalid base32 character: ${char}`)
    }
    
    value = (value << 5) | index
    bits += 5
    
    while (bits >= 8) {
      bits -= 8
      output.push((value >> bits) & 0xff)
    }
  }
  
  return new Uint8Array(output)
}
