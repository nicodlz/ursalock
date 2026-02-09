/**
 * React hooks for vault status
 */

import type { SyncStatus } from './vault.js'

/**
 * Hook to get sync status from a vault store
 * 
 * @example
 * ```tsx
 * const status = useSyncStatus(useStore)
 * // 'idle' | 'syncing' | 'synced' | 'error'
 * ```
 */
export function useSyncStatus<T extends { vault?: { getSyncStatus?: () => SyncStatus } }>(
  useStore: () => T
): SyncStatus {
  const store = useStore()
  return store.vault?.getSyncStatus?.() ?? 'idle'
}

/**
 * Hook to check if store has been hydrated
 * 
 * @example
 * ```tsx
 * const hydrated = useHydrated(useStore)
 * if (!hydrated) return <Loading />
 * ```
 */
export function useHydrated<T extends { vault?: { hasHydrated?: () => boolean } }>(
  useStore: () => T
): boolean {
  const store = useStore()
  return store.vault?.hasHydrated?.() ?? false
}
