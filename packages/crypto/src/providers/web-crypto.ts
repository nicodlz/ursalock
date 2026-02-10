/**
 * Web Crypto API implementation (Concrete provider)
 * Implements ICryptoProvider using browser's native crypto
 */

import type { ICryptoProvider, IEncryptedPayload } from "../interfaces.js";
import { randomBytes, concatBytes } from "../utils.js";

/** IV length for AES-GCM (96 bits = 12 bytes, NIST recommended) */
const IV_LENGTH = 12;

/**
 * Web Crypto API provider for AES-256-GCM
 */
export class WebCryptoProvider implements ICryptoProvider {
  async encrypt(
    plaintext: Uint8Array,
    key: Uint8Array,
    iv?: Uint8Array
  ): Promise<IEncryptedPayload> {
    // Validate key length
    if (key.length !== 32) {
      throw new Error(`Invalid key length: expected 32 bytes, got ${key.length}`);
    }

    // Generate or use provided IV
    const actualIv = iv ?? randomBytes(IV_LENGTH);

    // Import key for Web Crypto
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key.buffer as ArrayBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    // Encrypt
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: actualIv as Uint8Array<ArrayBuffer> },
        cryptoKey,
        plaintext.buffer as ArrayBuffer
      )
    );

    // Combine IV + ciphertext for easy storage
    const combined = concatBytes(actualIv, ciphertext);

    return { iv: actualIv, ciphertext, combined };
  }

  async decrypt(
    encrypted: Uint8Array | IEncryptedPayload,
    key: Uint8Array
  ): Promise<Uint8Array> {
    // Validate key length
    if (key.length !== 32) {
      throw new Error(`Invalid key length: expected 32 bytes, got ${key.length}`);
    }

    let iv: Uint8Array;
    let ciphertext: Uint8Array;

    if (encrypted instanceof Uint8Array) {
      // Combined format: first 12 bytes are IV
      if (encrypted.length < IV_LENGTH + 16) {
        throw new Error('Invalid encrypted data: too short');
      }
      iv = encrypted.slice(0, IV_LENGTH);
      ciphertext = encrypted.slice(IV_LENGTH);
    } else {
      // Separate components
      iv = encrypted.iv;
      ciphertext = encrypted.ciphertext;
    }

    // Import key for Web Crypto
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key.buffer as ArrayBuffer,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // Decrypt
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
        cryptoKey,
        ciphertext.buffer as ArrayBuffer
      );
      return new Uint8Array(plaintext);
    } catch (error) {
      throw new Error('Decryption failed: invalid key or corrupted data');
    }
  }
}
