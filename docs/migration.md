# Migration from persist()

Migrating from Zustand's `persist()` middleware to ursalock's `vault()` is straightforward.

## Basic Migration

### Before (persist)

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

const useStore = create(
  persist(
    (set) => ({
      count: 0,
      increment: () => set((s) => ({ count: s.count + 1 })),
    }),
    {
      name: "my-store",
    }
  )
);
```

### After (vault)

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
| `storage` | `storage` | Compatible interface |
| `partialize` | `partialize` | Same |
| `merge` | `merge` | Same |
| `onRehydrateStorage` | `onRehydrateStorage` | Same |
| `skipHydration` | `skipHydration` | Same |
| `version` | - | Not needed (server handles versioning) |
| `migrate` | - | Handle manually before vault() |

## New Options

vault() adds these options:

| Option | Description |
|--------|-------------|
| `recoveryKey` | Required. Encryption key. |
| `server` | Optional. Server URL for cloud sync. |
| `getToken` | Required if server set. Auth token getter. |
| `syncInterval` | Auto-sync interval (default 30s). |

## API Differences

### Hydration

```typescript
// persist()
useStore.persist.hasHydrated()
useStore.persist.onHydrate(cb)
useStore.persist.onFinishHydration(cb)
useStore.persist.rehydrate()

// vault()
useStore.vault.hasHydrated()
useStore.vault.onHydrate(cb)
useStore.vault.onFinishHydration(cb)
useStore.vault.rehydrate()
```

### Storage

```typescript
// persist()
useStore.persist.clearStorage()
useStore.persist.getOptions()
useStore.persist.setOptions(opts)

// vault()
useStore.vault.clearStorage()
// No setOptions (immutable after creation)
```

### New Methods (vault only)

```typescript
useStore.vault.sync()             // Bidirectional sync
useStore.vault.push()             // Push to server
useStore.vault.pull()             // Pull from server
useStore.vault.getSyncStatus()    // "idle" | "syncing" | ...
useStore.vault.hasPendingChanges() // Offline queue status
```

## Migrating Existing Data

When you switch from persist() to vault(), existing unencrypted data in localStorage won't be readable (different format).

### Option 1: Fresh Start

Just switch. Users start with empty state. Good for non-critical data.

### Option 2: Manual Migration

```typescript
// One-time migration script
const oldData = localStorage.getItem("my-store");
if (oldData) {
  const parsed = JSON.parse(oldData);
  // Use vault's API to save with encryption
  // Then remove old data
  localStorage.removeItem("my-store");
}
```

### Option 3: Parallel Run

Keep both for a transition period:

```typescript
const useLegacyStore = create(
  persist((set) => ({ ... }), { name: "my-store-legacy" })
);

const useStore = create(
  vault((set) => ({ ... }), { name: "my-store", recoveryKey: "..." })
);

// On app init, migrate if needed
if (useLegacyStore.getState().count && !useStore.vault.hasHydrated()) {
  useStore.setState(useLegacyStore.getState());
  useLegacyStore.persist.clearStorage();
}
```

## TypeScript

Types work the same way. Just import from the new package:

```typescript
// Before
import type { PersistOptions } from "zustand/middleware";

// After
import type { VaultOptions } from "@ursalock/zustand";
```

## Testing

vault() works the same as persist() in tests. Mock localStorage as usual:

```typescript
// vitest/jest
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
global.localStorage = localStorageMock;
```

## Common Issues

### "Decryption failed" on first load

Expected when switching from persist(). Old unencrypted data can't be decrypted. Clear localStorage or use migration strategy above.

### State not syncing

Check:
1. `server` option is set
2. `getToken()` returns a valid token
3. User is authenticated
4. Network connectivity

### Hydration timing

Same as persist() - use `skipHydration` for SSR:

```typescript
const useStore = create(
  vault(
    (set) => ({ ... }),
    {
      name: "my-store",
      recoveryKey: "...",
      skipHydration: true,  // Don't hydrate on server
    }
  )
);

// In useEffect on client
useStore.vault.rehydrate();
```
