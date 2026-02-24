# Security Model

## Architecture

ursalock is a zero-knowledge encrypted storage system:

1. **Authentication** — WebAuthn passkeys with PRF extension
2. **Key derivation** — HKDF-SHA256 derives vault-specific keys from the passkey master key
3. **Encryption** — AES-256-GCM (client-side, before any network request)
4. **Integrity** — HMAC-SHA256 (Encrypt-then-MAC) detects server-side tampering
5. **Storage** — Server stores only encrypted base64 blobs

## What the Server Sees

- Encrypted ciphertext (base64)
- HMAC tags (hex)
- Vault/collection metadata (names, timestamps)
- Auth tokens (JWT)

## What the Server Cannot Do

- Decrypt any document
- Read document contents
- Forge valid HMAC tags
- Recover user data without the passkey

## Key Hierarchy

```
Passkey (WebAuthn PRF)
  └─ CipherJWK.k (32-byte master key, memory-only)
       └─ HKDF-SHA256(masterKey, vaultUid)
            ├─ encryptionKey (AES-256-GCM)
            ├─ hmacKey (HMAC-SHA256)
            └─ indexKey (deterministic indexing)
```

Each vault gets unique derived keys. Compromising one vault's keys doesn't affect others.

## Agent Access

When sharing keys with AI agents:

- **API keys** are scoped to specific vaults and collections
- **Derived keys** (encryptionKey, hmacKey) are exported as base64
- Agents encrypt/decrypt client-side using `@ursalock/agent`
- Revoke API keys instantly via `DELETE /auth/api-keys/:uid`

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| Server compromise | Zero-knowledge: server has only ciphertext |
| Data tampering | HMAC-SHA256 integrity verification |
| Key theft | Keys live in memory only, derived per-vault |
| Replay attacks | Optimistic locking with version numbers |
| Brute force auth | Rate limiting on auth endpoints |

## Cryptographic Primitives

- **AES-256-GCM** — Authenticated encryption (Web Crypto API)
- **HKDF-SHA256** — Key derivation (key separation per vault)
- **HMAC-SHA256** — Data integrity (Encrypt-then-MAC)
- **WebAuthn PRF** — Passkey-derived encryption keys
