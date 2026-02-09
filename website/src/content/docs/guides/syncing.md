---
title: Syncing Data
description: How sync works, offline support, and conflict resolution
---

zod-vault syncs your encrypted data between local storage and the server.

## How Sync Works

1. **Local changes** → encrypted → pushed to server
2. **Server changes** → pulled → decrypted → merged with local
3. **Conflict resolution** → Last-Write-Wins (LWW) by timestamp

All data is encrypted client-side before leaving your device.

## Sync Methods

### Full Sync

```typescript
await useStore.vault.sync();
```

Pushes local changes, pulls remote changes, merges using LWW.

### Push Only

```typescript
await useStore.vault.push();
```

Send local state to server without pulling.

### Pull Only

```typescript
const hasChanges = await useStore.vault.pull();
// Returns true if server had newer data
```

Get latest from server without pushing.

## Auto-Sync

By default, vault syncs every 30 seconds:

```typescript
vault(storeCreator, {
  name: "my-store",
  cipherJwk,
  server: "https://vault.example.com",
  getToken: () => token,
  syncInterval: 30000,  // 30 seconds (default)
});
```

Disable auto-sync:

```typescript
vault(storeCreator, {
  // ...
  syncInterval: 0,  // Manual sync only
});
```

## Sync Status

```typescript
const status = useStore.vault.getSyncStatus();
// "idle" | "syncing" | "synced" | "error" | "offline"
```

### Status Hook

```tsx
import { useSyncStatus } from "@zod-vault/zustand";

function SyncIndicator({ store }) {
  const status = useSyncStatus(store);
  
  return (
    <span>
      {status === "syncing" && "⏳ Syncing..."}
      {status === "synced" && "✅ Synced"}
      {status === "error" && "❌ Sync failed"}
      {status === "offline" && "📴 Offline"}
      {status === "idle" && "⏸️ Idle"}
    </span>
  );
}
```

### Custom Sync Status Component

```tsx
function SyncStatus() {
  const [status, setStatus] = useState("idle");
  
  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(useStore.vault.getSyncStatus());
    }, 5000); // Poll every 5s
    
    return () => clearInterval(interval);
  }, []);
  
  const handleManualSync = async () => {
    await useStore.vault.sync();
  };
  
  return (
    <button onClick={handleManualSync}>
      {status === "syncing" ? "Syncing..." : "Sync Now"}
    </button>
  );
}
```

## Conflict Resolution

zod-vault uses **Last-Write-Wins (LWW)**:

```
Device A: saves { count: 5 } at 10:00:00
Device B: saves { count: 8 } at 10:00:05

After sync: { count: 8 } wins (newer timestamp)
```

### Partialize for Granular Sync

Control which fields are synced:

```typescript
vault(storeCreator, {
  name: "my-store",
  cipherJwk,
  server: "https://...",
  getToken: () => token,
  partialize: (state) => ({
    // Sync these fields
    notes: state.notes,
    settings: state.settings,
    // Don't sync UI state
    // currentNoteId: state.currentNoteId, // excluded
  }),
});
```

## Offline Support

When offline:
1. Changes save to encrypted localStorage
2. `getSyncStatus()` returns `"offline"`
3. When back online, call `sync()` to push pending changes

```typescript
// Check for pending changes
const pending = useStore.vault.hasPendingChanges();

// Sync when back online
window.addEventListener("online", () => {
  useStore.vault.sync();
});
```

## Sync on App Lifecycle

Recommended pattern for robust sync:

```tsx
useEffect(() => {
  // Sync on app start
  useStore.vault.sync();
  
  // Sync when tab becomes visible
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      useStore.vault.sync();
    }
  };
  document.addEventListener("visibilitychange", handleVisibility);
  
  // Sync before close
  const handleUnload = () => {
    if (useStore.vault.hasPendingChanges()) {
      useStore.vault.push();
    }
  };
  window.addEventListener("beforeunload", handleUnload);
  
  return () => {
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("beforeunload", handleUnload);
  };
}, []);
```

## Debounced Sync

For frequently changing data (like a text editor), debounce syncs:

```typescript
import { useMemo } from "react";
import { debounce } from "lodash-es";

function Editor() {
  const updateNote = useStore((s) => s.updateNote);
  
  // Debounce sync after edits
  const debouncedSync = useMemo(
    () => debounce(() => useStore.vault.sync(), 3000),
    []
  );
  
  const handleChange = (content: string) => {
    updateNote(noteId, { content });
    debouncedSync();
  };
  
  return <textarea onChange={(e) => handleChange(e.target.value)} />;
}
```

## Server Configuration

The server stores encrypted blobs per user:

```
POST /api/vault/:name/push
  Body: { encrypted: "...", updatedAt: 1234567890 }
  
GET /api/vault/:name/pull
  Response: { encrypted: "...", updatedAt: 1234567890 }
```

See [Self-Hosting](/guides/self-hosting/) for server setup.

## Debugging

Enable debug logging:

```typescript
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

## Common Issues

### "vault_already_exists" Error

This happens when creating a new vault but one already exists on the server. The client should pull first:

```typescript
// On initial load, try pull before push
await useStore.vault.pull();
```

### Sync Not Working Across Devices

1. Check passkey provider syncs credentials (iCloud, Google, Proton Pass)
2. Verify same `opaqueId` on both devices (derived from passkey rawId)
3. Check server URL is the same
4. Verify JWT is valid

### Data Appears Stale

```typescript
// Force a fresh pull from server
await useStore.vault.pull();
```
