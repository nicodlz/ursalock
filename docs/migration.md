# Migration Guide

## ⚠️ Critical: Migrating from @ursalock/zustand

**`@ursalock/zustand` is deprecated due to a critical security bug that sent plaintext data to the server.**

You must migrate to `DocumentClient` immediately.

### What Went Wrong

The old `@ursalock/zustand` middleware had a flaw in its sync engine that transmitted unencrypted data to the server, completely defeating the purpose of end-to-end encryption.

### New Architecture

**Old (Broken):**
```
Store → vault() middleware → ❌ PLAINTEXT → Server
```

**New (Secure):**
```
Store → DocumentClient → ✅ ENCRYPTED → Server
```

### Migration Steps

#### 1. Update Dependencies

```bash
npm uninstall @ursalock/zustand
npm install @ursalock/client @ursalock/crypto
```

#### 2. Before: Old Pattern

```typescript
import { create } from "zustand";
import { vault } from "@ursalock/zustand";

const useStore = create(
  vault(
    (set) => ({
      notes: [],
      addNote: (note) => set((s) => ({ notes: [...s.notes, note] })),
    }),
    {
      name: "my-notes",
      cipherJwk,
      server: "https://vault.example.com",
      getToken: () => client.getToken(),
    }
  )
);

// Sync
await useStore.vault.sync();
```

#### 3. After: New Pattern

**Create Plain Store:**

```typescript
import { create } from "zustand";

interface NotesState {
  notes: string[];
  addNote: (note: string) => void;
}

export const useNotesStore = create<NotesState>((set) => ({
  notes: [],
  addNote: (note) => set((s) => ({ notes: [...s.notes, note] })),
}));
```

**Setup Sync:**

```typescript
import { DocumentClient } from "@ursalock/client";
import { useNotesStore } from "./store";

let docClient: DocumentClient;
let docUid: string;
let docVersion: number;

export async function initSync(client: DocumentClient) {
  docClient = client;
  const collection = client.collection<NotesState>("app-state");
  
  // Pull initial state
  const docs = await collection.list({ limit: 1 });
  if (docs[0]) {
    docUid = docs[0].uid;
    docVersion = docs[0].version;
    useNotesStore.setState(docs[0].content);
  } else {
    const doc = await collection.create(useNotesStore.getState());
    docUid = doc.uid;
    docVersion = doc.version;
  }
  
  // Push changes (debounced)
  let timeout: NodeJS.Timeout;
  useNotesStore.subscribe((state) => {
    clearTimeout(timeout);
    timeout = setTimeout(async () => {
      try {
        const updated = await collection.replace(docUid, state, docVersion);
        docVersion = updated.version;
      } catch (error) {
        if (error.message.includes("409")) {
          // Conflict - re-pull
          const doc = await collection.get(docUid);
          docVersion = doc.version;
          useNotesStore.setState(doc.content);
        }
      }
    }, 1000);
  });
}
```

**Initialize:**

```typescript
import { VaultClient, DocumentClient } from "@ursalock/client";
import { deriveVaultKeys, base64urlToBytes } from "@ursalock/crypto";

const vaultClient = new VaultClient({ serverUrl: "https://vault.example.com" });
const result = await signIn({ usePasskey: true });

// Get vault
const res = await vaultClient.fetch("/vault/by-name/my-notes");
const vault = await res.json();

// Derive keys
const masterKey = base64urlToBytes(result.credential.cipherJwk.k);
const keys = await deriveVaultKeys(masterKey, vault.uid);

// Create DocumentClient
const docClient = new DocumentClient({
  serverUrl: "https://vault.example.com",
  vaultUid: vault.uid,
  encryptionKey: keys.encryptionKey,
  hmacKey: keys.hmacKey,
  getAuthHeader: () => vaultClient.getAuthHeader(),
});

await initSync(docClient);
```

### API Mapping

| Old | New |
|-----|-----|
| `useStore.vault.sync()` | `await pullChanges(); await pushChanges()` |
| `useStore.vault.push()` | `await pushChanges(state)` |
| `useStore.vault.pull()` | `await pullChanges()` |
| `useStore.vault.getSyncStatus()` | Custom status tracking |

### Data Migration

Old vault data is incompatible with the new document API. You have two options:

1. **Fresh start** - Users re-authenticate and start fresh
2. **Manual migration** - Write a script to decrypt old data and re-encrypt as documents

For most apps, a fresh start is recommended (old data was potentially leaked anyway).

---

## Migrating from persist()

If you're using Zustand's `persist()` and want to add E2EE with ursalock:

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

// 1. Plain store
const useStore = create((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
}));

// 2. Sync with DocumentClient
import { DocumentClient } from "@ursalock/client";

async function initSync(docClient: DocumentClient) {
  const collection = docClient.collection<CounterState>("app-state");
  
  const docs = await collection.list({ limit: 1 });
  if (docs[0]) {
    useStore.setState(docs[0].content);
    
    // Subscribe to changes
    let timeout: NodeJS.Timeout;
    useStore.subscribe((state) => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        await collection.replace(docs[0].uid, state, docs[0].version);
      }, 1000);
    });
  }
}
```

See the [Quick Start](/guides/quick-start/) guide for full setup.
