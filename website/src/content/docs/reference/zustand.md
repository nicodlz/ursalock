---
title: "@ursalock/zustand"
description: Zustand middleware API reference
---

Encrypted persistence middleware for Zustand stores.

## Installation

```bash
npm install @ursalock/zustand @ursalock/crypto zustand
```

## vault

The main middleware that adds encrypted persistence and cloud sync.

```typescript
import { create, type StateCreator } from "zustand";
import { vault, type VaultOptionsJwk } from "@ursalock/zustand";
import type { CipherJWK } from "@ursalock/crypto";

interface MyState {
  count: number;
  increment: () => void;
}

function createStore(cipherJwk: CipherJWK) {
  const storeCreator: StateCreator<MyState> = (set) => ({
    count: 0,
    increment: () => set((s) => ({ count: s.count + 1 })),
  });

  const options: VaultOptionsJwk<MyState> = {
    name: "my-store",
    cipherJwk,
    server: "https://vault.example.com",
    getToken: () => getAuthToken(),
  };

  return create(vault(storeCreator, options));
}
```

## VaultOptionsJwk

Options for the vault middleware using a JWK encryption key (derived from passkey).

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `name` | `string` | Yes | - | Unique identifier for this vault |
| `cipherJwk` | `CipherJWK` | Yes | - | JWK encryption key from passkey PRF |
| `server` | `string` | No | - | Server URL for cloud sync |
| `getToken` | `() => string \| null` | No* | - | Auth token getter (*required with server) |
| `partialize` | `(state) => partial` | No | `(s) => s` | Select which state to persist |
| `merge` | `(persisted, current) => merged` | No | shallow merge | How to merge persisted state |
| `skipHydration` | `boolean` | No | `false` | Skip auto-hydration on init |
| `syncInterval` | `number` | No | `30000` | Auto-sync interval in ms (0 to disable) |
| `storage` | `VaultStorage` | No | localStorage | Custom storage backend |
| `prefix` | `string` | No | `"ursalock:"` | Storage key prefix |
| `onRehydrateStorage` | `(state) => callback` | No | - | Hydration lifecycle hook |

### Example with All Options

```typescript
const options: VaultOptionsJwk<MyState, PersistedState> = {
  name: "my-store",
  cipherJwk,
  
  // Cloud sync
  server: "https://vault.example.com",
  getToken: () => vaultClient.getToken(),
  syncInterval: 60000, // Sync every minute
  
  // Partial persistence
  partialize: (state) => ({
    notes: state.notes,
    settings: state.settings,
    // Don't persist UI state like currentNoteId
  }),
  
  // Custom merge
  merge: (persisted, current) => ({
    ...current,
    ...persisted,
    // Always use current UI state
    isLoading: current.isLoading,
  }),
  
  // Lifecycle
  skipHydration: false,
  onRehydrateStorage: () => (state, error) => {
    if (error) console.error("Hydration failed:", error);
    else console.log("Hydrated:", state);
  },
};
```

## Store Extensions

The middleware adds a `vault` object to the store:

```typescript
const store = create(vault(storeCreator, options));

// Access vault methods
store.vault.sync();
store.vault.push();
store.vault.pull();
store.vault.rehydrate();
store.vault.hasHydrated();
store.vault.getSyncStatus();
store.vault.hasPendingChanges();
store.vault.clearStorage();
store.vault.onHydrate(callback);
store.vault.onFinishHydration(callback);
```

## vault.sync()

Full bidirectional sync with server.

```typescript
await store.vault.sync();
```

1. Pushes local state (encrypted) to server
2. Pulls latest from server
3. Merges using Last-Write-Wins

## vault.push()

Push local state to server.

```typescript
await store.vault.push();
```

## vault.pull()

Pull latest state from server.

```typescript
const hasChanges = await store.vault.pull();
// Returns true if server had newer data
```

## vault.rehydrate()

Reload state from local storage.

```typescript
await store.vault.rehydrate();
```

## vault.hasHydrated()

Check if initial hydration is complete.

```typescript
if (store.vault.hasHydrated()) {
  // Safe to read store
}
```

## vault.getSyncStatus()

Get current sync status.

```typescript
const status = store.vault.getSyncStatus();
// "idle" | "syncing" | "synced" | "error" | "offline"
```

## vault.hasPendingChanges()

Check if there are unsynced local changes.

```typescript
if (store.vault.hasPendingChanges()) {
  await store.vault.push();
}
```

## vault.clearStorage()

Delete all local and server data for this vault.

```typescript
await store.vault.clearStorage();
```

## vault.onHydrate()

Subscribe to hydration start.

```typescript
const unsubscribe = store.vault.onHydrate((state) => {
  console.log("Hydration starting");
});
```

## vault.onFinishHydration()

Subscribe to hydration complete.

```typescript
const unsubscribe = store.vault.onFinishHydration((state) => {
  console.log("Hydrated:", state);
});
```

## useSyncStatus Hook

React hook for sync status with auto-updates.

```typescript
import { useSyncStatus } from "@ursalock/zustand";

function SyncIndicator() {
  const status = useSyncStatus(store);
  
  return <span>Status: {status}</span>;
}
```

## Types

```typescript
import type {
  VaultOptionsJwk,
  VaultOptionsLegacy,
  SyncStatus,
  VaultStorage,
} from "@ursalock/zustand";

type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

interface VaultOptionsJwk<S, PersistedState = S> {
  name: string;
  cipherJwk: CipherJWK;
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

// For CipherJWK type
import type { CipherJWK } from "@ursalock/crypto";
```

## VaultOptionsLegacy (Deprecated)

For backward compatibility, you can use a recovery key string instead of cipherJwk:

```typescript
import type { VaultOptionsLegacy } from "@ursalock/zustand";

const options: VaultOptionsLegacy<MyState> = {
  name: "my-store",
  recoveryKey: "ABCD-EFGH-...", // 52-char recovery key
  // ... other options
};
```

**Note**: The passkey-based `VaultOptionsJwk` is recommended for new apps.

## createVaultStorage

Create a custom encrypted storage backend.

```typescript
import { createVaultStorage, type JwkEncryptedStorageOptions } from "@ursalock/zustand";

const storage = createVaultStorage({
  cipherJwk,
  prefix: "my-app:",
  storage: sessionStorage, // Use sessionStorage instead of localStorage
});
```

## Error Handling

```typescript
try {
  await store.vault.sync();
} catch (error) {
  if (error.message.includes("vault_already_exists")) {
    // Pull first, then push
    await store.vault.pull();
  } else if (error.message.includes("401")) {
    // Token expired, re-authenticate
    await refreshAuth();
  }
}
```
