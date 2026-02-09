# 🔐 zod-vault

> Drop-in E2EE encrypted cloud sync for Zustand stores

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)

**zod-vault** adds end-to-end encrypted cloud sync to your existing Zustand stores. Replace `persist()` with `vault()` and your data is encrypted and synced across devices — zero-knowledge, self-hostable.

## ✨ Features

- **🔄 Drop-in replacement** — Change one line, get encrypted sync
- **🔒 Zero-knowledge** — Server never sees your data (E2EE with AES-256-GCM)
- **🔑 Recovery key** — Your data, your key, your control
- **📱 Passkeys** — Modern auth with WebAuthn (email fallback available)
- **🏠 Self-hostable** — Single Docker image, SQLite storage
- **📦 Tiny** — <20KB crypto overhead
- **🔌 Offline-first** — Works without network, syncs when connected

## 📦 Installation

```bash
npm install @zod-vault/zustand @zod-vault/client
# or
pnpm add @zod-vault/zustand @zod-vault/client
# or
bun add @zod-vault/zustand @zod-vault/client
```

## 🚀 Quick Start

```typescript
import { create } from 'zustand'
import { vault } from '@zod-vault/zustand'

// Before (local only)
const useStore = create(
  persist(
    (set) => ({
      count: 0,
      increment: () => set((s) => ({ count: s.count + 1 })),
    }),
    { name: 'my-store' }
  )
)

// After (encrypted + synced)
const useStore = create(
  vault(
    (set) => ({
      count: 0,
      increment: () => set((s) => ({ count: s.count + 1 })),
    }),
    { 
      name: 'my-store',
      server: 'https://vault.example.com',
    }
  )
)
```

That's it. Your data is now encrypted client-side and synced across devices.

## 🔐 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT                               │
│  ┌──────────┐    ┌──────────┐    ┌───────────────────────┐ │
│  │ Zustand  │ →  │ vault()  │ →  │ AES-256-GCM encrypted │ │
│  │ Store    │    │ middleware│    │ blob                  │ │
│  └──────────┘    └──────────┘    └───────────┬───────────┘ │
│                                               │             │
└───────────────────────────────────────────────┼─────────────┘
                                                │ HTTPS
                                                ▼
┌─────────────────────────────────────────────────────────────┐
│                         SERVER                               │
│  ┌──────────┐    ┌────────────────────────────────────────┐│
│  │ Hono API │ →  │ SQLite (encrypted blobs only)          ││
│  └──────────┘    └────────────────────────────────────────┘│
│                                                             │
│  Server sees: { id, blob: "a8f3c2e1...", updatedAt }       │
│  Server NEVER sees: your actual data                        │
└─────────────────────────────────────────────────────────────┘
```

## 🔑 Recovery Key

When you first use zod-vault, you'll get a recovery key:

```
ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-Q
```

**Store this safely!** It's the only way to decrypt your data. Not even the server can recover it.

## 📚 Packages

| Package | Description |
|---------|-------------|
| `@zod-vault/crypto` | Crypto primitives (Argon2id, AES-256-GCM) |
| `@zod-vault/client` | API client + auth |
| `@zod-vault/zustand` | Zustand middleware |
| `@zod-vault/server` | Self-hostable backend |

## 🏠 Self-Hosting

```bash
docker run -d \
  -p 3000:3000 \
  -v vault-data:/data \
  ghcr.io/nicodlz/zod-vault-server
```

Or deploy to:
- [Coolify](https://coolify.io)
- [Railway](https://railway.app)
- [Fly.io](https://fly.io)

## 🔒 Security

- **Encryption**: AES-256-GCM (NIST approved, quantum-resistant)
- **Key Derivation**: Argon2id (OWASP 2026 recommended)
- **Auth**: Passkeys (WebAuthn) with email fallback
- **Transport**: HTTPS/TLS 1.3

All crypto happens client-side. The server is a dumb blob store.

## 📖 Documentation

- [Getting Started](./docs/getting-started.md)
- [API Reference](./docs/api.md)
- [Self-Hosting Guide](./docs/self-hosting.md)
- [Migration from persist()](./docs/migration.md)
- [Security Model](./docs/security.md)

## 📄 License

MIT © [Nicolas de Luz](https://github.com/nicodlz)
