---
title: "@ursalock/crypto"
description: Encryption primitives API reference
---

Low-level crypto functions. Most users won't need these directly.

## generateRecoveryKey

Generate a cryptographically secure recovery key.

```typescript
import { generateRecoveryKey } from "@ursalock/crypto";

const key = generateRecoveryKey();
// => "ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-Q"
```

Returns a 256-bit key encoded as a human-readable string.

## validateRecoveryKey

Check if a recovery key is valid.

```typescript
import { validateRecoveryKey } from "@ursalock/crypto";

validateRecoveryKey("ABCD-EFGH-...");  // true
validateRecoveryKey("invalid");         // false
```

## encrypt

Encrypt data with a recovery key.

```typescript
import { encrypt } from "@ursalock/crypto";

const { ciphertext, salt } = await encrypt(
  "secret data",
  recoveryKey
);
```

**Parameters:**
- `data: string` — Plaintext to encrypt
- `recoveryKey: string` — Recovery key

**Returns:**
- `ciphertext: string` — Encrypted data (base64)
- `salt: string` — Random salt (base64)

## decrypt

Decrypt data with a recovery key.

```typescript
import { decrypt } from "@ursalock/crypto";

const plaintext = await decrypt(
  ciphertext,
  salt,
  recoveryKey
);
```

**Parameters:**
- `ciphertext: string` — Encrypted data
- `salt: string` — Salt from encryption
- `recoveryKey: string` — Recovery key

**Returns:** `string` — Decrypted plaintext

**Throws:** Error if decryption fails (wrong key or corrupted data)

## deriveKey

Derive an AES key from a recovery key (internal use).

```typescript
import { deriveKey } from "@ursalock/crypto";

const aesKey = await deriveKey(recoveryKey, salt);
// => CryptoKey (AES-256-GCM)
```

Uses Argon2id with OWASP-recommended parameters.
