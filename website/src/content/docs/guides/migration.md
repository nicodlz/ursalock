---
title: Migration Guide
description: Migrate from zustand persist() to ursalock encrypted storage
---

This guide covers migrating from Zustand's built-in `persist()` middleware to ursalock's encrypted document storage.

## From persist() to DocumentClient

### Before (unencrypted)

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

const useStore = create(
  persist(
    (set) => ({
      notes: [],
      addNote: (note) => set((s) => ({ notes: [...s.notes, note] })),
    }),
    { name: "my-store" }
  )
);
```

### After (E2E encrypted)

```typescript
import { create } from "zustand";

// 1. Plain zustand store (no middleware)
const useStore = create((set) => ({
  notes: [],
  addNote: (note) => set((s) => ({ notes: [...s.notes, note] })),
}));

// 2. Sync via DocumentClient (after auth)
const collection = docClient.collection<AppState>("app-state");

// Pull on init
const docs = await collection.list({ limit: 1 });
if (docs[0]) useStore.setState(docs[0].content);

// Push on change (debounced)
useStore.subscribe((state) => {
  debouncedPush(state);
});
```

### Key Differences

| persist() | ursalock DocumentClient |
|-----------|------------------------|
| localStorage (plaintext) | Encrypted localStorage + server sync |
| Automatic via middleware | Explicit sync engine (pull/push) |
| No auth needed | Passkey authentication |
| Single device | Cross-device via server |
| No integrity checks | HMAC-SHA256 verification |

## Data Migration

If you have existing data in `persist()` localStorage:

```typescript
// Read old data
const oldData = JSON.parse(localStorage.getItem("my-store") ?? "{}");

// Write to encrypted vault
if (oldData.state) {
  await collection.create(oldData.state);
  localStorage.removeItem("my-store"); // Clean up
}
```

## Next Steps

- [Quick Start](/guides/quick-start/) — Full setup guide
- [Syncing Data](/guides/syncing/) — Sync patterns and conflict resolution
- [Agent Access](/guides/agent-access/) — Let AI agents access your encrypted data
