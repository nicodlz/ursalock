# API Reference

## @ursalock/crypto

### `generateRecoveryKey()`

Generate a cryptographically secure recovery key.

```typescript
import { generateRecoveryKey } from "@ursalock/crypto";

const key = generateRecoveryKey();
// => "ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-Q"
```

### `validateRecoveryKey(key: string)`

Validate a recovery key format.

```typescript
import { validateRecoveryKey } from "@ursalock/crypto";

validateRecoveryKey("ABCD-EFGH-..."); // => true
validateRecoveryKey("invalid");       // => false
```

### `encrypt(data: string, recoveryKey: string)`

Encrypt data with a recovery key.

```typescript
import { encrypt } from "@ursalock/crypto";

const { ciphertext, salt } = await encrypt("secret data", recoveryKey);
```

### `decrypt(ciphertext: string, salt: string, recoveryKey: string)`

Decrypt data with a recovery key.

```typescript
import { decrypt } from "@ursalock/crypto";

const plaintext = await decrypt(ciphertext, salt, recoveryKey);
```

---

## @ursalock/zustand

### `vault(initializer, options)`

Middleware that adds encrypted persistence and cloud sync to a Zustand store.

```typescript
import { create } from "zustand";
import { vault } from "@ursalock/zustand";

const useStore = create(
  vault(
    (set, get) => ({
      count: 0,
      increment: () => set((s) => ({ count: s.count + 1 })),
    }),
    {
      name: "my-store",
      recoveryKey: "ABCD-EFGH-...",
      server: "https://vault.example.com",
      getToken: () => client.getToken(),
    }
  )
);
```

#### Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `name` | `string` | Yes | - | Unique identifier for this vault |
| `recoveryKey` | `string` | Yes | - | Encryption key |
| `server` | `string` | No | - | Server URL for cloud sync |
| `getToken` | `() => string \| null` | No | - | Auth token getter (required if server set) |
| `partialize` | `(state) => partial` | No | `(s) => s` | Select which state to persist |
| `merge` | `(persisted, current) => merged` | No | `Object.assign` | How to merge persisted state |
| `skipHydration` | `boolean` | No | `false` | Skip auto-hydration on init |
| `syncInterval` | `number` | No | `30000` | Auto-sync interval in ms (0 to disable) |

#### Store Extensions

The middleware adds a `vault` object to the store:

```typescript
useStore.vault.sync()           // Full bidirectional sync
useStore.vault.push()           // Push local changes to server
useStore.vault.pull()           // Pull latest from server
useStore.vault.rehydrate()      // Reload from local storage
useStore.vault.hasHydrated()    // Check if hydration complete
useStore.vault.getSyncStatus()  // "idle" | "syncing" | "synced" | "error" | "offline"
useStore.vault.hasPendingChanges() // Check offline queue
useStore.vault.clearStorage()   // Delete all stored data
```

---

## @ursalock/client

### `VaultClient`

Main client for authentication and API access.

```typescript
import { VaultClient } from "@ursalock/client";

const client = new VaultClient({
  serverUrl: "https://vault.example.com",
  rpName: "My App",        // For passkeys (optional)
  preferPasskey: true,     // Prefer passkey over email (optional)
  storageKey: "my-auth",   // LocalStorage key (optional)
});
```

#### Methods

```typescript
// Email auth
await client.registerEmail(email, password)  // Register new user
await client.loginEmail(email, password)     // Login existing user

// Passkey auth (WebAuthn)
await client.registerPasskey()               // Register passkey
await client.loginPasskey()                  // Login with passkey

// Session management
client.getToken()                            // Get current access token
client.getUser()                             // Get current user
client.isAuthenticated()                     // Check auth status
await client.logout()                        // Logout and clear tokens
await client.refreshToken()                  // Manually refresh token

// State subscription
client.subscribe((state) => {
  console.log(state.isAuthenticated, state.user);
});
```

### `useVaultAuth(client)`

React hook for auth state.

```typescript
import { useVaultAuth } from "@ursalock/client";

function Component() {
  const {
    isAuthenticated,
    isLoading,
    user,
    error,
    login,       // (email, password) => Promise
    register,    // (email, password) => Promise
    logout,      // () => Promise
  } = useVaultAuth(client);
}
```

### `useVaultSync(store)`

React hook for sync state.

```typescript
import { useVaultSync } from "@ursalock/client";

function Component() {
  const {
    status,          // "idle" | "syncing" | "synced" | "error" | "offline"
    hasPending,      // boolean
    sync,            // () => Promise
    push,            // () => Promise
    pull,            // () => Promise
  } = useVaultSync(useMyStore);
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

#### Auth

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

#### Vaults

```
GET /vault
  Headers: Authorization: Bearer <token>
  Returns: { vaults: Vault[] }

POST /vault
  Headers: Authorization: Bearer <token>
  Body: { name: string, data: string, salt: string }
  Returns: { vault: Vault }

GET /vault/:uid
  Headers: Authorization: Bearer <token>
  Returns: { vault: Vault }

PUT /vault/:uid
  Headers: Authorization: Bearer <token>
  Body: { data: string, salt: string }
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
  data: string;      // Encrypted blob
  salt: string;      // Encryption salt
  version: number;   // For conflict resolution
  updatedAt: number; // Unix timestamp
}
```
