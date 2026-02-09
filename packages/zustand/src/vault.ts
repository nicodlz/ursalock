/**
 * vault() middleware - Drop-in replacement for persist()
 * Adds E2EE encryption and cloud sync to Zustand stores
 */

import type { StateCreator, StoreMutatorIdentifier } from 'zustand'
import { createVaultStorage, type VaultStorage } from './storage.js'

/** Vault middleware options */
export interface VaultOptions<T> {
  /** Unique name for this vault (used as storage key) */
  name: string
  
  /** Recovery key for E2EE encryption */
  recoveryKey: string
  
  /**
   * Server URL for sync (optional)
   * If not provided, only local encrypted storage is used
   */
  server?: string
  
  /** Custom storage implementation */
  storage?: VaultStorage
  
  /** Storage key prefix (default: 'zod-vault:') */
  prefix?: string
  
  /**
   * Partial state to persist
   * @default (state) => state (persist everything)
   */
  partialize?: (state: T) => Partial<T>
  
  /**
   * Merge function for rehydration
   * @default Object.assign
   */
  merge?: (persistedState: Partial<T>, currentState: T) => T
  
  /**
   * Called when state is loaded from storage
   */
  onRehydrateStorage?: (state: T | undefined) => ((state?: T, error?: Error) => void) | void
  
  /**
   * Skip hydration on init (useful for SSR)
   * Call rehydrate() manually when ready
   */
  skipHydration?: boolean
  
  /**
   * Sync interval in ms (default: 30000 = 30s)
   * Set to 0 to disable auto-sync
   */
  syncInterval?: number
}

/** API exposed by vault middleware */
export interface VaultApi<T> {
  /** Manually trigger sync with server */
  sync: () => Promise<void>
  /** Manually trigger rehydration from storage */
  rehydrate: () => Promise<void>
  /** Check if store has been hydrated */
  hasHydrated: () => boolean
  /** Get current sync status */
  getSyncStatus: () => SyncStatus
  /** Clear all stored data */
  clearStorage: () => Promise<void>
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

type VaultImpl = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  initializer: StateCreator<T, [...Mps, ['vault', unknown]], Mcs>,
  options: VaultOptions<T>,
) => StateCreator<T, Mps, [['vault', unknown], ...Mcs]>

type Vault = VaultImpl & {
  /** @deprecated use vault() directly */
  persist: VaultImpl
}

declare module 'zustand' {
  interface StoreMutators<S, A> {
    vault: Write<S, VaultApi<S>>
  }
}

type Write<T, U> = Omit<T, keyof U> & U

/**
 * vault() middleware - Add E2EE encrypted persistence to Zustand
 * 
 * @example
 * ```ts
 * const useStore = create(
 *   vault(
 *     (set) => ({
 *       count: 0,
 *       increment: () => set((s) => ({ count: s.count + 1 })),
 *     }),
 *     {
 *       name: 'my-store',
 *       recoveryKey: 'ABCD-EFGH-...',
 *       server: 'https://vault.example.com', // optional
 *     }
 *   )
 * )
 * ```
 */
const vaultImpl: VaultImpl = (initializer, options) => (set, get, api) => {
  const {
    name,
    recoveryKey,
    server,
    partialize = (state) => state,
    merge = (persisted, current) => ({ ...current, ...persisted }),
    onRehydrateStorage,
    skipHydration = false,
    syncInterval = 30000,
  } = options

  // Create encrypted storage
  const storage = options.storage ?? createVaultStorage({
    recoveryKey,
    prefix: options.prefix,
  })

  // State
  let hasHydrated = false
  let syncStatus: SyncStatus = 'idle'
  let syncTimer: ReturnType<typeof setInterval> | null = null

  // Hydrate from storage
  const rehydrate = async (): Promise<void> => {
    const postRehydrationCallback = onRehydrateStorage?.(get())
    
    try {
      const stored = await storage.getItem(name)
      
      if (stored) {
        const parsed = JSON.parse(stored)
        const merged = merge(parsed, get())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set(merged as any, true)
      }
      
      hasHydrated = true
      postRehydrationCallback?.(get(), undefined)
    } catch (error) {
      postRehydrationCallback?.(undefined, error as Error)
    }
  }

  // Persist to storage
  const persist = async (): Promise<void> => {
    const state = partialize(get())
    await storage.setItem(name, JSON.stringify(state))
  }

  // Sync with server (if configured)
  const sync = async (): Promise<void> => {
    if (!server) return
    
    syncStatus = 'syncing'
    
    try {
      // TODO: Implement server sync in Phase 5
      // For now, just persist locally
      await persist()
      syncStatus = 'synced'
    } catch (error) {
      console.error('[zod-vault] Sync failed:', error)
      syncStatus = 'error'
    }
  }

  // Clear storage
  const clearStorage = async (): Promise<void> => {
    await storage.removeItem(name)
  }

  // Extend API with vault methods
  const vaultApi = {
    sync,
    rehydrate,
    hasHydrated: () => hasHydrated,
    getSyncStatus: () => syncStatus,
    clearStorage,
  }

  // Merge into store API
  Object.assign(api, vaultApi)

  // Subscribe to changes and persist
  api.subscribe(async () => {
    if (hasHydrated) {
      await persist()
    }
  })

  // Auto-hydrate on init (unless skipHydration)
  if (!skipHydration) {
    rehydrate()
  } else {
    // Even with skipHydration, allow persistence to work
    hasHydrated = true
  }

  // Setup sync interval (if server configured)
  if (server && syncInterval > 0) {
    syncTimer = setInterval(sync, syncInterval)
  }

  // Create the store
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return initializer(set, get, api as any)
}

export const vault = vaultImpl as Vault
vault.persist = vaultImpl
