---
title: Recovery Key (Legacy)
description: Alternative encryption using a recovery key instead of passkeys
---

:::caution
Recovery keys are the **legacy** approach. New apps should use [passkey-based encryption](/guides/authentication/) for better UX.
:::

If you can't use passkeys (no WebAuthn PRF support, need offline-only mode), you can use a recovery key.

## When to Use Recovery Keys

- Browser doesn't support WebAuthn PRF
- Need encryption without any server
- Want explicit control over the key
- Migrating from an older version

## Format

```
ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-Q
```

- 52 characters (excluding dashes)
- Base32-like alphabet (A-Z, 2-7)
- ~256 bits of entropy
- Human-readable (no confusable chars like 0/O, 1/I)

## Generating a Key

```typescript
import { generateRecoveryKey } from "@zod-vault/crypto";

const recoveryKey = generateRecoveryKey();
```

Uses `crypto.getRandomValues()` for cryptographic randomness.

## Using with Vault

```typescript
import { create } from "zustand";
import { vault, type VaultOptionsLegacy } from "@zod-vault/zustand";

const options: VaultOptionsLegacy<MyState> = {
  name: "my-store",
  recoveryKey: "ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-Q",
  // Optional: add server sync
  server: "https://vault.example.com",
  getToken: () => authToken,
};

const useStore = create(vault(storeCreator, options));
```

## Key Derivation

With recovery keys, the encryption key is derived using Argon2id:

```
Recovery Key + Salt → Argon2id → AES-256 Key
```

Parameters (OWASP 2024):

```
memory: 64 MB
iterations: 3
parallelism: 4
hashLength: 32 bytes
```

## Storage Recommendations

### Password Manager

Store in 1Password, Bitwarden, Proton Pass, etc.

### Printed Backup

```
╔═══════════════════════════════════════════════════╗
║              zod-vault Recovery Key                ║
║                                                   ║
║  ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567        ║
║  ABCD-EFGH-IJKL-MNOP-Q                           ║
║                                                   ║
║  Store this safely. It's the only way to         ║
║  decrypt your data.                              ║
╚═══════════════════════════════════════════════════╝
```

## What NOT to Do

- Store unencrypted in cloud storage
- Email to yourself
- Share via unencrypted chat
- Use a guessable key
- Reuse across different vaults

## Lost Key

If you lose your recovery key:

1. Your data **cannot be recovered**
2. The server cannot help (zero-knowledge)
3. Start fresh with a new key

This is by design — true E2EE means no backdoors.

## Migrating to Passkeys

If you started with a recovery key and want to switch to passkeys:

```typescript
// 1. Pull data with old key
const oldStore = create(vault(storeCreator, {
  name: "old-vault",
  recoveryKey: oldKey,
}));
await oldStore.vault.pull();
const data = oldStore.getState();

// 2. Create new store with passkey
const newStore = createStoreWithPasskey(cipherJwk);
newStore.setState(data);
await newStore.vault.push();

// 3. Clear old vault
await oldStore.vault.clearStorage();
```

## Passkeys vs Recovery Keys

| Aspect | Passkeys | Recovery Keys |
|--------|----------|---------------|
| UX | Tap to authenticate | Remember/store a key |
| Cross-device | Via passkey provider | Manual key entry |
| Lost key | Re-register passkey | Data lost forever |
| Offline-only | Needs server for auth | Works fully offline |
| Browser support | Chrome 116+, Safari 17+ | All browsers |
