---
title: Introduction
description: What is zod-vault and why use it
---

zod-vault adds end-to-end encrypted cloud sync to your Zustand stores.

## The Problem

You're building a React app with Zustand. You want to:
- Persist state across sessions
- Sync data across devices
- Keep user data private

Zustand's `persist()` handles local storage, but:
- Data is stored in plaintext
- No cloud sync
- Anyone with device access can read it

## The Solution

zod-vault is a drop-in replacement for `persist()` that adds:

**End-to-End Encryption**
- AES-256-GCM encryption (NIST approved)
- Argon2id key derivation (OWASP 2024 recommended)
- All crypto happens client-side

**Cloud Sync**
- Bidirectional sync across devices
- Offline queue for changes made without network
- Conflict resolution with Last-Write-Wins

**Self-Hostable**
- Single Docker image
- SQLite storage (no external DB)
- Your server, your data

## How It Works

```
┌──────────────────────────────────────────────────┐
│                    CLIENT                         │
│                                                  │
│  Zustand Store → vault() → AES-256-GCM → Blob   │
│                                                  │
└────────────────────────┬─────────────────────────┘
                         │ HTTPS
                         ▼
┌──────────────────────────────────────────────────┐
│                    SERVER                         │
│                                                  │
│  Receives encrypted blob → Stores in SQLite      │
│  Server CANNOT read your data                    │
│                                                  │
└──────────────────────────────────────────────────┘
```

The server is a dumb blob store. It never sees your plaintext data.

## Recovery Key

When you use zod-vault, you generate a recovery key:

```
ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-Q
```

This key:
- Encrypts all your data
- Is never sent to the server
- Cannot be recovered if lost
- Is the only way to decrypt your data

Store it safely. Password manager, printed backup, etc.

## Next Steps

- [Quick Start](/guides/quick-start/) - Get up and running in 5 minutes
- [Self-Hosting](/guides/self-hosting/) - Deploy your own server
- [Security Model](/security/model/) - Understand the cryptography
