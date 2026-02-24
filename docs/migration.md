# Migration Guide

## From Zustand persist() to ursalock

Replace unencrypted `persist()` with ursalock's E2E encrypted document storage.

### Before

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

const useStore = create(persist(
  (set) => ({ notes: [], addNote: (n) => set((s) => ({ notes: [...s.notes, n] })) }),
  { name: "my-store" }
));
```

### After

```typescript
import { create } from "zustand";

const useStore = create((set) => ({
  notes: [],
  addNote: (n) => set((s) => ({ notes: [...s.notes, n] })),
}));

// Sync via DocumentClient after auth
const collection = docClient.collection<AppState>("app-state");

// Pull
const docs = await collection.list({ limit: 1 });
if (docs[0]) useStore.setState(docs[0].content);

// Push (debounced)
useStore.subscribe((state) => debouncedPush(state));
```

### Migrating Existing Data

```typescript
const old = JSON.parse(localStorage.getItem("my-store") ?? "{}");
if (old.state) {
  await collection.create(old.state);
  localStorage.removeItem("my-store");
}
```

See [ursalock.ndlz.net](https://ursalock.ndlz.net) for full documentation.
