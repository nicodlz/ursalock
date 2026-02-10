---
title: Quick Start
description: Get up and running with ursalock in 5 minutes
---

This guide walks you through setting up ursalock in a React application with passkey-based E2EE.

## Installation

```bash
npm install @ursalock/zustand @ursalock/client @ursalock/crypto
```

## How It Works

1. User authenticates with a **passkey** (WebAuthn)
2. The passkey derives a **cipherJwk** using WebAuthn PRF extension
3. Your Zustand store is **encrypted** with this key
4. Data syncs to the server (encrypted) and across devices

Same passkey = same encryption key = same data on any device.

## 1. Setup the Auth Client

```typescript
// lib/vault-client.ts
import { VaultClient } from "@ursalock/client";

export const vaultClient = new VaultClient({
  serverUrl: "https://vault.example.com",
});
```

## 2. Create an Encrypted Store

```typescript
// stores/notes.ts
import { create, type StateCreator } from "zustand";
import { vault, type VaultOptionsJwk } from "@ursalock/zustand";
import type { CipherJWK } from "@ursalock/crypto";
import { vaultClient } from "../lib/vault-client";

interface NotesState {
  notes: string[];
  addNote: (note: string) => void;
}

// Store factory - needs cipherJwk from authentication
export function createNotesStore(cipherJwk: CipherJWK) {
  const storeCreator: StateCreator<NotesState> = (set) => ({
    notes: [],
    addNote: (note) => set((s) => ({ notes: [...s.notes, note] })),
  });

  const options: VaultOptionsJwk<NotesState> = {
    name: "my-notes",
    cipherJwk,
    server: "https://vault.example.com",
    getToken: () => {
      const header = vaultClient.getAuthHeader();
      return header["Authorization"]?.replace("Bearer ", "") ?? null;
    },
    syncInterval: 30000, // Auto-sync every 30s
  };

  return create(vault(storeCreator, options));
}

// Store instance - initialized after auth
let notesStore: ReturnType<typeof createNotesStore> | null = null;

export function initNotesStore(cipherJwk: CipherJWK) {
  notesStore = createNotesStore(cipherJwk);
  return notesStore;
}

export function useNotes<T>(selector: (state: NotesState) => T): T {
  if (!notesStore) throw new Error("Store not initialized");
  return notesStore(selector);
}
```

## 3. Add Authentication

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

## 4. Wire It Up

```tsx
// App.tsx
import { useState } from "react";
import type { ZKCredential } from "@ursalock/client";
import { Auth } from "./components/Auth";
import { Notes } from "./components/Notes";
import { initNotesStore } from "./stores/notes";

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleAuthenticated = (credential: ZKCredential) => {
    // Initialize the encrypted store with the derived key
    initNotesStore(credential.cipherJwk);
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return <Auth onAuthenticated={handleAuthenticated} />;
  }

  return <Notes />;
}
```

## 5. Use the Store

```tsx
// components/Notes.tsx
import { useState } from "react";
import { useNotes } from "../stores/notes";

export function Notes() {
  const notes = useNotes((s) => s.notes);
  const addNote = useNotes((s) => s.addNote);
  const [input, setInput] = useState("");

  return (
    <div>
      <ul>
        {notes.map((note, i) => (
          <li key={i}>{note}</li>
        ))}
      </ul>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={() => { addNote(input); setInput(""); }}>Add</button>
    </div>
  );
}
```

## Key Concepts

### Passkey = Encryption Key

The `cipherJwk` is derived from your passkey using the WebAuthn PRF extension. This means:
- **No recovery key to store** — your passkey IS the key
- **Same passkey = same data** — works across devices with synced passkeys
- **Zero-knowledge** — server never sees your plaintext data

### Re-authentication on Refresh

After a page refresh, the `cipherJwk` is lost (it lives only in memory for security). The user must re-authenticate with their passkey to derive the key again.

```tsx
// Detect if we need to re-auth
const jwt = vaultClient.getToken(); // JWT persists in localStorage
const hasCipherKey = Boolean(cipherJwk); // But cipherJwk doesn't

if (jwt && !hasCipherKey) {
  // Valid session but no key = need to re-auth with passkey
  showAuthScreen();
}
```

### Sync Status

```typescript
// Check sync status
const status = useStore.vault.getSyncStatus();
// "idle" | "syncing" | "synced" | "error" | "offline"

// Manual sync
await useStore.vault.sync();
```

## Local-Only Mode

Don't need cloud sync? Skip the server config:

```typescript
const options: VaultOptionsJwk<NotesState> = {
  name: "my-notes",
  cipherJwk,
  // No server = encrypted localStorage only
};
```

## Next Steps

- [Authentication](/guides/authentication/) — Passkey flows, hooks, error handling
- [Syncing](/guides/syncing/) — Conflict resolution, offline support
- [Self-Hosting](/guides/self-hosting/) — Deploy your own server
