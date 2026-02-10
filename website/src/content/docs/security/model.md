---
title: Security Model
description: How ursalock keeps your data safe
---

ursalock uses a zero-knowledge architecture with passkey-derived encryption keys.

## Threat Model

### Protected Against

- **Server compromise** — Data is encrypted, server has no keys
- **Database leaks** — Only encrypted blobs stored
- **Man-in-the-middle** — HTTPS + client-side encryption
- **Unauthorized access** — JWT auth + user isolation
- **Key recovery requests** — No backdoors, no "forgot password"

### NOT Protected Against

- **Client-side compromise** — Malware on user's device
- **Passkey theft** — Physical access to your unlocked device
- **Passkey provider breach** — If iCloud/Google/Proton Pass is compromised

## Encryption

### Algorithm: AES-256-GCM

- 256-bit key size
- Authenticated encryption (integrity + confidentiality)
- NIST approved, widely audited
- Web Crypto API (native browser)

### Key Derivation: WebAuthn PRF

The encryption key (`cipherJwk`) is derived from your passkey using the **PRF extension**:

```
Passkey → WebAuthn PRF → HKDF → cipherJwk (AES-256 key)
```

- PRF outputs are deterministic for the same passkey
- Same passkey = same cipherJwk = same decryption
- Different passkey = different cipherJwk = can't decrypt

## Data Flow

```
┌─────────────────────────────────────────────────┐
│                   CLIENT                         │
│                                                 │
│  Passkey → PRF → HKDF → cipherJwk (JWK)        │
│                           ↓                     │
│  Plaintext → AES-256-GCM → Encrypted Blob      │
│                                                 │
└────────────────────────┬────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────┐
│                   SERVER                         │
│                                                 │
│  Stores: { userId: opaqueId, blob, updatedAt }  │
│  Knows: NOTHING about your data                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Identity: opaqueId

Your user identity is a hash of your passkey's `rawId`:

```typescript
opaqueId = SHA-256(credential.rawId)
```

The server never sees your actual passkey — only this opaque identifier.

## What the Server Stores

| Data | Encrypted? | Notes |
|------|------------|-------|
| opaqueId | Hashed | SHA-256 of passkey rawId |
| Vault blob | Yes | AES-256-GCM encrypted |
| updatedAt | No | Timestamp for sync |

That's it. No email, no password hash, no personal info.

## What the Server Cannot Do

- Read vault contents
- Recover data without your passkey
- Decrypt even with full database access
- Know who you are (opaqueId is opaque)
- Reset your "password" (there isn't one)

## Authentication

### Passkey (WebAuthn)

- Hardware-backed (Secure Enclave, TPM)
- Phishing-resistant (bound to origin)
- No passwords to type or remember
- PRF extension for key derivation

### JWT Tokens

- Short-lived access tokens (15 min)
- Stored in localStorage
- Used for server API calls
- Refresh not needed (re-auth with passkey instead)

## Session Security

| What | Stored Where | Survives Refresh |
|------|--------------|------------------|
| JWT | localStorage | ✅ Yes |
| cipherJwk | memory only | ❌ No |

The `cipherJwk` is **never** stored. After page refresh, users must re-authenticate with their passkey to re-derive it.

This is a security feature, not a bug.

## Cross-Device Sync

Passkeys sync via your passkey provider:

| Provider | Syncs | Same rawId |
|----------|-------|------------|
| iCloud Keychain | ✅ | ✅ |
| Google Password Manager | ✅ | ✅ |
| Proton Pass | ✅ | ✅ |
| Hardware key | ❌ | ❌ |

If your provider syncs the passkey, you get the same `rawId` → same `opaqueId` → same user → same data.

## PRF Extension Requirements

The WebAuthn PRF extension is required for key derivation:

- **Chrome 116+** (August 2023)
- **Safari 17+** (September 2023)
- **Firefox** — Not supported yet

On unsupported browsers, passkey auth may work but key derivation won't.

## Audit

The crypto uses standard Web APIs:

```typescript
// Key derivation
const prfOutput = credential.getClientExtensionResults().prf;
const cipherKey = await crypto.subtle.importKey(...);

// Encryption
const encrypted = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv },
  cipherKey,
  plaintext
);
```

No custom crypto. No dependencies for core encryption.

## Reporting Vulnerabilities

Found an issue?

1. **Do not** open a public issue
2. Email: ndlz@pm.me
3. Include: description, steps, impact

Response within 48 hours.
