---
title: Agent Access
description: Let AI agents read and write your encrypted data
---

ursalock lets you give AI agents (OpenClaw, custom scripts, etc.) secure access to your encrypted vault data via API keys and derived encryption keys.

## How It Works

Your passkey derives a **master key** via WebAuthn PRF. From that master key, ursalock derives **vault-specific keys** using HKDF:

```
Passkey (WebAuthn PRF)
  └─ CipherJWK.k (master key, 32 bytes)
       └─ deriveVaultKeys(masterKey, vaultUid)
            ├─ encryptionKey (AES-256-GCM)
            ├─ hmacKey (HMAC-SHA256 integrity)
            └─ indexKey (deterministic indexing)
```

To give an agent access, you share:
1. **API key** — authenticates the agent to the server (scoped to specific vaults/collections)
2. **Encryption key** — lets the agent decrypt and encrypt documents
3. **HMAC key** — lets the agent verify and sign data integrity

The server never sees plaintext. The agent encrypts/decrypts client-side using `@ursalock/agent`.

## Generating Agent Keys (UI)

Apps built with ursalock can include an Agent Access UI. The flow:

1. User authenticates with their passkey (provides `CipherJWK`)
2. UI calls `POST /auth/api-keys` to create a scoped API key
3. UI derives encryption keys from the passkey via `deriveVaultKeys`
4. UI displays all keys **once** — user copies them to their agent config

### Implementation

```typescript
import { vaultClient } from "./vault-client";
import { deriveVaultKeys, bytesToBase64, type CipherJWK } from "@ursalock/crypto";

async function generateAgentKeys(cipherJwk: CipherJWK) {
  // 1. Get vault UID
  const res = await vaultClient.fetch("/vault/by-name/my-app");
  const { uid: vaultUid } = await res.json();

  // 2. Create scoped API key
  const keyRes = await vaultClient.fetch("/auth/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "my-agent",
      permissions: ["read", "write"],
      vaultUids: [vaultUid],
      collections: ["my-collection"], // scope to specific collections
    }),
  });
  const { key: apiKey } = await keyRes.json();

  // 3. Derive encryption keys from passkey
  function base64urlToBytes(b64url: string): Uint8Array {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  const masterKey = base64urlToBytes(cipherJwk.k);
  const keys = await deriveVaultKeys(masterKey, vaultUid);

  // 4. Return all values for the agent
  return {
    serverUrl: "https://vault.example.com",
    apiKey,
    vaultUid,
    encryptionKey: bytesToBase64(keys.encryptionKey),
    hmacKey: bytesToBase64(keys.hmacKey),
  };
}
```

### Security Considerations

- **API keys are scoped** — limit to specific vaults and collections
- **Permissions** — use `["read"]` for read-only agents, `["read", "write"]` for full access
- **Revocation** — `DELETE /auth/api-keys/:uid` instantly revokes access
- **Key rotation** — generate new keys and revoke old ones anytime
- **Encryption keys are derived deterministically** — same passkey + same vault = same keys

## Using Keys in an Agent

### With @ursalock/agent SDK

```typescript
import { AgentVault } from "@ursalock/agent";

const vault = new AgentVault({
  serverUrl: "https://vault.example.com",
  apiKey: "ulk_...",
  vaultUid: "abc123",
  encryptionKey: "base64...", // from Agent Access UI
  hmacKey: "base64...",       // from Agent Access UI
});

// Read
const collection = vault.collection<MyData>("my-collection");
const docs = await collection.list();
const data = docs[0]?.content;

// Write
await collection.replace(docUid, newData, version);
```

### With curl (manual)

The agent SDK handles encryption, but you can also call the raw API:

```bash
# List documents (returns encrypted base64 blobs)
curl -H "Authorization: Bearer ulk_..." \
  https://vault.example.com/vaults/VAULT_UID/documents?collection=my-collection

# The response contains encrypted data — you need the encryption key to decrypt
```

## API Key Endpoints

### Create Key

```bash
POST /auth/api-keys
{
  "name": "my-agent",
  "permissions": ["read", "write"],
  "vaultUids": ["vault-uid"],        # optional scope
  "collections": ["my-collection"],   # optional scope
  "expiresAt": 1735689600            # optional expiry (unix timestamp)
}
```

Response includes `key` (shown once):
```json
{
  "uid": "key-uid",
  "key": "ulk_...",
  "name": "my-agent",
  "keyPrefix": "ulk_abc",
  "permissions": ["read", "write"]
}
```

### List Keys

```bash
GET /auth/api-keys
```

### Revoke Key

```bash
DELETE /auth/api-keys/:uid
```

## Key Sharing Best Practices

1. **Never share your passkey** — only share derived keys
2. **Scope API keys narrowly** — one vault, one collection if possible
3. **Use a password manager** — store agent keys in Proton Pass, 1Password, etc.
4. **Rotate periodically** — revoke and regenerate keys every few months
5. **Monitor usage** — API keys track `lastUsedAt`
