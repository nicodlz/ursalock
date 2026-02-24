---
title: Quick Start
description: Get up and running with ursalock in 5 minutes
---

This guide walks you through setting up ursalock in a React application with passkey-based E2EE and document storage.

## Installation

```bash
npm install @ursalock/client @ursalock/crypto zustand
```

## How It Works

1. User authenticates with a **passkey** (WebAuthn)
2. The passkey derives a **cipherJwk** using WebAuthn PRF extension
3. Keys are derived for vault-specific encryption
4. Your data is encrypted and stored as **documents** in the vault
5. Changes sync bidirectionally with the server

Same passkey = same encryption key = same data on any device.

## 1. Setup the Auth Client

```typescript
// lib/vault-client.ts
import { VaultClient } from "@ursalock/client";

export const vaultClient = new VaultClient({
  serverUrl: "https://vault.example.com",
});
```

## 2. Key Derivation

```typescript
// lib/vault/keys.ts
import { deriveVaultKeys } from "@ursalock/crypto";
import { base64urlToBytes } from "@ursalock/crypto";
import type { CipherJWK } from "@ursalock/crypto";

export async function deriveKeys(cipherJwk: CipherJWK, vaultUid: string) {
  const masterKey = base64urlToBytes(cipherJwk.k);
  return await deriveVaultKeys(masterKey, vaultUid);
}
```

## 3. Create a Plain Zustand Store

```typescript
// stores/notes.ts
import { create } from "zustand";

interface Note {
  id: string;
  title: string;
  content: string;
}

interface NotesState {
  notes: Note[];
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
}

export const useNotesStore = create<NotesState>((set) => ({
  notes: [],
  addNote: (note) => set((s) => ({ notes: [...s.notes, note] })),
  updateNote: (id, updates) => set((s) => ({
    notes: s.notes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
  })),
  deleteNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
}));
```

## 4. Setup Sync Engine

```typescript
// lib/vault/sync.ts
import { DocumentClient } from "@ursalock/client";
import { useNotesStore } from "../../stores/notes";

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
    // Create initial document
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

## 5. Add Authentication

```tsx
// components/Auth.tsx
import { useState } from "react";
import { useSignUp, useSignIn, type ZKCredential } from "@ursalock/client";
import { vaultClient } from "../lib/vault-client";

interface AuthProps {
  onAuthenticated: (credential: ZKCredential) => void;
}

export function Auth({ onAuthenticated }: AuthProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const { signUp, isLoading: isSigningUp } = useSignUp(vaultClient);
  const { signIn, isLoading: isSigningIn } = useSignIn(vaultClient);

  const handleAuth = async () => {
    const fn = mode === "signup" ? signUp : signIn;
    const result = await fn({ usePasskey: true });
    
    if (result.success && result.credential) {
      onAuthenticated(result.credential);
    }
  };

  return (
    <div>
      <button onClick={handleAuth} disabled={isSigningUp || isSigningIn}>
        {mode === "signup" ? "Create Account" : "Sign In"} with Passkey
      </button>
      <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
        {mode === "signin" ? "Need an account?" : "Already have one?"}
      </button>
    </div>
  );
}
```

## 6. Wire It Up

```tsx
// App.tsx
import { useState, useEffect } from "react";
import type { ZKCredential } from "@ursalock/client";
import { DocumentClient } from "@ursalock/client";
import { Auth } from "./components/Auth";
import { Notes } from "./components/Notes";
import { vaultClient } from "./lib/vault-client";
import { deriveKeys } from "./lib/vault/keys";
import { initSync } from "./lib/vault/sync";

export function App() {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleAuthenticated = async (credential: ZKCredential) => {
    // 1. Get or create vault
    const res = await vaultClient.fetch("/vault/by-name/my-notes-app");
    let vaultData;
    
    if (res.status === 404) {
      const createRes = await vaultClient.fetch("/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "my-notes-app" }),
      });
      vaultData = await createRes.json();
    } else {
      vaultData = await res.json();
    }
    
    // 2. Derive vault keys
    const keys = await deriveKeys(credential.cipherJwk, vaultData.uid);
    
    // 3. Create DocumentClient
    const docClient = new DocumentClient({
      serverUrl: "https://vault.example.com",
      vaultUid: vaultData.uid,
      encryptionKey: keys.encryptionKey,
      hmacKey: keys.hmacKey,
      getAuthHeader: () => vaultClient.getAuthHeader(),
    });
    
    // 4. Initialize sync
    await initSync(docClient);
    
    setIsAuthenticated(true);
    setIsReady(true);
  };

  if (!isReady) {
    return <Auth onAuthenticated={handleAuthenticated} />;
  }

  return <Notes />;
}
```

## 7. Use the Store

```tsx
// components/Notes.tsx
import { useState } from "react";
import { useNotesStore } from "../stores/notes";

export function Notes() {
  const notes = useNotesStore((s) => s.notes);
  const addNote = useNotesStore((s) => s.addNote);
  const [input, setInput] = useState("");

  const handleAdd = () => {
    addNote({
      id: crypto.randomUUID(),
      title: input,
      content: "",
    });
    setInput("");
  };

  return (
    <div>
      <ul>
        {notes.map((note) => (
          <li key={note.id}>{note.title}</li>
        ))}
      </ul>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={handleAdd}>Add Note</button>
    </div>
  );
}
```

## Key Concepts

### Passkey = Master Key

The `cipherJwk` is derived from your passkey using the WebAuthn PRF extension. This means:
- **No recovery key to store** — your passkey IS the key
- **Same passkey = same data** — works across devices with synced passkeys
- **Zero-knowledge** — server never sees your plaintext data

### Vault-Specific Encryption

Keys are derived per-vault using HKDF:
```typescript
const keys = await deriveVaultKeys(masterKey, vaultUid);
// Each vault has unique encryption and HMAC keys
```

### Re-authentication on Refresh

After a page refresh, the `cipherJwk` is lost (it lives only in memory for security). The user must re-authenticate with their passkey to derive the keys again.

```tsx
// Detect if we need to re-auth
const jwt = vaultClient.getToken(); // JWT persists in localStorage
const hasCipherKey = Boolean(cipherJwk); // But cipherJwk doesn't

if (jwt && !hasCipherKey) {
  // Valid session but no key = need to re-auth with passkey
  showAuthScreen();
}
```

### Document-Level Storage

The architecture uses individual encrypted documents:
- Each document is independently encrypted
- Collections group related documents
- Optimistic locking prevents conflicts (version field)
- Efficient syncing (only changed documents)

### Single vs Multi-Document Patterns

**Single Document (simple apps):**
```typescript
// Store entire state in one document
const collection = docClient.collection<AppState>("app-state");
await collection.replace(docUid, store.getState(), version);
```

**Multi-Document (scalable apps):**
```typescript
// Each note is a separate document
const notes = docClient.collection<Note>("notes");
await notes.create({ title: "...", content: "..." });
```

## Next Steps

- [Syncing](/guides/syncing/) — Conflict resolution, offline support
- [Client Reference](/reference/client/) — Full DocumentClient API
- [Self-Hosting](/guides/self-hosting/) — Deploy your own server
