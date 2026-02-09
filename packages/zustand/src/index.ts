/**
 * @zod-vault/zustand
 * Encrypted persistence middleware for Zustand
 */

export { vault, type VaultOptions, type SyncStatus } from './vault.js'
export { createVaultStorage, type VaultStorage } from './storage.js'
export { useSyncStatus } from './hooks.js'
