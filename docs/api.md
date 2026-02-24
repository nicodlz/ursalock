# API Reference

## @ursalock/crypto

### `deriveVaultKeys(masterKey: Uint8Array, vaultUid: string)`

Derive vault-specific encryption and HMAC keys using HKDF.

```typescript
import { deriveVaultKeys, base64urlToBytes } from "@ursalock/crypto";

const masterKey = base64urlToBytes(cipherJwk.k);
const keys = await deriveVaultKeys(masterKey, vaultUid);
// => { encryptionKey: CryptoKey, hmacKey: CryptoKey }
```

### `base64urlToBytes(str: string)`

Convert base64url string to Uint8Array.

```typescript
import { base64urlToBytes } from "@ursalock/crypto";

const bytes = base64urlToBytes("SGVsbG8");
```

### `bytesToBase64url(bytes: Uint8Array)`

Convert Uint8Array to base64url string.

```typescript
import { bytesToBase64url } from "@ursalock/crypto";

const str = bytesToBase64url(new Uint8Array([72, 101, 108, 108, 111]));
// => "SGVsbG8"
```

---

## @ursalock/client

### `VaultClient`

Main client for authentication and API access.

```typescript
import { VaultClient } from "@ursalock/client";

const vaultClient = new VaultClient({
  serverUrl: "https://vault.example.com",
});
```

#### Methods

```typescript
// Get auth header for API requests
vaultClient.getAuthHeader()      // => { "Authorization": "Bearer ..." }

// Get raw JWT token
vaultClient.getToken()           // => "eyJ..." | null

// Check authentication status
vaultClient.isAuthenticated()    // => boolean

// Logout and clear session
await vaultClient.logout()

// Make authenticated requests
const res = await vaultClient.fetch("/vault/by-name/my-app");
```

### React Hooks

#### `useSignUp(vaultClient)`

```typescript
import { useSignUp } from "@ursalock/client";

const { signUp, isLoading, error } = useSignUp(vaultClient);

const result = await signUp({ usePasskey: true });
if (result.success) {
  // result.credential.jwt
  // result.credential.cipherJwk
}
```

#### `useSignIn(vaultClient)`

```typescript
import { useSignIn } from "@ursalock/client";

const { signIn, isLoading, error } = useSignIn(vaultClient);

const result = await signIn({ usePasskey: true });
```

#### `usePasskeySupport(vaultClient)`

```typescript
import { usePasskeySupport } from "@ursalock/client";

const supportsPasskey = usePasskeySupport(vaultClient);
```

### `DocumentClient`

Client for encrypted document storage.

```typescript
import { DocumentClient } from "@ursalock/client";

const docClient = new DocumentClient({
  serverUrl: "https://vault.example.com",
  vaultUid: "vault-123",
  encryptionKey: keys.encryptionKey,
  hmacKey: keys.hmacKey,
  getAuthHeader: () => vaultClient.getAuthHeader(),
});
```

#### Collections

```typescript
interface Note {
  title: string;
  content: string;
}

const notes = docClient.collection<Note>("notes");

// Create
const doc = await notes.create({ title: "Hello", content: "World" });

// Get
const fetched = await notes.get(doc.uid);

// List
const allNotes = await notes.list();
const recent = await notes.list({ since: timestamp, limit: 10 });

// Update (optimistic locking)
const updated = await notes.replace(doc.uid, newContent, doc.version);

// Delete (soft delete)
await notes.delete(doc.uid);
```

#### Document Type

```typescript
interface Document<T> {
  uid: string;
  vaultUid: string;
  collection: string;
  content: T;          // Decrypted plaintext
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}
```

---

## @ursalock/server

### Server Setup

