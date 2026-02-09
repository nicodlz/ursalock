---
title: "@zod-vault/zustand"
description: Zustand middleware API reference
---

The main package — encrypted persistence middleware for Zustand.

## vault

Middleware that adds encrypted persistence and cloud sync.

```typescript
import { create } from "zustand";
import { vault } from "@zod-vault/zustand";

const useStore = create(
  vault(
    (set, get) => ({
      count: 0,
      increment: () => set((s) => ({ count: s.count + 1 })),
    }),
    {
      name: "my-store",
      recoveryKey: "ABCD-EFGH-...",
    }
  )
);
```

### Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `name` | `string` | Yes | - | Unique identifier for this vault |
| `recoveryKey` | `string` | Yes | - | Encryption key |
| `server` | `string` | No | - | Server URL for cloud sync |
| `getToken` | `() => string \| null` | No* | - | Auth token getter (*required if server set) |
| `partialize` | `(state) => partial` | No | `(s) => s` | Select which state to persist |
| `merge` | `(persisted, current) => merged` | No | `Object.assign` | How to merge persisted state |
| `skipHydration` | `boolean` | No | `false` | Skip auto-hydration on init |
| `syncInterval` | `number` | No | `30000` | Auto-sync interval (0 to disable) |
| `storage` | `VaultStorage` | No | localStorage | Custom storage implementation |
| `prefix` | `string` | No | `zod-vault:` | Storage key prefix |
| `onRehydrateStorage` | `(state) => callback` | No | - | Hydration lifecycle hook |

### Store Extensions

The middleware adds a `vault` object to the store:

```typescript
useStore.vault.sync()
useStore.vault.push()
useStore.vault.pull()
useStore.vault.rehydrate()
useStore.vault.hasHydrated()
useStore.vault.getSyncStatus()
useStore.vault.hasPendingChanges()
useStore.vault.clearStorage()
useStore.vault.onHydrate(callback)
useStore.vault.onFinishHydration(callback)
```

## vault.sync

Full bidirectional sync with server.

```typescript
await useStore.vault.sync();
```

Pushes local changes, pulls remote changes, merges with LWW.

## vault.push

Push local state to server.

```typescript
await useStore.vault.push();
```

## vault.pull

Pull latest state from server.

```typescript
const hasChanges = await useStore.vault.pull();
// => true if server had newer data
```

## vault.rehydrate

Reload state from local storage.

```typescript
await useStore.vault.rehydrate();
```

## vault.hasHydrated

Check if initial hydration is complete.

```typescript
if (useStore.vault.hasHydrated()) {
  // Safe to use store
}
```

## vault.getSyncStatus

Get current sync status.

```typescript
const status = useStore.vault.getSyncStatus();
// "idle" | "syncing" | "synced" | "error" | "offline"
```

## vault.hasPendingChanges

Check if offline queue has pending changes.

```typescript
if (useStore.vault.hasPendingChanges()) {
  // Changes waiting to sync
}
```

## vault.clearStorage

Delete all stored data (local and server).

```typescript
await useStore.vault.clearStorage();
```

## vault.onHydrate

Subscribe to hydration start.

```typescript
const unsubscribe = useStore.vault.onHydrate((state) => {
  console.log("Hydration starting");
});
```

## vault.onFinishHydration

Subscribe to hydration complete.

```typescript
const unsubscribe = useStore.vault.onFinishHydration((state) => {
  console.log("Hydration complete", state);
});
```

## Types

```typescript
import type { VaultOptions, SyncStatus } from "@zod-vault/zustand";

type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

interface VaultOptions<S, PersistedState = S> {
  name: string;
  recoveryKey: string;
  server?: string;
  getToken?: () => string | null;
  partialize?: (state: S) => PersistedState;
  merge?: (persisted: unknown, current: S) => S;
  skipHydration?: boolean;
  syncInterval?: number;
  storage?: VaultStorage;
  prefix?: string;
  onRehydrateStorage?: (state: S) => ((state?: S, error?: unknown) => void) | void;
}
```
