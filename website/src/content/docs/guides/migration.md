---
title: Migration from persist()
description: Migrate your Zustand stores from persist() to vault()
---

Migrating from Zustand's `persist()` to ursalock's `vault()` is straightforward.

## Basic Migration

### Before

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

const useStore = create(
  persist(
    (set) => ({
      count: 0,
      increment: () => set((s) => ({ count: s.count + 1 })),
    }),
    { name: "my-store" }
  )
);
```

### After

```typescript
import { create } from "zustand";
import { vault } from "@ursalock/zustand";

const useStore = create(
  vault(
    (set) => ({
      count: 0,
      increment: () => set((s) => ({ count: s.count + 1 })),
    }),
    {
      name: "my-store",
      recoveryKey: "ABCD-EFGH-...",  // Add this
    }
  )
);
```

That's it. Your data is now encrypted at rest.

## Option Mapping

| persist() | vault() | Notes |
|-----------|---------|-------|
| `name` | `name` | Same |
| `storage` | `storage` | Compatible |
| `partialize` | `partialize` | Same |
| `merge` | `merge` | Same |
| `onRehydrateStorage` | `onRehydrateStorage` | Same |
| `skipHydration` | `skipHydration` | Same |
| `version` | - | Server handles versioning |
| `migrate` | - | Handle before vault() |

## New Options

| Option | Description |
|--------|-------------|
| `recoveryKey` | Required. Encryption key. |
| `server` | Optional. Server URL for sync. |
| `getToken` | Required if server set. |
| `syncInterval` | Auto-sync interval (default 30s). |

## API Changes

### Hydration

```typescript
// persist()
useStore.persist.hasHydrated()
useStore.persist.rehydrate()

// vault()
useStore.vault.hasHydrated()
useStore.vault.rehydrate()
```

### New Methods

```typescript
useStore.vault.sync()              // Bidirectional sync
useStore.vault.push()              // Push to server
useStore.vault.pull()              // Pull from server
useStore.vault.getSyncStatus()     // Sync status
useStore.vault.hasPendingChanges() // Offline queue
```

## Migrating Existing Data

When switching, existing unencrypted data won't be readable.

### Option 1: Fresh Start

Just switch. Users start with empty state.

### Option 2: Migration Script

```typescript
// One-time migration
const oldData = localStorage.getItem("my-store");
if (oldData) {
  const parsed = JSON.parse(oldData);
  // Set state in new store
  useStore.setState(parsed.state);
  // Remove old data
  localStorage.removeItem("my-store");
}
```

### Option 3: Parallel Stores

```typescript
// Keep both temporarily
const useLegacy = create(persist(...));
const useStore = create(vault(...));

// Migrate on first load
if (useLegacy.getState().data && !useStore.vault.hasHydrated()) {
  useStore.setState(useLegacy.getState());
  useLegacy.persist.clearStorage();
}
```

## TypeScript

Types work the same:

```typescript
// Before
import type { PersistOptions } from "zustand/middleware";

// After
import type { VaultOptions } from "@ursalock/zustand";
```

## Common Issues

### "Decryption failed" on first load

Expected when switching. Old unencrypted data can't be decrypted. Use migration strategy above.

### SSR Hydration

Same as persist():

```typescript
vault(config, {
  name: "my-store",
  recoveryKey: "...",
  skipHydration: true,
});

// Client-side
useStore.vault.rehydrate();
```