```typescript
import { createServer } from "@ursalock/server";

const server = createServer({
  jwtSecret: process.env.JWT_SECRET,
  dbPath: "./data/vault.db",
});

server.listen(3000);
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | Secret for signing JWTs |
| `JWT_ISSUER` | No | `ursalock` | JWT issuer claim |
| `JWT_ACCESS_EXPIRY` | No | `15m` | Access token expiry |
| `JWT_REFRESH_EXPIRY` | No | `7d` | Refresh token expiry |
| `DB_PATH` | No | `./data/vault.db` | SQLite database path |
| `PORT` | No | `3000` | Server port |

### API Endpoints

#### Auth Endpoints

```
POST /auth/email/register
  Body: { email: string, password: string }
  Returns: { accessToken, refreshToken, user }

POST /auth/email/login
  Body: { email: string, password: string }
  Returns: { accessToken, refreshToken, user }

GET /auth/me
  Headers: Authorization: Bearer <token>
  Returns: { user }

POST /auth/refresh
  Body: { refreshToken: string }
  Returns: { accessToken, refreshToken }

POST /auth/logout
  Headers: Authorization: Bearer <token>
  Returns: { success: true }
```

#### Vault Endpoints

Vaults are containers for documents (no data/salt).

```
GET /vault
  Headers: Authorization: Bearer <token>
  Returns: { vaults: Vault[] }

POST /vault
  Headers: Authorization: Bearer <token>
  Body: { name: string }
  Returns: { vault: Vault }

GET /vault/:uid
  Headers: Authorization: Bearer <token>
  Returns: { vault: Vault }

GET /vault/by-name/:name
  Headers: Authorization: Bearer <token>
  Returns: { vault: Vault }

DELETE /vault/:uid
  Headers: Authorization: Bearer <token>
  Returns: { success: true }
```

#### Vault Object

```typescript
interface Vault {
  uid: string;
  name: string;
  version: number;
  updatedAt: number;
}
```

#### Document Endpoints

Documents contain encrypted data within vaults.

```
POST /vaults/:vaultUid/documents
  Headers: Authorization: Bearer <token>
  Body: { collection: string, data: string, hmac?: string }
  Returns: { document: Document }

GET /vaults/:vaultUid/documents
  Headers: Authorization: Bearer <token>
  Query: ?collection=...&since=...&limit=...
  Returns: { documents: Document[] }

GET /vaults/:vaultUid/documents/:uid
  Headers: Authorization: Bearer <token>
  Returns: { document: Document }

PUT /vaults/:vaultUid/documents/:uid
  Headers: Authorization: Bearer <token>
  Body: { data: string, hmac?: string, version: number }
  Returns: { document: Document }
  Note: Returns 409 if version doesn't match (conflict)

DELETE /vaults/:vaultUid/documents/:uid
  Headers: Authorization: Bearer <token>
  Returns: { success: true }
  Note: Soft delete (sets deletedAt timestamp)
```

#### Document Object

```typescript
interface Document {
  uid: string;
  vaultUid: string;
  collection: string;
  data: string;        // Base64-encoded encrypted ciphertext
  hmac?: string;       // Optional HMAC for integrity verification
  version: number;     // For optimistic locking
  createdAt: number;   // Unix timestamp
  updatedAt: number;
  deletedAt?: number;  // Soft delete timestamp
}
```

#### API Key Endpoints

```
POST /auth/api-keys
  Headers: Authorization: Bearer <token>
  Body: { name: string, expiresAt?: number }
  Returns: { uid, name, key, expiresAt, createdAt }
  Note: The key field is only returned once

GET /auth/api-keys
  Headers: Authorization: Bearer <token>
  Returns: { keys: ApiKey[] }

DELETE /auth/api-keys/:uid
  Headers: Authorization: Bearer <token>
  Returns: { success: true }
```

---

## @ursalock/zustand (Deprecated)

:::danger[Deprecated Package]
`@ursalock/zustand` is **deprecated** due to a critical security bug that sent plaintext data to the server, defeating E2E encryption.

Use `@ursalock/client`'s `DocumentClient` with a plain Zustand store instead. See the [Migration Guide](/guides/migration/).
:::
