---
title: Introduction
description: What is zod-vault and why use it
---

zod-vault adds end-to-end encrypted cloud sync to your Zustand stores using **passkey-derived keys**.

## The Problem

You're building a React app with Zustand. You want to:
- Persist state across sessions
- Sync data across devices
- Keep user data truly private

Zustand's `persist()` handles local storage, but:
- Data is stored in plaintext
- No cloud sync
- Anyone with device access can read it

## The Solution

zod-vault is a drop-in replacement for `persist()` that adds:

**Passkey-Based E2EE**
- Your passkey derives the encryption key via WebAuthn PRF
- No recovery key to store — your passkey IS the key
- Same passkey = same data on any device

**Zero-Knowledge Sync**
- Server stores only encrypted blobs
- Server never sees your plaintext
- All crypto happens client-side

**Self-Hostable**
- Single Docker image
- SQLite storage (no external DB)
- Your server, your data

## How It Works

```
┌──────────────────────────────────────────────────┐
│                    CLIENT                         │
│                                                  │
│  Passkey → PRF → cipherJwk → AES-256-GCM → Blob  │
│                                                  │
└────────────────────────┬─────────────────────────┘
                         │ HTTPS (encrypted blob)
                         ▼
┌──────────────────────────────────────────────────┐
│                    SERVER                         │
│                                                  │
│  Receives encrypted blob → Stores in SQLite      │
│  Server CANNOT read your data                    │
│  Server only knows your opaqueId (hash)          │
│                                                  │
└──────────────────────────────────────────────────┘
```

1. **User authenticates** with their passkey
2. **WebAuthn PRF** derives a `cipherJwk` (encryption key)
3. **Zustand store** encrypts/decrypts with that key
4. **Server** stores and syncs encrypted blobs

The server never sees your encryption key or plaintext data.

## Why Passkeys?

Traditional E2EE apps require a recovery key:
```
ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567
```

Problems:
- Users lose it
- Users store it insecurely
- Adds friction to onboarding

With passkeys:
- Your biometric/security key IS the key
- Synced by your password manager (iCloud, Google, Proton Pass)
- No separate secret to manage

## Re-Authentication

One tradeoff: the `cipherJwk` lives only in memory. After a page refresh:
- JWT (auth token) persists ✓
- cipherJwk is gone ✗

Solution: prompt for passkey on refresh. It's a quick tap — no password to type.

## Next Steps

- [Quick Start](/guides/quick-start/) — Get up and running in 5 minutes
- [Authentication](/guides/authentication/) — Passkey flows and hooks
- [Self-Hosting](/guides/self-hosting/) — Deploy your own server
- [Security Model](/security/model/) — Understand the cryptography
