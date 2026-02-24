---
title: "@ursalock/client"
description: Authentication client API reference
---

Passkey-based authentication client for ursalock.

## Installation

```bash
npm install @ursalock/client
```

## VaultClient

The main client for authentication and session management.

```typescript
import { VaultClient } from "@ursalock/client";

const vaultClient = new VaultClient({
  serverUrl: "https://vault.example.com",
});
```

### Constructor Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `serverUrl` | `string` | Yes | - | Base URL of your ursalock server |

## React Hooks

### useSignUp

Register a new user with a passkey.

```typescript
import { useSignUp } from "@ursalock/client";

function SignUp() {
  const { signUp, isLoading, error } = useSignUp(vaultClient);

  const handleSignUp = async () => {
    const result = await signUp({ usePasskey: true });
    
    if (result.success) {
      console.log("Registered!", result.credential);
      // result.credential.jwt - auth token
      // result.credential.cipherJwk - encryption key
    } else {
      console.error(result.error);
    }
  };

  return (
    <button onClick={handleSignUp} disabled={isLoading}>
      {isLoading ? "Creating..." : "Sign Up with Passkey"}
    </button>
  );
}
```

### useSignIn

Authenticate an existing user.

```typescript
import { useSignIn } from "@ursalock/client";

function SignIn() {
  const { signIn, isLoading, error } = useSignIn(vaultClient);

  const handleSignIn = async () => {
    const result = await signIn({ usePasskey: true });
    
    if (result.success) {
      console.log("Signed in!", result.credential);
    }
  };

  return (
    <button onClick={handleSignIn} disabled={isLoading}>
      Sign In with Passkey
    </button>
  );
}
```

### usePasskeySupport

Check if WebAuthn is supported.

```typescript
import { usePasskeySupport } from "@ursalock/client";

function AuthGate({ children }) {
  const supportsPasskey = usePasskeySupport(vaultClient);

  if (!supportsPasskey) {
    return <p>Your browser doesn't support passkeys.</p>;
  }

  return children;
}
```

## ZKCredential

The credential object returned after authentication.

```typescript
interface ZKCredential {
  jwt: string;          // Auth token for server requests
  cipherJwk: CipherJWK; // Encryption key for vault
}
```

### jwt

Short-lived auth token:
- Stored in localStorage automatically
- Used for server API requests
- Refreshed automatically when expired

### cipherJwk

Encryption key derived from passkey:
- Lives only in memory (not persisted)
- Lost on page refresh (requires re-auth)
- Used for key derivation with `deriveVaultKeys()` from `@ursalock/crypto`

## Client Methods

### getAuthHeader()

Get the Authorization header for API requests.

```typescript
const header = vaultClient.getAuthHeader();
// { "Authorization": "Bearer eyJ..." }

fetch("/api/protected", { headers: header });
```

### getToken()

Get the raw JWT token.

```typescript
const token = vaultClient.getToken();
// "eyJ..." or null
```

### isAuthenticated()

Check if user has a valid JWT.

```typescript
if (vaultClient.isAuthenticated()) {
  // Has valid JWT (but cipherJwk may be null after refresh)
}
```

### logout()

Clear the session.

```typescript
await vaultClient.logout();
// Clears JWT from localStorage
```

## DocumentClient

Client for document-level encrypted storage within vaults.

### Setup

```typescript
import { VaultClient, DocumentClient } from "@ursalock/client";
import { deriveVaultKeys } from "@ursalock/crypto";

// 1. Auth
const vaultClient = new VaultClient({ serverUrl: "https://vault.example.com" });
const result = await signIn({ usePasskey: true });

// 2. Get or create vault
const res = await vaultClient.fetch("/vault/by-name/my-app");
const { uid: vaultUid } = await res.json();

// 3. Derive keys
const masterKey = base64urlToBytes(result.credential.cipherJwk.k);
const keys = await deriveVaultKeys(masterKey, vaultUid);

// 4. Create DocumentClient
const docClient = new DocumentClient({
  serverUrl: "https://vault.example.com",
  vaultUid,
  encryptionKey: keys.encryptionKey,
  hmacKey: keys.hmacKey,
  getAuthHeader: () => vaultClient.getAuthHeader(),
});
```

### Constructor Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `serverUrl` | `string` | Yes | Base URL of your ursalock server |
| `vaultUid` | `string` | Yes | UID of the vault to store documents in |
| `encryptionKey` | `CryptoKey` | Yes | Derived encryption key |
| `hmacKey` | `CryptoKey` | Yes | Derived HMAC key for integrity |
| `getAuthHeader` | `() => Record<string, string>` | Yes | Function returning auth headers |

