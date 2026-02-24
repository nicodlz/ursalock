---
title: Syncing Data
description: How sync works, offline support, and conflict resolution
---

ursalock syncs your encrypted documents between local storage and the server using the DocumentClient API.

## How Sync Works

1. **Local changes** → encrypted → pushed to server as document updates
2. **Server changes** → pulled → decrypted → merged with local state
3. **Conflict resolution** → Optimistic locking with version numbers (409 on conflict)

All data is encrypted client-side before leaving your device. The server only sees encrypted ciphertext.

## Basic Sync Pattern

### Single-Document Sync

For simple apps, store all state in one document:

```typescript
import { DocumentClient } from "@ursalock/client";
import { useStore } from "./store";

let docClient: DocumentClient;
let docUid: string;
let docVersion: number;

export async function initSync(client: DocumentClient) {
  docClient = client;
  const collection = client.collection<AppState>("app-state");
  
  // Pull initial state
  const docs = await collection.list({ limit: 1 });
  
  if (docs[0]) {
    docUid = docs[0].uid;
    docVersion = docs[0].version;
    useStore.setState(docs[0].content);
  } else {
    // Create initial document
    const doc = await collection.create(useStore.getState());
    docUid = doc.uid;
    docVersion = doc.version;
  }
  
  // Push changes (debounced)
  let timeout: NodeJS.Timeout;
  useStore.subscribe((state) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => pushChanges(state), 1000);
  });
}

async function pushChanges(state: AppState) {
  try {
    const collection = docClient.collection<AppState>("app-state");
    const updated = await collection.replace(docUid, state, docVersion);
    docVersion = updated.version;
  } catch (error) {
    if (error.message.includes("409")) {
      // Conflict - re-pull and merge
      await pullChanges();
    }
  }
}

export async function pullChanges() {
  const collection = docClient.collection<AppState>("app-state");
  const doc = await collection.get(docUid);
  
  docVersion = doc.version;
  useStore.setState(doc.content);
}
```

### Multi-Document Sync

For scalable apps, use collections:

```typescript
interface Note {
  id: string;
  title: string;
  content: string;
}

const notes = docClient.collection<Note>("notes");

// Create
const doc = await notes.create({ id: "1", title: "Hello", content: "World" });

// Update
await notes.replace(doc.uid, { id: "1", title: "Updated", content: "!" }, doc.version);

// Sync all
const allNotes = await notes.list();
useStore.setState({ notes: allNotes.map(d => d.content) });
```

## Debounced Sync

Avoid syncing on every keystroke:

```typescript
import { debounce } from "lodash-es";

const debouncedPush = debounce(async (state: AppState) => {
  await pushChanges(state);
}, 2000); // Wait 2s after last change

useStore.subscribe((state) => {
  debouncedPush(state);
});
```

## Conflict Resolution

ursalock uses **optimistic locking** with version numbers:

```typescript
async function pushChanges(state: AppState) {
  try {
    const collection = docClient.collection<AppState>("app-state");
    const updated = await collection.replace(docUid, state, docVersion);
    docVersion = updated.version;
  } catch (error) {
    if (error.message.includes("409")) {
      // Conflict: server has a newer version
      
      // Strategy 1: Server wins (re-pull)
      await pullChanges();
      
      // Strategy 2: Manual merge
      const serverDoc = await collection.get(docUid);
      const merged = mergeStates(state, serverDoc.content);
      const updated = await collection.replace(docUid, merged, serverDoc.version);
      docVersion = updated.version;
    }
  }
}

function mergeStates(local: AppState, server: AppState): AppState {
  // Custom merge logic
  return {
    notes: [...new Map([...server.notes, ...local.notes].map(n => [n.id, n])).values()],
    settings: { ...server.settings, ...local.settings },
  };
}
```

## Offline Support

Queue changes in localStorage when offline:

