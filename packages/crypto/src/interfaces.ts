/**
 * Interfaces for crypto operations (Dependency Inversion Principle)
 * Allows testing and alternative implementations
 */

/** Encrypted data structure */
export interface IEncryptedPayload {
  /** Initialization vector */
  iv: Uint8Array;
  /** Ciphertext with auth tag */
  ciphertext: Uint8Array;
  /** Combined iv + ciphertext for storage */
  combined: Uint8Array;
}

/** Crypto provider interface for encryption/decryption */
export interface ICryptoProvider {
  /**
   * Encrypt data with AES-GCM
   * @param plaintext Data to encrypt
   * @param key 256-bit encryption key
   * @param iv Optional IV (generated if not provided)
   */
  encrypt(
    plaintext: Uint8Array,
    key: Uint8Array,
    iv?: Uint8Array
  ): Promise<IEncryptedPayload>;

  /**
   * Decrypt data with AES-GCM
   * @param encrypted Encrypted payload or combined bytes
   * @param key 256-bit encryption key
   */
  decrypt(
    encrypted: Uint8Array | IEncryptedPayload,
    key: Uint8Array
  ): Promise<Uint8Array>;
}

/** Key derivation provider interface */
export interface IKeyDerivationProvider {
  /**
   * Derive encryption key from password
   * @param password Password bytes
   * @param salt Salt (generated if not provided)
   * @param options Derivation options
   */
  deriveKey(
    password: Uint8Array,
    salt?: Uint8Array,
    options?: {
      iterations?: number;
      memorySize?: number;
      parallelism?: number;
    }
  ): Promise<{ key: Uint8Array; salt: Uint8Array }>;
}

/** Random number generator interface */
export interface IRandomProvider {
  /**
   * Generate cryptographically secure random bytes
   * @param length Number of bytes to generate
   */
  randomBytes(length: number): Uint8Array;
}
