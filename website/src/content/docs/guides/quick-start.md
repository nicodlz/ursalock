---
title: Quick Start
description: Get up and running with zod-vault in 5 minutes
---

This guide walks you through setting up zod-vault in a React application.

## Installation

```bash
npm install @zod-vault/zustand @zod-vault/client @zod-vault/crypto
```

## 1. Generate a Recovery Key

```typescript
import { generateRecoveryKey } from "@zod-vault/crypto";

const recoveryKey = generateRecoveryKey();
console.log(recoveryKey);
// => "ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-Q"
```

Store this key safely. It's the only way to decrypt your data.

## 2. Setup the Auth Client

```typescript
// lib/vault.ts
import { VaultClient } from "@zod-vault/client";

export const vaultClient = new VaultClient({
  serverUrl: "https://vault.example.com",
});
```

## 3. Create an Encrypted Store

```typescript
// stores/notes.ts
import { create } from "zustand";
import { vault } from "@zod-vault/zustand";
import { vaultClient } from "../lib/vault";

interface NotesState {
  notes: string[];
  addNote: (note: string) => void;
  removeNote: (index: number) => void;
}

export const useNotes = create(
  vault<NotesState>(
    (set) => ({
      notes: [],
      addNote: (note) => set((s) => ({ notes: [...s.notes, note] })),
      removeNote: (index) =>
        set((s) => ({ notes: s.notes.filter((_, i) => i !== index) })),
    }),
    {
      name: "notes",
      recoveryKey: process.env.NEXT_PUBLIC_RECOVERY_KEY!,
      server: "https://vault.example.com",
      getToken: () => vaultClient.getToken(),
    }
  )
);
```

## 4. Add Authentication

```typescript
// components/AuthGate.tsx
import { useState } from "react";
import { useVaultAuth } from "@zod-vault/client";
import { vaultClient } from "../lib/vault";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useVaultAuth(vaultClient);

  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return <LoginForm />;
  return <>{children}</>;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useVaultAuth(vaultClient);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button type="submit">Login</button>
    </form>
  );
}
```

## 5. Use the Store

```typescript
// components/Notes.tsx
import { useState } from "react";
import { useNotes } from "../stores/notes";

export function Notes() {
  const { notes, addNote, removeNote } = useNotes();
  const [input, setInput] = useState("");

  return (
    <div>
      <ul>
        {notes.map((note, i) => (
          <li key={i}>
            {note}
            <button onClick={() => removeNote(i)}>Delete</button>
          </li>
        ))}
      </ul>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="New note"
      />
      <button onClick={() => { addNote(input); setInput(""); }}>
        Add
      </button>
    </div>
  );
}
```

## 6. Sync Across Devices

The store auto-syncs every 30 seconds. For manual control:

```typescript
// Full sync (push + pull)
await useNotes.vault.sync();

// Or granular
await useNotes.vault.push();  // Local → Server
await useNotes.vault.pull();  // Server → Local

// Check status
useNotes.vault.getSyncStatus();
// => "idle" | "syncing" | "synced" | "error" | "offline"
```

## Local-Only Mode

Don't need cloud sync? Skip the server:

```typescript
const useNotes = create(
  vault<NotesState>(
    (set) => ({ ... }),
    {
      name: "notes",
      recoveryKey: "your-recovery-key",
      // No server = encrypted localStorage only
    }
  )
);
```

## Next Steps

- [Authentication](/guides/authentication/) - Passkeys, email auth, React hooks
- [Syncing Data](/guides/syncing/) - Conflict resolution, offline queue
- [Self-Hosting](/guides/self-hosting/) - Deploy your own server
