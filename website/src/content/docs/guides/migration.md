---
title: Migration Guide
description: Migrate from @ursalock/zustand to DocumentClient
---

## Migrating from @ursalock/zustand to DocumentClient

:::danger[Security Issue]
`@ursalock/zustand` had a critical bug that sent **plaintext data** to the server, defeating E2E encryption. You should migrate to `DocumentClient` immediately.
:::

### Why Migrate?

The old `@ursalock/zustand` middleware had a fundamental security flaw in its sync engine. The new architecture using `DocumentClient` ensures:

- ✅ Data is encrypted client-side before leaving your device
- ✅ Server only sees encrypted ciphertext
- ✅ Document-level storage for efficient syncing
- ✅ Proper optimistic locking for conflict resolution

### Architecture Changes

**Old (Deprecated):**
```
Store → vault() middleware → Encrypted blob → Server
```

**New:**
```
Store → DocumentClient → Encrypted documents → Server
Plain Zustand + custom sync logic
```

### Migration Steps

#### 1. Update Dependencies

```bash
# Remove deprecated package
npm uninstall @ursalock/zustand

# Install new packages
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
      syncInterval: 30000,
    }
  )
);

// Sync
await useStore.vault.sync();
```

#### 3. After: New Pattern

**Step 1: Create Plain Zustand Store**

```typescript
import { create } from "zustand";

interface Note {
  id: string;
  title: string;
  content: string;
}

interface NotesState {
  notes: Note[];
  addNote: (note: Note) => void;
}

export const useNotesStore = create<NotesState>((set) => ({
  notes: [],
  addNote: (note) => set((s) => ({ notes: [...s.notes, note] })),
}));
```

**Step 2: Setup Sync Engine**

```typescript
// lib/vault/sync.ts
import { DocumentClient } from "@ursalock/client";
import { useNotesStore } from "../stores/notes";

let docClient: DocumentClient | null = null;
let docUid: string | null = null;
let docVersion: number = 1;

export async function initSync(client: DocumentClient) {
  docClient = client;
  
  // Pull initial state
  const collection = docClient.collection<{ notes: Note[] }>("app-state");
  const docs = await collection.list({ limit: 1 });
  
  if (docs[0]) {
    docUid = docs[0].uid;
    docVersion = docs[0].version;
    useNotesStore.setState(docs[0].content);
  } else {
    const doc = await collection.create({ notes: [] });
    docUid = doc.uid;
    docVersion = doc.version;
  }
  
  // Subscribe to changes and push (debounced)
  let timeout: NodeJS.Timeout;
  useNotesStore.subscribe((state) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => pushChanges(state), 1000);
  });
}

async function pushChanges(state: NotesState) {
  if (!docClient || !docUid) return;
  
  try {
    const collection = docClient.collection<{ notes: Note[] }>("app-state");
    const updated = await collection.replace(docUid, { notes: state.notes }, docVersion);
    docVersion = updated.version;
  } catch (error) {
    if (error.message.includes("409")) {
      // Conflict - re-pull and merge
      await pullChanges();
    }
  }
}

export async function pullChanges() {
  if (!docClient || !docUid) return;
  
  const collection = docClient.collection<{ notes: Note[] }>("app-state");
  const doc = await collection.get(docUid);
  
  docVersion = doc.version;
  useNotesStore.setState(doc.content);
}
```

**Step 3: Initialize in App**

```typescript
import { VaultClient, DocumentClient } from "@ursalock/client";
import { deriveVaultKeys, base64urlToBytes } from "@ursalock/crypto";
import { initSync } from "./lib/vault/sync";

// After authentication
const vaultClient = new VaultClient({ serverUrl: "https://vault.example.com" });
const result = await signIn({ usePasskey: true });

// Get or create vault
const res = await vaultClient.fetch("/vault/by-name/my-notes");
let vaultData;
if (res.status === 404) {
  const createRes = await vaultClient.fetch("/vault", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "my-notes" }),
  });
  vaultData = await createRes.json();
} else {
  vaultData = await res.json();
}

// Derive keys
const masterKey = base64urlToBytes(result.credential.cipherJwk.k);
const keys = await deriveVaultKeys(masterKey, vaultData.uid);

// Create DocumentClient
const docClient = new DocumentClient({
  serverUrl: "https://vault.example.com",
  vaultUid: vaultData.uid,
  encryptionKey: keys.encryptionKey,
  hmacKey: keys.hmacKey,
  getAuthHeader: () => vaultClient.getAuthHeader(),
});

// Initialize sync
await initSync(docClient);
```

