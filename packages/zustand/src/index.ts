/**
 * @zod-vault/zustand
 * Encrypted persistence middleware for Zustand
 * 
 * Refactored to follow SOLID principles:
 * - Interface-based design (Dependency Inversion)
 * - Injectable dependencies for testing
 * - Separated concerns (Single Responsibility)
 */

// Core middleware
export {
  vault,
  type VaultOptions,
  type VaultOptionsLegacy,
  type VaultOptionsJwk,
} from "./vault.js";

// Storage layer
export {
  createVaultStorage,
  type VaultStorage,
  type IStorageProvider,
  type EncryptedStorageOptions,
  type LegacyEncryptedStorageOptions,
  type JwkEncryptedStorageOptions,
} from "./storage.js";

// Storage interfaces and providers
export type { IVaultStorage } from "./interfaces/storage.js";
export { LocalStorageProvider } from "./providers/local-storage.js";

// HTTP interfaces and providers
export type { IHttpClient, IHttpRequest, IHttpResponse } from "./interfaces/http.js";
export { FetchHttpClient } from "./providers/fetch-http.js";

// Sync engine
export { type SyncStatus, type SyncState, createSyncEngine, type SyncEngine } from "./sync.js";

// React hooks
export { useSyncStatus } from "./hooks.js";
