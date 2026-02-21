/**
 * HMAC-SHA256 using Web Crypto API
 * 
 * Provides integrity verification for ciphertext in transit/storage.
 * Uses HMAC-SHA256 as recommended by NIST SP 800-107 Rev. 1 §5.3
 * and RFC 2104.
 * 
 * Design rationale:
 * - Separate HMAC key from encryption key (key separation principle)
 * - Verify HMAC *before* attempting decryption (Encrypt-then-MAC)
 * - Constant-time comparison via Web Crypto verify to prevent timing attacks
 */

/**
 * Compute HMAC-SHA256 over arbitrary data
 * 
 * @param data - Data to authenticate
 * @param key  - HMAC key (any length; 32 bytes recommended)
 * @returns Hex-encoded HMAC string (64 characters)
 */
export async function computeHmac(
  data: Uint8Array,
  key: Uint8Array,
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as Uint8Array<ArrayBuffer>,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', cryptoKey, data as Uint8Array<ArrayBuffer>),
  )

  return bytesToHex(signature)
}

/**
 * Verify an HMAC-SHA256 tag
 * 
 * Uses Web Crypto's verify() which performs constant-time comparison
 * internally, preventing timing side-channel attacks.
 * 
 * @param data         - Data that was authenticated
 * @param key          - HMAC key (same key used for computeHmac)
 * @param expectedHmac - Hex-encoded HMAC to verify against
 * @returns True if HMAC is valid
 */
export async function verifyHmac(
  data: Uint8Array,
  key: Uint8Array,
  expectedHmac: string,
): Promise<boolean> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as Uint8Array<ArrayBuffer>,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  const expectedBytes = hexToBytes(expectedHmac)

  return crypto.subtle.verify(
    'HMAC',
    cryptoKey,
    expectedBytes as Uint8Array<ArrayBuffer>,
    data as Uint8Array<ArrayBuffer>,
  )
}

/** Convert bytes to lowercase hex string */
function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

/** Convert hex string to bytes */
function hexToBytes(hex: string): Uint8Array {
  const len = hex.length >>> 1
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
