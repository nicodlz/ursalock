/**
 * vault() middleware - Drop-in replacement for persist()
 * Adds E2EE encryption and cloud sync to Zustand stores
 * 
 * Type pattern follows zustand's persist middleware:
 * - Simple internal implementation type (VaultImpl)
 * - Complex public API type (Vault)
 * - Cast at export: `vaultImpl as unknown as Vault`
 */

import type { StateCreator, StoreApi, StoreMutatorIdentifier } from 'zustand'
import { createVaultStorage, type VaultStorage } from './storage.js'

/** Vault middleware options */
export interface VaultOptions<S, PersistedState = S> {
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
  partialize?: (state: S) => PersistedState
  
  /**
   * Merge function for rehydration
   * @default Object.assign
   */
  merge?: (persistedState: unknown, currentState: S) => S
  
  /**
   * Called when state is loaded from storage
   */
  onRehydrateStorage?: (state: S) => ((state?: S, error?: unknown) => void) | void
  
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

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

type VaultListener<S> = (state: S) => void

/** Store shape extended with vault API */
type StoreVault<S, Ps> = S extends {
  getState: () => infer T
  setState: {
    (...args: infer Sa1): infer Sr1
    (...args: infer Sa2): infer Sr2
  }
} ? {
  setState(...args: Sa1): Sr1 | Promise<void>
  setState(...args: Sa2): Sr2 | Promise<void>
  vault: {
    sync: () => Promise<void>
    rehydrate: () => Promise<void>
    hasHydrated: () => boolean
    getSyncStatus: () => SyncStatus
    clearStorage: () => Promise<void>
    onHydrate: (fn: VaultListener<T>) => () => void
    onFinishHydration: (fn: VaultListener<T>) => () => void
  }
} : never

type Write<T, U> = Omit<T, keyof U> & U
type WithVault<S, A> = Write<S, StoreVault<S, A>>

/** Public API type with complex mutator support */
type Vault = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
  U = T,
>(
  initializer: StateCreator<T, [...Mps, ['vault', unknown]], Mcs>,
  options: VaultOptions<T, U>,
) => StateCreator<T, Mps, [['vault', U], ...Mcs]>

declare module 'zustand' {
  interface StoreMutators<S, A> {
    vault: WithVault<S, A>
  }
}

/** Simplified internal implementation type */
type VaultImpl = <T>(
  storeInitializer: StateCreator<T, [], []>,
  options: VaultOptions<T, T>,
) => StateCreator<T, [], []>

/**
 * Internal vault implementation
 * Uses simplified types - complex types applied at export
 */
const vaultImpl: VaultImpl = (config, baseOptions) => (set, get, api) => {
  type S = ReturnType<typeof config>
  
  const options = {
    partialize: (state: S) => state,
    merge: (persistedState: unknown, currentState: S) => ({
      ...currentState,
      ...(persistedState as object),
    }),
    syncInterval: 30000,
    ...baseOptions,
  }

  const {
    name,
    recoveryKey,
    server,
    partialize,
    merge,
    onRehydrateStorage,
    skipHydration = false,
    syncInterval,
  } = options

  // Create encrypted storage
  const storage = options.storage ?? createVaultStorage({
    recoveryKey,
    prefix: options.prefix,
  })

  // State
  let hasHydrated = false
  let syncStatus: SyncStatus = 'idle'
  const hydrationListeners = new Set<VaultListener<S>>()
  const finishHydrationListeners = new Set<VaultListener<S>>()

  // Persist to storage
  const persistState = async (): Promise<void> => {
    const state = partialize({ ...get() })
    await storage.setItem(name, JSON.stringify(state))
  }

  // Hydrate from storage
  const rehydrate = async (): Promise<void> => {
    hasHydrated = false
    hydrationListeners.forEach((cb) => cb(get()))
    
    const postRehydrationCallback = onRehydrateStorage?.(get()) || undefined
    
    try {
      const stored = await storage.getItem(name)
      
      if (stored) {
        const parsed = JSON.parse(stored) as unknown
        const merged = merge(parsed, get())
        set(merged, true)
      }
      
      hasHydrated = true
      postRehydrationCallback?.(get(), undefined)
      finishHydrationListeners.forEach((cb) => cb(get()))
    } catch (error) {
      postRehydrationCallback?.(undefined, error as Error)
    }
  }

  // Sync with server (if configured)
  const sync = async (): Promise<void> => {
    if (!server) return
    
    syncStatus = 'syncing'
    
    try {
      // TODO: Implement server sync in Phase 5
      await persistState()
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

  // Override setState to persist on changes
  // Using type assertion for the overloaded setState signature
  // This is the same pattern zustand persist uses internally
  type SetState = typeof api.setState
  const savedSetState: SetState = api.setState
  
  api.setState = ((state: S | Partial<S> | ((s: S) => S | Partial<S>), replace?: boolean) => {
    if (replace) {
      savedSetState(state as S, true)
    } else {
      savedSetState(state)
    }
    void persistState()
  }) as SetState

  // Create store with wrapped set
  const configResult = config(
    ((partial: S | Partial<S> | ((s: S) => S | Partial<S>), replace?: boolean) => {
      if (replace) {
        set(partial as S, true)
      } else {
        set(partial)
      }
      void persistState()
    }) as typeof set,
    get,
    api,
  )

  // Extend API with vault methods
  const storeWithVault = api as StoreApi<S> & { vault: unknown }
  storeWithVault.vault = {
    sync,
    rehydrate,
    hasHydrated: () => hasHydrated,
    getSyncStatus: () => syncStatus,
    clearStorage,
    onHydrate: (cb: VaultListener<S>) => {
      hydrationListeners.add(cb)
      return () => hydrationListeners.delete(cb)
    },
    onFinishHydration: (cb: VaultListener<S>) => {
      finishHydrationListeners.add(cb)
      return () => finishHydrationListeners.delete(cb)
    },
  }

  // Auto-hydrate on init (unless skipHydration)
  if (!skipHydration) {
    void rehydrate()
  } else {
    // Even with skipHydration, mark as hydrated to allow persistence
    hasHydrated = true
  }

  // Setup sync interval (if server configured)
  if (server && syncInterval > 0) {
    setInterval(() => void sync(), syncInterval)
  }

  return configResult
}

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
export const vault = vaultImpl as unknown as Vault
