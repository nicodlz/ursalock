/**
 * vault() middleware - Drop-in replacement for persist()
 * Adds E2EE encryption and cloud sync to Zustand stores
 * 
 * Supports two encryption modes:
 * - Legacy: recoveryKey string (Argon2id key derivation)
 * - New: cipherJwk from ZKCredentials (PRF-derived)
 * 
 * Type pattern follows zustand's persist middleware:
 * - Simple internal implementation type (VaultImpl)
 * - Complex public API type (Vault)
 * - Cast at export: `vaultImpl as unknown as Vault`
 */

import type { StateCreator, StoreApi, StoreMutatorIdentifier } from "zustand";
import { createVaultStorage, type VaultStorage } from "./storage.js";
import { createSyncEngine, type SyncEngine, type SyncState } from "./sync.js";
import type { CipherJWK } from "@ursalock/crypto";

/** Base vault middleware options */
interface VaultOptionsBase<S, PersistedState = S> {
  /** Unique name for this vault (used as storage key) */
  name: string;
  
  /**
   * Server URL for sync (optional)
   * If not provided, only local encrypted storage is used
   */
  server?: string;
  
  /**
   * Auth token getter for server sync
   * Required if server is provided
   */
  getToken?: () => string | null;
  
  /** Custom storage implementation */
  storage?: VaultStorage;
  
  /** Storage key prefix (default: 'ursalock:') */
  prefix?: string;
  
  /**
   * Partial state to persist
   * @default (state) => state (persist everything)
   */
  partialize?: (state: S) => PersistedState;
  
  /**
   * Merge function for rehydration
   * @default Object.assign
   */
  merge?: (persistedState: unknown, currentState: S) => S;
  
  /**
   * Called when state is loaded from storage
   */
  onRehydrateStorage?: (state: S) => ((state?: S, error?: unknown) => void) | void;
  
  /**
   * Skip hydration on init (useful for SSR)
   * Call rehydrate() manually when ready
   */
  skipHydration?: boolean;
  
  /**
   * Sync interval in ms (default: 30000 = 30s)
   * Set to 0 to disable auto-sync
   */
  syncInterval?: number;
}

/** Legacy options using recovery key string */
export interface VaultOptionsLegacy<S, PersistedState = S> extends VaultOptionsBase<S, PersistedState> {
  /** Recovery key for E2EE encryption (legacy mode) */
  recoveryKey: string;
}

/** New options using CipherJWK from ZKCredentials */
export interface VaultOptionsJwk<S, PersistedState = S> extends VaultOptionsBase<S, PersistedState> {
  /** CipherJWK for E2EE encryption (from ZKCredentials) */
  cipherJwk: CipherJWK;
}

export type VaultOptions<S, PersistedState = S> = 
  | VaultOptionsLegacy<S, PersistedState>
  | VaultOptionsJwk<S, PersistedState>;

export type { SyncStatus, SyncState } from "./sync.js";

type VaultListener<S> = (state: S) => void;

import type { SyncStatus } from "./sync.js";

/** Store shape extended with vault API */
type StoreVault<S, Ps> = S extends {
  getState: () => infer T;
  setState: {
    (...args: infer Sa1): infer Sr1;
    (...args: infer Sa2): infer Sr2;
  };
} ? {
  setState(...args: Sa1): Sr1 | Promise<void>;
  setState(...args: Sa2): Sr2 | Promise<void>;
  vault: {
    /** Full bidirectional sync with server */
    sync: () => Promise<void>;
    /** Push local changes to server */
    push: () => Promise<void>;
    /** Pull latest from server */
    pull: () => Promise<boolean>;
    /** Rehydrate from local storage */
    rehydrate: () => Promise<void>;
    /** Check if store has been hydrated */
    hasHydrated: () => boolean;
    /** Get current sync status */
    getSyncStatus: () => SyncStatus;
    /** Check if there are pending offline changes */
    hasPendingChanges: () => boolean;
    /** Clear all stored data (local + server) */
    clearStorage: () => Promise<void>;
    /** Clean up sync interval and timers */
    destroy: () => void;
    /** Subscribe to hydration start */
    onHydrate: (fn: VaultListener<T>) => () => void;
    /** Subscribe to hydration complete */
    onFinishHydration: (fn: VaultListener<T>) => () => void;
  };
} : never;

