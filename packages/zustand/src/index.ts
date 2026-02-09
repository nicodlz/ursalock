/**
 * @zod-vault/zustand
 * Encrypted persistence middleware for Zustand
 */

export { vault, type VaultOptions, type VaultApi } from './vault.js'
export { createVaultStorage, type VaultStorage } from './storage.js'
export { useSyncStatus, type SyncStatus } from './hooks.js'
