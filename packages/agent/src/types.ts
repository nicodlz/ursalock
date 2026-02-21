/**
 * Base64 encoding utilities for Node.js
 * 
 * Agents receive encryption keys as base64 strings (for easy serialization)
 * and need to convert them to Uint8Array for crypto operations.
 */

/**
 * Decode base64 string to Uint8Array
 * Uses Node.js Buffer API (not available in browser)
 * 
 * @param base64 - Base64-encoded string
 * @returns Raw bytes as Uint8Array
 */
export function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Encode Uint8Array to base64 string
 * Uses Node.js Buffer API (not available in browser)
 * 
 * @param bytes - Raw bytes
 * @returns Base64-encoded string
 */
export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