### Collections

Collections provide typed CRUD operations for documents.

```typescript
interface Note {
  title: string;
  content: string;
}

const notes = docClient.collection<Note>("notes");

// Create
const doc = await notes.create({ title: "Hello", content: "World" });
// Returns: { uid: string, content: Note, version: number, createdAt: number, updatedAt: number }

// Read
const fetched = await notes.get(doc.uid);
console.log(fetched.content); // { title: "Hello", content: "World" }

// List
const all = await notes.list();
// Optional filters: notes.list({ since: timestamp, limit: 10 })

// Update
const updated = await notes.replace(
  doc.uid,
  { title: "Updated", content: "!" },
  doc.version
);

// Delete
await notes.delete(doc.uid);
```

### Single-Document Pattern

For simple apps, store all state in one document:

```typescript
const state = docClient.collection<AppState>("app-state");

// Pull
const docs = await state.list({ limit: 1 });
if (docs[0]) {
  store.setState(docs[0].content);
}

// Push
await state.replace(docUid, store.getState(), currentVersion);
```

### Document Type

```typescript
interface Document<T> {
  uid: string;
  vaultUid: string;
  collection: string;
  content: T;          // Decrypted plaintext object
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}
```

### Collection Methods

#### create(content)

Create a new document.

```typescript
const doc = await collection.create({ title: "New", content: "..." });
```

#### get(uid)

Get a document by UID.

```typescript
const doc = await collection.get("doc-uid");
```

Throws if not found.

#### list(options?)

List all documents in the collection.

```typescript
const docs = await collection.list({
  since: Date.now() - 86400000, // Last 24h
  limit: 100,
});
```

#### replace(uid, content, version)

Replace a document (optimistic locking).

```typescript
try {
  const updated = await collection.replace(uid, newContent, currentVersion);
} catch (error) {
  if (error.message.includes("409")) {
    // Conflict - re-fetch and retry
    const latest = await collection.get(uid);
    // Merge and retry...
  }
}
```

Returns 409 Conflict if version doesn't match.

#### delete(uid)

Soft delete a document.

```typescript
await collection.delete(uid);
```

## Error Handling

```typescript
const result = await signIn({ usePasskey: true });

if (!result.success) {
  switch (result.error) {
    case "NotAllowedError":
      // User cancelled passkey prompt
      break;
    case "NotFoundError":
      // No passkey for this site
      break;
    case "SecurityError":
      // Not HTTPS
      break;
    case "InvalidStateError":
      // Passkey already registered
      break;
    default:
      console.error(result.error);
  }
}
```

## Types

```typescript
import type { ZKCredential, SignUpResult, SignInResult } from "@ursalock/client";

interface SignUpResult {
  success: boolean;
  credential?: ZKCredential;
  error?: string;
}

interface SignInResult {
  success: boolean;
  credential?: ZKCredential;
  error?: string;
}

interface ZKCredential {
  jwt: string;
  cipherJwk: CipherJWK;
}
```

## Full Example

```tsx
import { useState } from "react";
import { VaultClient, useSignUp, useSignIn, usePasskeySupport, type ZKCredential } from "@ursalock/client";

const vaultClient = new VaultClient({
  serverUrl: "https://vault.example.com",
});

function Auth({ onAuth }: { onAuth: (c: ZKCredential) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  
  const supportsPasskey = usePasskeySupport(vaultClient);
  const { signUp, isLoading: isSigningUp } = useSignUp(vaultClient);
  const { signIn, isLoading: isSigningIn } = useSignIn(vaultClient);
  
  const isLoading = isSigningUp || isSigningIn;

  if (!supportsPasskey) {
    return <p>Passkeys not supported</p>;
  }

  const handleAuth = async () => {
    setError(null);
    const fn = mode === "signup" ? signUp : signIn;
    const result = await fn({ usePasskey: true });
    
    if (result.success && result.credential) {
      onAuth(result.credential);
    } else {
      setError(result.error ?? "Authentication failed");
    }
  };

  return (
    <div>
      {error && <p style={{ color: "red" }}>{error}</p>}
      
      <button onClick={handleAuth} disabled={isLoading}>
        {isLoading ? "..." : mode === "signup" ? "Sign Up" : "Sign In"}
      </button>
      
      <button onClick={() => setMode(m => m === "signin" ? "signup" : "signin")}>
        {mode === "signin" ? "Create account" : "Sign in instead"}
      </button>
    </div>
  );
}
```
