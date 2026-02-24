---
title: "@ursalock/crypto"
description: Encryption and key derivation primitives
---

Low-level crypto functions used internally by `@ursalock/client`. Most users only need `deriveVaultKeys` and `bytesToBase64`.

## deriveVaultKeys

Derive vault-specific encryption, HMAC, and index keys from a master key via HKDF.

```typescript
import { deriveVaultKeys } from "@ursalock/crypto";

const masterKey = base64urlToBytes(cipherJwk.k); // 32 bytes from passkey PRF
const keys = await deriveVaultKeys(masterKey, vaultUid);

keys.encryptionKey; // Uint8Array(32) — AES-256-GCM encryption
keys.hmacKey;       // Uint8Array(32) — HMAC-SHA256 integrity
keys.indexKey;      // Uint8Array(32) — deterministic document indexing
```

**Parameters:**
- `masterKey: Uint8Array` — 32-byte master key (from passkey CipherJWK)
- `vaultUid: string` — Vault UID (used as HKDF context for key separation)

**Returns:** `VaultKeys` — `{ encryptionKey, hmacKey, indexKey }` (all 32-byte Uint8Arrays)

This is the key function for setting up a `DocumentClient`. Each vault gets unique derived keys, so compromising one vault's keys doesn't affect others.

## bytesToBase64 / base64ToBytes

Convert between Uint8Array and base64 strings.

```typescript
import { bytesToBase64, base64ToBytes } from "@ursalock/crypto";

const b64 = bytesToBase64(keys.encryptionKey);
// => "aGVsbG8gd29ybGQ..." (standard base64)

const bytes = base64ToBytes(b64);
// => Uint8Array(32)
```

Use `bytesToBase64` when you need to share derived keys with an agent (e.g. via the Agent Access UI).

## encrypt / decrypt

AES-256-GCM encryption using Web Crypto API. Used internally by `DocumentClient`.

```typescript
import { encrypt, decrypt } from "@ursalock/crypto";

// Encrypt
const plaintext = new TextEncoder().encode(JSON.stringify(data));
const { combined } = await encrypt(plaintext, key); // combined = iv + ciphertext

// Decrypt
const decrypted = await decrypt(combined, key);
const data = JSON.parse(new TextDecoder().decode(decrypted));
```

- 256-bit key, 96-bit IV (NIST recommended for GCM)
- 128-bit auth tag (included in ciphertext by Web Crypto)

## encryptWithJwk / decryptWithJwk

Encrypt/decrypt directly with a CipherJWK (used for local storage encryption).

```typescript
import { encryptWithJwk, decryptWithJwk } from "@ursalock/crypto";
import type { CipherJWK } from "@ursalock/crypto";

const encrypted = await encryptWithJwk(plaintext, cipherJwk);
const decrypted = await decryptWithJwk(encrypted.combined, cipherJwk);
```

## computeHmac / verifyHmac

HMAC-SHA256 for data integrity verification (Encrypt-then-MAC pattern).

```typescript
import { computeHmac, verifyHmac } from "@ursalock/crypto";

const tag = await computeHmac(data, hmacKey); // hex string
const valid = await verifyHmac(data, hmacKey, tag); // boolean
```

Used by the sync engine to detect server-side tampering of encrypted blobs.

## hkdf

Raw HKDF-SHA256 derivation.

```typescript
import { hkdf } from "@ursalock/crypto";

const derived = await hkdf(inputKey, salt, info, length);
// => Uint8Array of `length` bytes
```

`deriveVaultKeys` is a higher-level wrapper around this.

## Types

```typescript
import type {
  CipherJWK,      // JWK with 'k' field containing AES key
  VaultKeys,       // { encryptionKey, hmacKey, indexKey }
  EncryptedPayload // { iv, ciphertext, combined }
} from "@ursalock/crypto";
```
