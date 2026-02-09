/**
 * React hooks for vault status
 */

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

/**
 * Hook to get sync status from a vault store
 * 
 * @example
 * ```tsx
 * const status = useSyncStatus(useStore)
 * // 'idle' | 'syncing' | 'synced' | 'error'
 * ```
 */
export function useSyncStatus<T extends { getSyncStatus?: () => SyncStatus }>(
  useStore: () => T
): SyncStatus {
  const store = useStore()
  return store.getSyncStatus?.() ?? 'idle'
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
export function useHydrated<T extends { hasHydrated?: () => boolean }>(
  useStore: () => T
): boolean {
  const store = useStore()
  return store.hasHydrated?.() ?? false
}
