/**
 * @zod-vault/zustand
 * Encrypted persistence middleware for Zustand
 */

export { vault, type VaultOptions } from './vault.js'
export { createVaultStorage, type VaultStorage } from './storage.js'
export { type SyncStatus, type SyncState, createSyncEngine, type SyncEngine } from './sync.js'
export { useSyncStatus } from './hooks.js'