### API Mapping

| Old API | New API |
|---------|---------|
| `useStore.vault.sync()` | `await pullChanges(); await pushChanges(state)` |
| `useStore.vault.push()` | `await pushChanges(state)` |
| `useStore.vault.pull()` | `await pullChanges()` |
| `useStore.vault.getSyncStatus()` | Implement custom status tracking |
| `useStore.vault.hasPendingChanges()` | Implement custom queue logic |

### Data Migration

The old vault blob storage is incompatible with the new document storage. You have two options:

#### Option 1: Fresh Start

Users will need to re-authenticate and start with empty state. Old data remains on the server but won't be accessible.

#### Option 2: Manual Migration Script

```typescript
// Run this once to migrate old vault data to new documents
async function migrateVaultData() {
  const vaultClient = new VaultClient({ serverUrl: "..." });
  
  // 1. Get old vault
  const oldVaultRes = await vaultClient.fetch("/vault/by-name/my-notes");
  if (oldVaultRes.status === 404) {
    console.log("No old data to migrate");
    return;
  }
  
  const oldVault = await oldVaultRes.json();
  
  // 2. Decrypt old data (if you have the old encryption logic)
  const decryptedData = await decryptOldVaultData(oldVault.data, oldVault.salt);
  
  // 3. Create new vault (container)
  const newVaultRes = await vaultClient.fetch("/vault", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "my-notes-new" }),
  });
  const newVault = await newVaultRes.json();
  
  // 4. Create DocumentClient
  const keys = await deriveVaultKeys(masterKey, newVault.uid);
  const docClient = new DocumentClient({
    serverUrl: "...",
    vaultUid: newVault.uid,
    encryptionKey: keys.encryptionKey,
    hmacKey: keys.hmacKey,
    getAuthHeader: () => vaultClient.getAuthHeader(),
  });
  
  // 5. Create document with old data
  const collection = docClient.collection("app-state");
  await collection.create(decryptedData);
  
  console.log("Migration complete!");
}
```

### Benefits of New Architecture

- **Security**: No plaintext leakage
- **Scalability**: Document-level storage vs monolithic blobs
- **Efficiency**: Only sync changed documents
- **Flexibility**: Use any state management (not just Zustand)
- **Conflict Resolution**: Proper optimistic locking with versions

### Need Help?

- See [Quick Start](/guides/quick-start/) for full setup guide
- See [Syncing](/guides/syncing/) for sync patterns
- See [Client Reference](/reference/client/) for DocumentClient API

---

## Migrating from persist() to DocumentClient

If you're using Zustand's `persist()` and want to add E2EE:

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

// 1. Create plain store (no middleware)
const useStore = create((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
}));

// 2. Add sync logic with DocumentClient
import { DocumentClient } from "@ursalock/client";

let docClient: DocumentClient;
let docUid: string;
let docVersion: number;

async function initSync(client: DocumentClient) {
  docClient = client;
  const collection = client.collection<CounterState>("app-state");
  
  // Pull
  const docs = await collection.list({ limit: 1 });
  if (docs[0]) {
    docUid = docs[0].uid;
    docVersion = docs[0].version;
    useStore.setState(docs[0].content);
  } else {
    const doc = await collection.create(useStore.getState());
    docUid = doc.uid;
    docVersion = doc.version;
  }
  
  // Push (debounced)
  let timeout: NodeJS.Timeout;
  useStore.subscribe((state) => {
    clearTimeout(timeout);
    timeout = setTimeout(async () => {
      const updated = await collection.replace(docUid, state, docVersion);
      docVersion = updated.version;
    }, 1000);
  });
}
```

Now your data is encrypted and synced across devices!
