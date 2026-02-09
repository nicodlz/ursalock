/**
 * JWK-based encryption using @z-base/cryptosuite
 * For use with ZKCredentials PRF-derived keys
 */

import { CipherCluster, type CipherJWK } from "@z-base/cryptosuite";

export type { CipherJWK };

/** Encrypted payload with IV and ciphertext */
export interface JwkEncryptedPayload {
  /** Initialization vector (12 bytes for AES-GCM) */
  iv: Uint8Array;
  /** Encrypted data */
  ciphertext: Uint8Array;
  /** Combined iv + ciphertext for easy storage */
  combined: Uint8Array;
}

/**
 * Encrypt data using AES-256-GCM with a CipherJWK
 * 
 * @param plaintext - Data to encrypt
 * @param cipherJwk - JWK key from ZKCredentials
 * @returns Encrypted payload with IV
 */
export async function encryptWithJwk(
  plaintext: Uint8Array,
  cipherJwk: CipherJWK
): Promise<JwkEncryptedPayload> {
  const result = await CipherCluster.encrypt(cipherJwk, plaintext);
  
  const iv = result.iv;
  const ciphertext = new Uint8Array(result.ciphertext);
  
  // Combine IV + ciphertext for storage
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  
  return { iv, ciphertext, combined };
}

/**
 * Decrypt data using AES-256-GCM with a CipherJWK
 * 
 * @param encrypted - Combined IV + ciphertext, or separate components
 * @param cipherJwk - JWK key from ZKCredentials
 * @returns Decrypted plaintext
 */
export async function decryptWithJwk(
  encrypted: Uint8Array | JwkEncryptedPayload,
  cipherJwk: CipherJWK
): Promise<Uint8Array> {
  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  
  if (encrypted instanceof Uint8Array) {
    // Combined format: first 12 bytes are IV (AES-GCM standard)
    if (encrypted.length < 12 + 16) {
      throw new Error("Invalid encrypted data: too short");
    }
    iv = encrypted.slice(0, 12);
    ciphertext = encrypted.slice(12);
  } else {
    iv = encrypted.iv;
    ciphertext = encrypted.ciphertext;
  }
  
  try {
    // Create a proper ArrayBuffer copy to avoid SharedArrayBuffer issues
    const ciphertextBuffer = new ArrayBuffer(ciphertext.length);
    new Uint8Array(ciphertextBuffer).set(ciphertext);
    
    return await CipherCluster.decrypt(cipherJwk, {
      iv,
      ciphertext: ciphertextBuffer,
    });
  } catch {
    throw new Error("Decryption failed: invalid key or corrupted data");
  }
}

/**
 * Encrypt a string using CipherJWK
 */
export async function encryptStringWithJwk(
  plaintext: string,
  cipherJwk: CipherJWK
): Promise<JwkEncryptedPayload> {
  const data = new TextEncoder().encode(plaintext);
  return encryptWithJwk(data, cipherJwk);
}

/**
 * Decrypt to a string using CipherJWK
 */
export async function decryptStringWithJwk(
  encrypted: Uint8Array | JwkEncryptedPayload,
  cipherJwk: CipherJWK
): Promise<string> {
  const plaintext = await decryptWithJwk(encrypted, cipherJwk);
  return new TextDecoder().decode(plaintext);
}
