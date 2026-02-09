---
title: Recovery Key
description: Understanding and managing your recovery key
---

The recovery key is the master encryption key for your data.

## Format

```
ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-Q
```

- 52 characters (excluding dashes)
- Base32-like alphabet (A-Z, 2-7)
- ~256 bits of entropy
- Human-readable (no confusable chars like 0/O, 1/I)

## Properties

| Property | Value |
|----------|-------|
| User-controlled | Only you know it |
| Not transmitted | Never sent to server |
| Not recoverable | Server cannot help if lost |
| Portable | Works across devices |

## Generating a Key

```typescript
import { generateRecoveryKey } from "@zod-vault/crypto";

const recoveryKey = generateRecoveryKey();
```

Uses `crypto.getRandomValues()` for cryptographic randomness.

## Validating a Key

```typescript
import { validateRecoveryKey } from "@zod-vault/crypto";

if (validateRecoveryKey(userInput)) {
  // Valid format
}
```

## Storage Recommendations

### Password Manager

Store in your password manager (1Password, Bitwarden, etc).

### Printed Backup

Print and store in a safe location:

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

### Split Storage

For high security, split the key:

```typescript
const key = "ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-Q";

// Store separately
const part1 = key.slice(0, 26);  // First half
const part2 = key.slice(26);      // Second half
```

## What NOT to Do

- Store unencrypted on cloud storage
- Email to yourself
- Share via unencrypted chat
- Use a weak/guessable key
- Reuse across different vaults

## Key Per Vault

Consider separate keys for different vaults:

```typescript
const personalKey = generateRecoveryKey();
const workKey = generateRecoveryKey();

// Personal vault
vault(config, { name: "personal", recoveryKey: personalKey });

// Work vault  
vault(config, { name: "work", recoveryKey: workKey });
```

Compromise of one key doesn't affect the other.

## Lost Key

If you lose your recovery key:

1. Your data **cannot be recovered**
2. The server cannot help (zero-knowledge)
3. Create a new vault with a new key
4. Start fresh

This is by design — true E2EE means no backdoors.

## Rotating Keys

To change your recovery key:

1. Generate new key
2. Decrypt data with old key
3. Re-encrypt with new key
4. Update vault on server

```typescript
// Manual rotation
const oldData = await useStore.vault.pull();
const newKey = generateRecoveryKey();

// Create new store with new key
const newStore = create(
  vault(config, { 
    name: "migrated-store", 
    recoveryKey: newKey 
  })
);

newStore.setState(oldData);
await newStore.vault.push();

// Clear old vault
await useStore.vault.clearStorage();
```
