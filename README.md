<p align="center">
  <h1 align="center">ursalock</h1>
  <p align="center">
    End-to-end encrypted cloud sync for Zustand stores
    <br/>
    Passkey-powered E2EE. No recovery key. Self-hostable.
  </p>
</p>

<p align="center">
  <a href="https://ursalock.ndlz.net"><img src="https://img.shields.io/badge/docs-zod--vault.ndlz.net-blue.svg" alt="Documentation" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" /></a>
  <a href="https://www.npmjs.com/package/@ursalock/zustand"><img src="https://img.shields.io/npm/v/@ursalock/zustand.svg" alt="npm" /></a>
  <a href="https://bundlephobia.com/package/@ursalock/zustand"><img src="https://img.shields.io/bundlephobia/minzip/@ursalock/zustand" alt="Bundle Size" /></a>
</p>

<br/>

```typescript
import { create, type StateCreator } from "zustand";
import { vault, type VaultOptionsJwk } from "@ursalock/zustand";
import type { CipherJWK } from "@ursalock/crypto";

interface NotesState {
  notes: string[];
  addNote: (note: string) => void;
}

// After passkey auth, you get a cipherJwk (encryption key)
function createStore(cipherJwk: CipherJWK) {
  const storeCreator: StateCreator<NotesState> = (set) => ({
    notes: [],
    addNote: (note) => set((s) => ({ notes: [...s.notes, note] })),
  });

  return create(vault(storeCreator, {
    name: "my-notes",
    cipherJwk,
    server: "https://vault.example.com",
    getToken: () => client.getToken(),
  }));
}

// Sync across devices
await store.vault.sync();
```

## What is ursalock?

ursalock adds encrypted cloud sync to Zustand stores. Your **passkey derives the encryption key** via WebAuthn PRF — no recovery key to manage. Data is encrypted client-side; the server only stores opaque blobs.

## Features

- **Passkey = Key** — Your passkey derives the encryption key. No recovery key to lose.
- **Zero-knowledge** — Server stores encrypted blobs only, never sees plaintext
- **Cross-device sync** — Same passkey = same key = same data everywhere
- **Offline-first** — Queue changes offline, sync when back online
- **Self-hostable** — Single Docker image, SQLite storage
- **Drop-in** — Replace `persist()` with `vault()`, keep your store logic

## Installation

```bash
npm install @ursalock/zustand @ursalock/client @ursalock/crypto
```

## Packages

| Package | Description |
|---------|-------------|
| [@ursalock/crypto](./packages/crypto) | Encryption primitives (AES-256-GCM) |
| [@ursalock/zustand](./packages/zustand) | Zustand middleware |
| [@ursalock/client](./packages/client) | Auth client + React hooks |
| [@ursalock/server](./packages/server) | Self-hosted backend (Hono + SQLite) |

## Quick Start

### 1. Setup auth client

```typescript
import { VaultClient } from "@ursalock/client";

export const vaultClient = new VaultClient({
  serverUrl: "https://vault.example.com",
});
```

### 2. Authenticate with passkey

```tsx
import { useSignUp, useSignIn, type ZKCredential } from "@ursalock/client";

function Auth({ onAuth }: { onAuth: (c: ZKCredential) => void }) {
  const { signUp } = useSignUp(vaultClient);
  const { signIn } = useSignIn(vaultClient);

  const handleSignIn = async () => {
    const result = await signIn({ usePasskey: true });
    if (result.success && result.credential) {
      // result.credential.cipherJwk = encryption key
      // result.credential.jwt = auth token
      onAuth(result.credential);
    }
  };

  return <button onClick={handleSignIn}>Sign In with Passkey</button>;
}
```

### 3. Create an encrypted store

```typescript
import { create, type StateCreator } from "zustand";
import { vault, type VaultOptionsJwk } from "@ursalock/zustand";
import type { CipherJWK } from "@ursalock/crypto";

interface NotesState {
  notes: string[];
  addNote: (note: string) => void;
}

function createNotesStore(cipherJwk: CipherJWK) {
  const storeCreator: StateCreator<NotesState> = (set) => ({
    notes: [],
    addNote: (note) => set((s) => ({ notes: [...s.notes, note] })),
  });

  const options: VaultOptionsJwk<NotesState> = {
    name: "notes",
    cipherJwk,
    server: "https://vault.example.com",
    getToken: () => vaultClient.getToken(),
    syncInterval: 30000, // Auto-sync every 30s
  };

  return create(vault(storeCreator, options));
}
```

### 4. Sync across devices

```typescript
// Full sync (push + pull)
await store.vault.sync();

// Or granular
await store.vault.push();  // Local → Server
await store.vault.pull();  // Server → Local

// Check status
store.vault.getSyncStatus();  // "idle" | "syncing" | "synced" | "error"
store.vault.hasPendingChanges();
```

## How It Works

```
┌───────────────────────────────────────────────────┐
│                     CLIENT                         │
│                                                   │
│  Passkey → WebAuthn PRF → cipherJwk → AES-256-GCM │
│                                                   │
│  Zustand Store ←→ Encrypt/Decrypt ←→ Sync Engine  │
└─────────────────────────┬─────────────────────────┘
                          │ HTTPS (encrypted blobs)
                          ▼
┌───────────────────────────────────────────────────┐
│                     SERVER                         │
│                                                   │
│  Stores encrypted blobs in SQLite                 │
│  Knows only opaqueId (hash of passkey)            │
│  CANNOT read your data                            │
└───────────────────────────────────────────────────┘
```

## Re-Authentication

The `cipherJwk` lives only in memory (for security). After page refresh:
- JWT persists in localStorage ✓
- cipherJwk is gone ✗

Detect this and prompt for re-auth:

```tsx
const hasJwt = vaultClient.isAuthenticated();
const hasCipherKey = credential !== null;

if (hasJwt && !hasCipherKey) {
  // Valid session but no key = re-auth with passkey
  showAuthScreen();
}
```

## Self-Hosting

### Docker

```bash
docker run -d \
  -p 3000:3000 \
  -e JWT_SECRET="your-secret-key" \
  -v vault-data:/app/data \
  ghcr.io/nicodlz/ursalock-server
```

### Coolify / Railway / Fly.io

See [Self-Hosting Guide](https://ursalock.ndlz.net/guides/self-hosting/)

## Security

| Layer | Implementation |
|-------|----------------|
| Encryption | AES-256-GCM (Web Crypto API) |
| Key derivation | WebAuthn PRF extension |
| Auth | JWT + WebAuthn passkeys |
| Identity | SHA-256 hash of passkey rawId |
| Transport | HTTPS required |

All encryption happens client-side. The server is a dumb blob store.

## Passkey Compatibility

For cross-device sync, your passkey provider must sync credentials:

| Provider | Syncs Passkeys |
|----------|---------------|
| iCloud Keychain | ✅ |
| Google Password Manager | ✅ |
| Proton Pass | ✅ |
| Hardware keys (YubiKey) | ❌ (per-device) |

## Local-Only Mode

Don't need sync? Skip the server:

```typescript
const store = create(vault(storeCreator, {
  name: "local-store",
  cipherJwk,
  // No server = encrypted localStorage only
}));
```

## Documentation

Full docs at **[ursalock.ndlz.net](https://ursalock.ndlz.net)**

## License

MIT © [Nicolas de Luz](https://github.com/nicodlz)