type Write<T, U> = Omit<T, keyof U> & U;
type WithVault<S, A> = Write<S, StoreVault<S, A>>;

/** Public API type with complex mutator support */
type Vault = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
  U = T,
>(
  initializer: StateCreator<T, [...Mps, ["vault", unknown]], Mcs>,
  options: VaultOptions<T, U>,
) => StateCreator<T, Mps, [["vault", U], ...Mcs]>;

declare module "zustand" {
  interface StoreMutators<S, A> {
    vault: WithVault<S, A>;
  }
}

/** Helper to check if using JWK mode */
function isJwkMode<S, P>(options: VaultOptions<S, P>): options is VaultOptionsJwk<S, P> {
  return "cipherJwk" in options;
}

/** Simplified internal implementation type */
type VaultImpl = <T>(
  storeInitializer: StateCreator<T, [], []>,
  options: VaultOptions<T, T>,
) => StateCreator<T, [], []>;

/**
 * Internal vault implementation
 * Uses simplified types - complex types applied at export
 */
const vaultImpl: VaultImpl = (config, baseOptions) => (set, get, api) => {
  type S = ReturnType<typeof config>;
  
  const options = {
    partialize: (state: S) => state,
    merge: (persistedState: unknown, currentState: S) => ({
      ...currentState,
      ...(persistedState as object),
    }),
    syncInterval: 30000,
    ...baseOptions,
  };

  const {
    name,
    server,
    getToken,
    partialize,
    merge,
    onRehydrateStorage,
    skipHydration = false,
    syncInterval,
  } = options;

  // Create encrypted storage based on mode
  const storage = options.storage ?? createVaultStorage(
    isJwkMode(options)
      ? { cipherJwk: options.cipherJwk, prefix: options.prefix }
      : { recoveryKey: options.recoveryKey, prefix: options.prefix }
  );

  // State
  let hasHydrated = false;
  let localUpdatedAt = 0; // Start at 0 - server data wins until we have local changes
  let hasLocalData = false; // Track if we loaded data from local storage
  let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const hydrationListeners = new Set<VaultListener<S>>();
  const finishHydrationListeners = new Set<VaultListener<S>>();

  // Create sync engine (if server configured)
  let syncEngine: SyncEngine | null = null;
  if (server && getToken) {
    syncEngine = createSyncEngine({
      serverUrl: server,
      name,
      getToken,
      onServerData: (data, _salt, updatedAt) => {
        // Server has newer data, update local store
        // Only pull if we haven't made local changes since last sync
        if (localUpdatedAt > updatedAt) {
          // Local is actually newer - don't overwrite, push instead
          void syncEngine?.push();
          return;
        }
        try {
          const parsed = JSON.parse(data) as unknown;
          const merged = merge(parsed, get());
          set(merged, true);
          localUpdatedAt = updatedAt;
          // Also persist to local storage to keep in sync
          void storage.setItem(name, JSON.stringify(partialize({ ...get() })));
        } catch (err) {
          console.error("[ursalock] Failed to parse server data:", err);
        }
      },
      getLocalData: () => {
        // Get current encrypted local data
        const state = partialize({ ...get() });
        return {
          data: JSON.stringify(state),
          salt: "", // Salt is handled by storage layer
          updatedAt: localUpdatedAt,
        };
      },
    });
  }

  // Persist to storage and trigger debounced sync
  const persistState = async (): Promise<void> => {
    const state = partialize({ ...get() });
    await storage.setItem(name, JSON.stringify(state));
    localUpdatedAt = Date.now();
    
    // Debounced sync after changes (3 seconds)
    if (syncEngine) {
      if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
      }
      syncDebounceTimer = setTimeout(() => {
        syncDebounceTimer = null;
        void syncEngine?.sync();
      }, 3000);
    }
  };

  // Hydrate from storage
  const rehydrate = async (): Promise<void> => {
    hasHydrated = false;
    hydrationListeners.forEach((cb) => cb(get()));
    
    const postRehydrationCallback = onRehydrateStorage?.(get()) || undefined;
    
    try {
      const stored = await storage.getItem(name);
      
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        const merged = merge(parsed, get());
        set(merged, true);
        hasLocalData = true;
        // Don't set localUpdatedAt here - keep at 0 so first sync pulls from server
        // localUpdatedAt will be set properly after first successful sync or local change
      }
      
      hasHydrated = true;
      postRehydrationCallback?.(get(), undefined);
      finishHydrationListeners.forEach((cb) => cb(get()));
    } catch (error) {
      postRehydrationCallback?.(undefined, error as Error);
    }
  };

  // Sync methods (delegate to sync engine)
  const sync = async (): Promise<void> => {
    if (!syncEngine) return;
    await syncEngine.sync();
  };

  const push = async (): Promise<void> => {
    if (!syncEngine) return;
    await syncEngine.push();
  };

  const pull = async (): Promise<boolean> => {
    if (!syncEngine) return false;
    return syncEngine.pull();
  };

  const getSyncStatus = () => {
    if (!syncEngine) return "idle" as const;
    return syncEngine.getState().status;
  };

  const hasPendingChanges = () => {
    if (!syncEngine) return false;
    return syncEngine.getState().pendingChanges;
  };

  // Clear storage
  const clearStorage = async (): Promise<void> => {
    await storage.removeItem(name);
    syncEngine?.clearQueue();
  };

  // Override setState to persist on changes
  // Using type assertion for the overloaded setState signature
  // This is the same pattern zustand persist uses internally
  type SetState = typeof api.setState;
  const savedSetState: SetState = api.setState;
  
  api.setState = ((state: S | Partial<S> | ((s: S) => S | Partial<S>), replace?: boolean) => {
    if (replace) {
      savedSetState(state as S, true);
    } else {
      savedSetState(state);
    }
    void persistState().catch((err) => console.error("[ursalock] Failed to persist state:", err));
  }) as SetState;

  // Create store with wrapped set
  const configResult = config(
    ((partial: S | Partial<S> | ((s: S) => S | Partial<S>), replace?: boolean) => {
      if (replace) {
        set(partial as S, true);
      } else {
        set(partial);
      }
      void persistState().catch((err) => console.error("[ursalock] Failed to persist state:", err));
    }) as typeof set,
    get,
    api,
  );

  // Extend API with vault methods
  const storeWithVault = api as StoreApi<S> & { vault: unknown };
  storeWithVault.vault = {
    sync,
    push,
    pull,
    rehydrate,
    hasHydrated: () => hasHydrated,
    getSyncStatus,
    hasPendingChanges,
    clearStorage,
    onHydrate: (cb: VaultListener<S>) => {
      hydrationListeners.add(cb);
      return () => hydrationListeners.delete(cb);
    },
    onFinishHydration: (cb: VaultListener<S>) => {
      finishHydrationListeners.add(cb);
      return () => finishHydrationListeners.delete(cb);
    },
  };

  // Auto-hydrate on init (unless skipHydration)
  if (!skipHydration) {
    void rehydrate().then(() => {
      // Sync immediately after hydration to get latest server data
      if (syncEngine) {
        void syncEngine.sync();
      }
    });
  } else {
    // Even with skipHydration, mark as hydrated to allow persistence
    hasHydrated = true;
  }

  // Setup sync interval (if server configured)
  let syncIntervalId: ReturnType<typeof setInterval> | null = null;
  if (server && syncInterval > 0) {
    syncIntervalId = setInterval(() => void sync(), syncInterval);
  }

  // Expose destroy method to clean up interval
  const vaultApi = storeWithVault.vault as Record<string, unknown>;
  vaultApi.destroy = () => {
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = null;
    }
  };

  return configResult;
};

/**
 * vault() middleware - Add E2EE encrypted persistence to Zustand
 * 
 * @example Using CipherJWK from ZKCredentials (recommended)
 * ```ts
 * const useStore = create(
 *   vault(
 *     (set) => ({
 *       count: 0,
 *       increment: () => set((s) => ({ count: s.count + 1 })),
 *     }),
 *     {
 *       name: 'my-store',
 *       cipherJwk: credential.cipherJwk, // From ZKCredentials
 *       server: 'https://vault.example.com', // optional
 *     }
 *   )
 * )
 * ```
 * 
 * @example Using recovery key (legacy)
 * ```ts
 * const useStore = create(
 *   vault(
 *     (set) => ({ ... }),
 *     {
 *       name: 'my-store',
 *       recoveryKey: 'ABCD-EFGH-...',
 *     }
 *   )
 * )
 * ```
 */
export const vault = vaultImpl as unknown as Vault;
