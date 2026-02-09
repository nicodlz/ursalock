/**
 * @zod-vault/zustand
 * Encrypted persistence middleware for Zustand
 */

export {
  vault,
  type VaultOptions,
  type VaultOptionsLegacy,
  type VaultOptionsJwk,
} from "./vault.js";
export {
  createVaultStorage,
  type VaultStorage,
  type EncryptedStorageOptions,
  type LegacyEncryptedStorageOptions,
  type JwkEncryptedStorageOptions,
} from "./storage.js";
export { type SyncStatus, type SyncState, createSyncEngine, type SyncEngine } from "./sync.js";
export { useSyncStatus } from "./hooks.js";
