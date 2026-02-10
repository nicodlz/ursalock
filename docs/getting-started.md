# Getting Started

This guide walks you through setting up ursalock in a React application.

## Prerequisites

- Node.js 18+
- A Zustand store you want to encrypt
- A ursalock server (see [Self-Hosting](./self-hosting.md)) or use local-only mode

## Installation

```bash
npm install @ursalock/zustand @ursalock/client @ursalock/crypto
```

## Step 1: Generate a Recovery Key

The recovery key is the master encryption key for your data. Generate it once and store it safely.

```typescript
import { generateRecoveryKey } from "@ursalock/crypto";

const recoveryKey = generateRecoveryKey();
console.log(recoveryKey);
// => "ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-Q"
```

Store this key in a password manager or print it as a backup. If you lose it, your data cannot be recovered.

## Step 2: Setup the Auth Client

```typescript
// lib/vault.ts
import { VaultClient } from "@ursalock/client";

export const vaultClient = new VaultClient({
  serverUrl: "https://vault.example.com",
});
```

## Step 3: Create an Encrypted Store

```typescript
// stores/notes.ts
import { create } from "zustand";
import { vault } from "@ursalock/zustand";
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

## Step 4: Add Authentication

```typescript
// components/AuthGate.tsx
import { useVaultAuth } from "@ursalock/client";
import { vaultClient } from "../lib/vault";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, login } = useVaultAuth(vaultClient);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <LoginForm onSubmit={login} />;
  }

  return <>{children}</>;
}

function LoginForm({ onSubmit }: { onSubmit: (email: string, password: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(email, password); }}>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit">Login</button>
    </form>
  );
}
```

## Step 5: Use the Store

```typescript
// components/Notes.tsx
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
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={() => { addNote(input); setInput(""); }}>Add</button>
    </div>
  );
}
```

## Step 6: Sync Across Devices

The store syncs automatically every 30 seconds. For manual control:

```typescript
import { useNotes } from "../stores/notes";

function SyncButton() {
  const vault = useNotes.vault;

  const handleSync = async () => {
    await vault.sync();
  };

  return (
    <button onClick={handleSync}>
      Sync Now ({vault.getSyncStatus()})
    </button>
  );
}
```

## Local-Only Mode

Don't need cloud sync? Skip the server config:

```typescript
const useNotes = create(
  vault<NotesState>(
    (set) => ({
      notes: [],
      addNote: (note) => set((s) => ({ notes: [...s.notes, note] })),
    }),
    {
      name: "notes",
      recoveryKey: "your-recovery-key",
      // No server = local encrypted storage only
    }
  )
);
```

Data is encrypted and stored in localStorage.

## Next Steps

- [API Reference](./api.md) - Full API documentation
- [Self-Hosting](./self-hosting.md) - Deploy your own server
- [Migration](./migration.md) - Migrate from `persist()`
- [Security](./security.md) - Security model details
