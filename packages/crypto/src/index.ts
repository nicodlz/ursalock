/**
 * @ursalock/crypto
 * E2EE crypto primitives: Argon2id key derivation + AES-256-GCM encryption
 * 
 * Refactored to follow SOLID principles:
 * - Interfaces for all crypto operations (Dependency Inversion)
 * - Provider pattern for pluggable implementations
 * - Testable and mockable
 */

// Interfaces (Dependency Inversion Principle)
export type {
  ICryptoProvider,
  IKeyDerivationProvider,
  IEncryptedPayload,
} from "./interfaces.js";

// Concrete implementations
export { WebCryptoProvider } from "./providers/web-crypto.js";

// Legacy recovery key based encryption (for backward compatibility)
export { deriveKey, DEFAULT_ARGON2_PARAMS, LEGACY_ARGON2_PARAMS, type DeriveKeyOptions, type DerivedKey } from "./derive.js";
export {
  encrypt,
  decrypt,
  encryptString,
  decryptString,
  setCryptoProvider,
  getCryptoProvider,
  type EncryptedPayload,
} from "./aes.js";
export {
  generateRecoveryKey,
  validateRecoveryKey,
  recoveryKeyToBytes,
  bytesToRecoveryKey,
  formatRecoveryKey,
  type RecoveryKey,
} from "./recovery.js";
export { randomBytes, constantTimeEqual, bytesToBase64, base64ToBytes } from "./utils.js";
export { computeHmac, verifyHmac } from "./hmac.js";
export { hkdf, deriveVaultKeys, type VaultKeys } from "./hkdf.js";

// New JWK-based encryption (for ZKCredentials PRF-derived keys)
export {
  encryptWithJwk,
  decryptWithJwk,
  encryptStringWithJwk,
  decryptStringWithJwk,
  type CipherJWK,
  type JwkEncryptedPayload,
} from "./jwk.js";
