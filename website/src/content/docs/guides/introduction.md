---
title: Introduction
description: What is ursalock and why use it
---

ursalock provides end-to-end encrypted document storage using **passkey-derived keys**.

## The Problem

You're building a web app and want to:
- Store user data securely
- Sync data across devices
- Keep user data truly private (zero-knowledge)

Traditional solutions either:
- Store data in plaintext (Firebase, Supabase)
- Require complex key management (PGP, manual encryption)
- Vendor lock-in with proprietary E2EE (1Password, Bitwarden)

## The Solution

ursalock provides:

**Passkey-Based E2EE**
- Your passkey derives the encryption key via WebAuthn PRF
- No recovery key to store — your passkey IS the key
- Same passkey = same data on any device

**Document-Level Storage**
- Store encrypted documents in collections
- Each document independently encrypted
- Efficient syncing (only changed documents)

**Zero-Knowledge Architecture**
- Server stores only encrypted ciphertext
- Server never sees your plaintext
- All crypto happens client-side

**Self-Hostable**
- Single Docker image
- SQLite storage (no external DB)
- Your server, your data

## How It Works

```
┌──────────────────────────────────────────────────────┐
│                      CLIENT                          │
│                                                      │
│  Passkey → PRF → cipherJwk → deriveVaultKeys()       │
│                          ↓                           │
│                   encryptionKey + hmacKey            │
│                          ↓                           │
│           Document → AES-256-GCM → Ciphertext        │
│                                                      │
└────────────────────────┬─────────────────────────────┘
                         │ HTTPS (encrypted documents)
                         ▼
┌──────────────────────────────────────────────────────┐
│                      SERVER                          │
│                                                      │
│  Receives encrypted documents → Stores in SQLite    │
│  Server CANNOT read your data                       │
│  Server only knows document metadata (uid, version) │
│                                                      │
└──────────────────────────────────────────────────────┘
```

1. **User authenticates** with their passkey
2. **WebAuthn PRF** derives a `cipherJwk` (master key)
3. **Vault-specific keys** derived via HKDF
4. **Documents** encrypted/decrypted with vault keys
5. **Server** stores and syncs encrypted documents

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