```typescript
interface SyncQueue {
  pending: Array<{ action: "create" | "update" | "delete"; data: any; uid?: string }>;
}

const queue: SyncQueue = JSON.parse(localStorage.getItem("sync-queue") || '{"pending":[]}');

async function pushChanges(state: AppState) {
  if (!navigator.onLine) {
    // Queue for later
    queue.pending.push({ action: "update", data: state, uid: docUid });
    localStorage.setItem("sync-queue", JSON.stringify(queue));
    return;
  }
  
  // Process queue first
  while (queue.pending.length > 0) {
    const item = queue.pending.shift()!;
    await processQueueItem(item);
  }
  localStorage.setItem("sync-queue", JSON.stringify(queue));
  
  // Then push current change
  const collection = docClient.collection<AppState>("app-state");
  await collection.replace(docUid, state, docVersion);
}

// Sync when back online
window.addEventListener("online", () => {
  pushChanges(useStore.getState());
});
```

## Sync Status Indicator

```tsx
import { useState, useEffect } from "react";

function SyncIndicator() {
  const [status, setStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  
  const handleSync = async () => {
    setStatus("syncing");
    try {
      await pullChanges();
      setStatus("synced");
      setLastSynced(new Date());
      setTimeout(() => setStatus("idle"), 2000);
    } catch (error) {
      setStatus("error");
    }
  };
  
  return (
    <div>
      <button onClick={handleSync}>
        {status === "syncing" ? "⏳ Syncing..." : "🔄 Sync"}
      </button>
      {lastSynced && <span>Last synced: {lastSynced.toLocaleTimeString()}</span>}
    </div>
  );
}
```

## Periodic Sync

Pull changes periodically:

```tsx
useEffect(() => {
  // Pull on app start
  pullChanges();
  
  // Pull every 30s
  const interval = setInterval(pullChanges, 30000);
  
  // Pull when tab becomes visible
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      pullChanges();
    }
  };
  document.addEventListener("visibilitychange", handleVisibility);
  
  return () => {
    clearInterval(interval);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}, []);
```

## Incremental Sync

Only fetch changed documents:

```typescript
let lastSync = Date.now();

async function syncChanges() {
  const collection = docClient.collection<Note>("notes");
  
  // Only fetch documents updated since last sync
  const changed = await collection.list({ since: lastSync });
  
  if (changed.length > 0) {
    // Merge into local state
    const currentNotes = useStore.getState().notes;
    const updatedNotes = new Map(currentNotes.map(n => [n.id, n]));
    
    changed.forEach(doc => {
      if (doc.deletedAt) {
        updatedNotes.delete(doc.content.id);
      } else {
        updatedNotes.set(doc.content.id, doc.content);
      }
    });
    
    useStore.setState({ notes: Array.from(updatedNotes.values()) });
  }
  
  lastSync = Date.now();
}
```

## Push on App Close

Save changes before closing:

```typescript
window.addEventListener("beforeunload", (e) => {
  // Check if there are unsaved changes
  const hasChanges = checkForUnsavedChanges();
  
  if (hasChanges) {
    // Synchronous push (limited browser support)
    navigator.sendBeacon("/api/sync", JSON.stringify(data));
    
    // Or warn user
    e.preventDefault();
    e.returnValue = "You have unsaved changes. Are you sure?";
  }
});
```

## Real-Time Sync (Advanced)

Use Server-Sent Events (SSE) for real-time updates:

```typescript
const evtSource = new EventSource(`https://vault.example.com/vaults/${vaultUid}/events`, {
  headers: vaultClient.getAuthHeader(),
});

evtSource.addEventListener("document-updated", (e) => {
  const { uid, collection } = JSON.parse(e.data);
  
  // Pull the updated document
  if (collection === "app-state") {
    pullChanges();
  }
});
```

## Common Issues

### 409 Conflict Errors

This means another client updated the document. Re-fetch and retry:

```typescript
try {
  await collection.replace(uid, data, version);
} catch (error) {
  if (error.message.includes("409")) {
    const latest = await collection.get(uid);
    const merged = mergeStates(data, latest.content);
    await collection.replace(uid, merged, latest.version);
  }
}
```

### Data Appears Stale

Force a fresh pull:

```typescript
await pullChanges();
```

### Lost Updates

Always use optimistic locking:

```typescript
// ❌ Bad: No version check
await collection.replace(uid, data);

// ✅ Good: Version-aware
await collection.replace(uid, data, currentVersion);
```

## Next Steps

- [Agent Access](/guides/agent-access/) — Let AI agents sync with your encrypted data
- [Migration Guide](/guides/migration/) — Migrate from `persist()` to ursalock
