<p align="center">
  <h1 align="center">zod-vault</h1>
  <p align="center">
    End-to-end encrypted cloud sync for Zustand stores
    <br/>
    Zero-knowledge. Self-hostable. Drop-in replacement for persist().
  </p>
</p>

<p align="center">
  <a href="https://zod-vault.ndlz.net"><img src="https://img.shields.io/badge/docs-zod--vault.ndlz.net-blue.svg" alt="Documentation" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" /></a>
  <a href="https://www.npmjs.com/package/@zod-vault/zustand"><img src="https://img.shields.io/npm/v/@zod-vault/zustand.svg" alt="npm" /></a>
  <a href="https://bundlephobia.com/package/@zod-vault/zustand"><img src="https://img.shields.io/bundlephobia/minzip/@zod-vault/zustand" alt="Bundle Size" /></a>
</p>

<br/>

```typescript
import { create } from "zustand";
import { vault } from "@zod-vault/zustand";
import { VaultClient } from "@zod-vault/client";

// Setup client
const client = new VaultClient({ serverUrl: "https://vault.example.com" });

// Create encrypted store
const useStore = create(
  vault(
    (set) => ({
      notes: [] as string[],
      addNote: (note: string) => set((s) => ({ notes: [...s.notes, note] })),
    }),
    {
      name: "my-notes",
      recoveryKey: "ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567",
      server: "https://vault.example.com",
      getToken: () => client.getToken(),
    }
  )
);

// Sync across devices
await useStore.vault.sync();
```

## What is zod-vault?

zod-vault adds encrypted cloud sync to Zustand stores. Your data is encrypted client-side before it ever leaves the browser — the server only stores opaque blobs. You control the encryption key.

## Features

- **Drop-in replacement** — Swap `persist()` for `vault()`, keep your existing store logic
- **End-to-end encrypted** — AES-256-GCM encryption, Argon2id key derivation
- **Zero-knowledge** — Server never sees plaintext data
- **Recovery key** — 256-bit key you control, not tied to any account
- **Passkey auth** — WebAuthn support with email fallback
- **Offline-first** — Queue changes when offline, sync when back online
- **Self-hostable** — Single Docker image, SQLite storage, no external deps
- **Lightweight** — ~12KB core middleware (gzipped)

## Installation

```bash
npm install @zod-vault/zustand @zod-vault/client @zod-vault/crypto
```

## Packages

| Package | Description | Size |
|---------|-------------|------|
| [@zod-vault/crypto](./packages/crypto) | Encryption primitives (Argon2id, AES-256-GCM) | ~15KB |
| [@zod-vault/zustand](./packages/zustand) | Zustand middleware | ~12KB |
| [@zod-vault/client](./packages/client) | Auth client + React hooks | ~20KB |
| [@zod-vault/server](./packages/server) | Self-hosted backend (Hono + SQLite) | - |

## Quick Start

### 1. Generate a recovery key

```typescript
import { generateRecoveryKey } from "@zod-vault/crypto";

const recoveryKey = generateRecoveryKey();
// => "ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-Q"

// Store this safely — it's the only way to decrypt your data
```

### 2. Setup auth client

```typescript
import { VaultClient } from "@zod-vault/client";

const client = new VaultClient({
  serverUrl: "https://vault.example.com",
});

// Register with email
await client.registerEmail("user@example.com", "password");

// Or login
await client.loginEmail("user@example.com", "password");
```

### 3. Create an encrypted store

```typescript
import { create } from "zustand";
import { vault } from "@zod-vault/zustand";

interface NotesState {
  notes: string[];
  addNote: (note: string) => void;
}

const useNotes = create(
  vault<NotesState>(
    (set) => ({
      notes: [],
      addNote: (note) => set((s) => ({ notes: [...s.notes, note] })),
    }),
    {
      name: "notes",
      recoveryKey: recoveryKey,
      server: "https://vault.example.com",
      getToken: () => client.getToken(),
    }
  )
);
```

### 4. Sync across devices

```typescript
// Full sync (push local changes, pull remote changes)
await useNotes.vault.sync();

// Or granular control
await useNotes.vault.push();  // Push local → server
await useNotes.vault.pull();  // Pull server → local

// Check sync status
useNotes.vault.getSyncStatus();  // "idle" | "syncing" | "synced" | "error" | "offline"
useNotes.vault.hasPendingChanges();  // true if offline queue has items
```

### React hooks

```typescript
import { useVaultAuth, useVaultSync } from "@zod-vault/client";

function App() {
  const { isAuthenticated, user, login, logout } = useVaultAuth(client);
  const { status, sync, hasPending } = useVaultSync(useNotes);

  if (!isAuthenticated) {
    return <LoginForm onSubmit={login} />;
  }

  return (
    <div>
      <p>Logged in as {user.email}</p>
      <p>Sync status: {status}</p>
      <button onClick={sync}>Sync now</button>
    </div>
  );
}
```

## Self-Hosting

### Docker

```bash
docker run -d \
  -p 3000:3000 \
  -e JWT_SECRET="your-secret-key" \
  -v vault-data:/app/data \
  ghcr.io/nicodlz/zod-vault-server
```

### Manual

```bash
git clone https://github.com/nicodlz/zod-vault.git
cd zod-vault/packages/server
npm install
npm run build
JWT_SECRET="your-secret-key" npm start
```

The server exposes:

```
POST /auth/email/register  - Register with email/password
POST /auth/email/login     - Login with email/password
GET  /auth/me              - Get current user
POST /auth/refresh         - Refresh access token
POST /auth/logout          - Logout

GET    /vault              - List user's vaults
POST   /vault              - Create vault
GET    /vault/:uid         - Get vault
PUT    /vault/:uid         - Update vault
DELETE /vault/:uid         - Delete vault
```

## Recovery Key

The recovery key is a 256-bit key encoded as a human-readable string:

```
ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-Q
```

- It's the **only way** to decrypt your data
- The server never sees it
- If you lose it, your data is gone — by design

Store it somewhere safe (password manager, printed backup, etc).

## Security

| Layer | Implementation |
|-------|----------------|
| Encryption | AES-256-GCM (Web Crypto API) |
| Key derivation | Argon2id (OWASP 2024 recommended) |
| Auth | JWT with refresh tokens, WebAuthn passkeys |
| Transport | HTTPS required in production |

All encryption happens client-side. The server is a dumb blob store — it cannot read your data even if compromised.

## Local-only mode

Don't need sync? Use vault without a server:

```typescript
const useStore = create(
  vault(
    (set) => ({ count: 0 }),
    {
      name: "local-store",
      recoveryKey: recoveryKey,
      // No server = local encrypted storage only
    }
  )
);
```

Data is encrypted and stored in localStorage/IndexedDB.

## Documentation

Full documentation available at **[zod-vault.ndlz.net](https://zod-vault.ndlz.net)**

## License

MIT © [Nicolas de Luz](https://github.com/nicodlz)
