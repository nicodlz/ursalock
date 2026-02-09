---
title: "@zod-vault/client"
description: Auth client and React hooks API reference
---

Authentication client with passkeys and email support, plus React hooks.

## VaultClient

Main client for auth and API access.

```typescript
import { VaultClient } from "@zod-vault/client";

const client = new VaultClient({
  serverUrl: "https://vault.example.com",
  rpName: "My App",
  preferPasskey: true,
  storageKey: "my-auth",
});
```

### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serverUrl` | `string` | Required | Server URL |
| `rpName` | `string` | `"zod-vault"` | Relying party name for passkeys |
| `preferPasskey` | `boolean` | `true` | Try passkey before email |
| `storageKey` | `string` | `"zod-vault:auth"` | localStorage key for tokens |

### Methods

#### registerEmail

```typescript
const result = await client.registerEmail(email, password);
// => { accessToken, refreshToken, user }
```

#### loginEmail

```typescript
const result = await client.loginEmail(email, password);
// => { accessToken, refreshToken, user }
```

#### registerPasskey

```typescript
await client.registerPasskey();
// Prompts browser for passkey creation
```

#### loginPasskey

```typescript
await client.loginPasskey();
// Prompts browser for passkey
```

#### getToken

```typescript
const token = client.getToken();
// => string | null
```

#### getUser

```typescript
const user = client.getUser();
// => { id: string, email: string } | null
```

#### isAuthenticated

```typescript
if (client.isAuthenticated()) {
  // User is logged in
}
```

#### logout

```typescript
await client.logout();
```

#### refreshToken

```typescript
await client.refreshToken();
```

#### subscribe

```typescript
const unsubscribe = client.subscribe((state) => {
  console.log(state.isAuthenticated, state.user);
});
```

## useVaultAuth

React hook for auth state.

```typescript
import { useVaultAuth } from "@zod-vault/client";

function Component() {
  const {
    isAuthenticated,
    isLoading,
    user,
    error,
    login,
    register,
    logout,
  } = useVaultAuth(client);
}
```

### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `isAuthenticated` | `boolean` | Whether user is logged in |
| `isLoading` | `boolean` | Initial auth check in progress |
| `user` | `User \| null` | Current user |
| `error` | `Error \| null` | Last auth error |
| `login` | `(email, password) => Promise` | Login function |
| `register` | `(email, password) => Promise` | Register function |
| `logout` | `() => Promise` | Logout function |

## useVaultSync

React hook for sync state.

```typescript
import { useVaultSync } from "@zod-vault/client";

function Component() {
  const {
    status,
    hasPending,
    sync,
    push,
    pull,
  } = useVaultSync(useStore);
}
```

### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `status` | `SyncStatus` | Current sync status |
| `hasPending` | `boolean` | Offline queue has items |
| `sync` | `() => Promise` | Full sync |
| `push` | `() => Promise` | Push to server |
| `pull` | `() => Promise` | Pull from server |

## Types

```typescript
interface User {
  id: string;
  email: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  error: Error | null;
}

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: User;
}
```
