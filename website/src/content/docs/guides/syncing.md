---
title: Syncing Data
description: How sync works, offline support, and conflict resolution
---

zod-vault handles bidirectional sync between your local store and the server.

## Sync Methods

### Full Sync

```typescript
await useStore.vault.sync();
```

This:
1. Pushes local changes to server
2. Pulls remote changes from server
3. Merges with local state (LWW)

### Push Only

```typescript
await useStore.vault.push();
```

Send local changes to server without pulling.

### Pull Only

```typescript
const hasChanges = await useStore.vault.pull();
// Returns true if server had newer data
```

Get latest from server without pushing local changes.

## Auto-Sync

By default, vault syncs every 30 seconds:

```typescript
vault(storeConfig, {
  name: "my-store",
  recoveryKey: "...",
  server: "https://...",
  getToken: () => client.getToken(),
  syncInterval: 30000,  // 30 seconds (default)
})
```

Disable auto-sync:

```typescript
vault(storeConfig, {
  // ...
  syncInterval: 0,  // Manual sync only
})
```

## Sync Status

```typescript
const status = useStore.vault.getSyncStatus();
// "idle" | "syncing" | "synced" | "error" | "offline"
```

React hook:

```typescript
import { useVaultSync } from "@zod-vault/client";

function SyncIndicator() {
  const { status, hasPending, sync } = useVaultSync(useStore);

  return (
    <div>
      <span>Status: {status}</span>
      {hasPending && <span>Pending changes</span>}
      <button onClick={sync}>Sync Now</button>
    </div>
  );
}
```

## Offline Support

When offline, changes queue locally:

```typescript
// Check for pending changes
const pending = useStore.vault.hasPendingChanges();
// => true if offline queue has items
```

When back online, call `sync()` to flush the queue.

### Offline Queue Behavior

1. Changes made offline are stored locally
2. Data remains encrypted in localStorage
3. On next `sync()`, pending changes are pushed
4. Server applies changes with conflict resolution

## Conflict Resolution

zod-vault uses **Last-Write-Wins (LWW)**:

- Each change has a timestamp
- Server compares timestamps
- Newer timestamp wins

Example:

```
Device A: { count: 5 } at 10:00:00
Device B: { count: 8 } at 10:00:05

Server keeps: { count: 8 } (newer)
```

### Handling Conflicts in Your App

For more control, use `partialize` to sync only specific fields:

```typescript
vault(storeConfig, {
  name: "my-store",
  recoveryKey: "...",
  partialize: (state) => ({
    // Only sync these fields
    notes: state.notes,
    settings: state.settings,
    // Don't sync temporary UI state
  }),
})
```

## Sync on App Lifecycle

Recommended pattern:

```typescript
// On app start
useEffect(() => {
  useStore.vault.sync();
}, []);

// On visibility change (tab focus)
useEffect(() => {
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      useStore.vault.sync();
    }
  };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => document.removeEventListener("visibilitychange", handleVisibility);
}, []);

// Before close (flush pending)
useEffect(() => {
  const handleBeforeUnload = () => {
    if (useStore.vault.hasPendingChanges()) {
      useStore.vault.push();
    }
  };
  window.addEventListener("beforeunload", handleBeforeUnload);
  return () => window.removeEventListener("beforeunload", handleBeforeUnload);
}, []);
```

## Debugging

Enable debug logging:

```typescript
// In browser console
localStorage.setItem("zod-vault:debug", "true");
```

Check sync state:

```typescript
console.log({
  status: useStore.vault.getSyncStatus(),
  pending: useStore.vault.hasPendingChanges(),
  hydrated: useStore.vault.hasHydrated(),
});
```
