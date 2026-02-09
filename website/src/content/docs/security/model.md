---
title: Security Model
description: How zod-vault keeps your data safe
---

zod-vault uses a zero-knowledge architecture. The server cannot read your data.

## Threat Model

### Protected Against

- **Server compromise** — Data is encrypted, server has no keys
- **Database leaks** — Only encrypted blobs stored
- **Man-in-the-middle** — HTTPS + client-side encryption
- **Unauthorized access** — JWT auth + user isolation

### NOT Protected Against

- **Client-side compromise** — Malware on user's device
- **Recovery key theft** — If someone has your key, they decrypt
- **Weak recovery keys** — Always use `generateRecoveryKey()`

## Encryption

### Algorithm: AES-256-GCM

- 256-bit key size
- Authenticated encryption (integrity + confidentiality)
- NIST approved, widely audited
- Web Crypto API (native browser/Node.js)

### Key Derivation: Argon2id

- Memory-hard (resistant to GPU/ASIC attacks)
- OWASP 2024 recommended parameters:

```
memory: 64 MB
iterations: 3
parallelism: 4
hashLength: 32 bytes
```

## Data Flow

```
┌─────────────────────────────────────────────────┐
│                   CLIENT                         │
│                                                 │
│  Recovery Key + Salt → Argon2id → AES Key      │
│                           ↓                     │
│  Plaintext → AES-256-GCM → Encrypted Blob      │
│                                                 │
└────────────────────────┬────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────┐
│                   SERVER                         │
│                                                 │
│  Stores: { blob, salt, metadata }               │
│  Knows: NOTHING about your data                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

## What the Server Stores

| Data | Encrypted? | Notes |
|------|------------|-------|
| User email | No | Needed for login |
| Password hash | Hashed | Argon2id |
| Vault data | Yes | Opaque blob |
| Vault salt | No | Useless without key |
| Timestamps | No | For sync |

## What the Server Cannot Do

- Read vault contents
- Recover data without recovery key
- Decrypt even with database access
- Impersonate users

## Authentication

### JWT Tokens

- Access token: 15 min expiry
- Refresh token: 7 day expiry
- Unique `jti` claim (no replay)
- Refresh rotation

### Password Hashing

```
Argon2id
memory: 64 MB
iterations: 3
parallelism: 4
```

### Passkeys (WebAuthn)

- Hardware-backed
- Phishing-resistant
- Recommended over passwords

## Audit

The crypto is ~300 lines of TypeScript:

```bash
git clone https://github.com/nicodlz/zod-vault
cat packages/crypto/src/*.ts | wc -l
```

Uses:
- Web Crypto API (native, no custom crypto)
- `hash-wasm` for Argon2id (audited WASM)

## Reporting Vulnerabilities

Found an issue?

1. **Do not** open a public issue
2. Email: ndlz@pm.me
3. Include: description, steps, impact

Response within 48 hours.
