# Getting Started

## Installation

```bash
npm install @ursalock/client @ursalock/crypto
```

## Setup

### 1. Auth Client

```typescript
import { VaultClient } from "@ursalock/client";

const vaultClient = new VaultClient({
  serverUrl: "https://vault.example.com",
});
```

### 2. Authenticate with Passkey

```typescript
import { useSignIn } from "@ursalock/client";

const { signIn } = useSignIn(vaultClient);
const result = await signIn({ usePasskey: true });

// result.credential.cipherJwk → master key
// result.credential.jwt → auth token
```

### 3. Create DocumentClient

```typescript
import { DocumentClient } from "@ursalock/client";
import { deriveVaultKeys } from "@ursalock/crypto";

// Get or create vault
const res = await vaultClient.fetch("/vault/by-name/my-app");
const { uid: vaultUid } = await res.json();

// Derive keys
function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const masterKey = base64urlToBytes(credential.cipherJwk.k);
const keys = await deriveVaultKeys(masterKey, vaultUid);

const docClient = new DocumentClient({
  serverUrl: "https://vault.example.com",
  vaultUid,
  encryptionKey: keys.encryptionKey,
  hmacKey: keys.hmacKey,
  getAuthHeader: () => vaultClient.getAuthHeader(),
});
```

### 4. Store Data

```typescript
const notes = docClient.collection<Note>("notes");

// Create
const doc = await notes.create({ title: "Hello", content: "Secret" });

// Read
const fetched = await notes.get(doc.uid);

// Update
await notes.replace(doc.uid, { title: "Updated", content: "Still secret" }, doc.version);

// Delete
await notes.delete(doc.uid);
```

## Self-Hosting

```bash
docker run -p 3000:3000 \
  -e JWT_SECRET=your-secret \
  -v ./data:/app/data \
  ghcr.io/nicodlz/ursalock-server
```

See the [full documentation](https://ursalock.ndlz.net) for more.
