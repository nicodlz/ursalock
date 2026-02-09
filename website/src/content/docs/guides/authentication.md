---
title: Authentication
description: Setting up auth with passkeys and email
---

zod-vault provides a unified auth client with passkeys (WebAuthn) and email/password support.

## Setup

```typescript
import { VaultClient } from "@zod-vault/client";

const client = new VaultClient({
  serverUrl: "https://vault.example.com",
  rpName: "My App",           // For passkey prompts
  preferPasskey: true,        // Try passkey first
});
```

## Email Authentication

### Register

```typescript
try {
  const result = await client.registerEmail("user@example.com", "password123");
  console.log("Registered:", result.user);
} catch (error) {
  console.error("Registration failed:", error.message);
}
```

### Login

```typescript
try {
  const result = await client.loginEmail("user@example.com", "password123");
  console.log("Logged in:", result.user);
} catch (error) {
  console.error("Login failed:", error.message);
}
```

## Passkey Authentication

Passkeys are the recommended auth method — phishing-resistant and no password to remember.

### Register Passkey

```typescript
// User must be logged in first (via email)
await client.registerPasskey();
// Browser prompts for biometric/security key
```

### Login with Passkey

```typescript
await client.loginPasskey();
// Browser prompts for saved passkey
```

## React Hooks

### useVaultAuth

```typescript
import { useVaultAuth } from "@zod-vault/client";

function AuthComponent() {
  const {
    isAuthenticated,  // boolean
    isLoading,        // boolean
    user,             // { id, email } | null
    error,            // Error | null
    login,            // (email, password) => Promise
    register,         // (email, password) => Promise
    logout,           // () => Promise
  } = useVaultAuth(client);

  if (isLoading) return <Loading />;

  if (!isAuthenticated) {
    return (
      <button onClick={() => login("user@example.com", "password")}>
        Login
      </button>
    );
  }

  return (
    <div>
      <p>Logged in as {user.email}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

## Session Management

### Get Current Token

```typescript
const token = client.getToken();
// Pass this to vault() getToken option
```

### Get Current User

```typescript
const user = client.getUser();
// => { id: "...", email: "user@example.com" } | null
```

### Check Auth Status

```typescript
if (client.isAuthenticated()) {
  // User is logged in
}
```

### Logout

```typescript
await client.logout();
// Clears tokens and notifies server
```

### Token Refresh

Tokens refresh automatically. To force a refresh:

```typescript
await client.refreshToken();
```

## State Subscription

Subscribe to auth state changes:

```typescript
const unsubscribe = client.subscribe((state) => {
  console.log("Auth changed:", state.isAuthenticated);
});

// Later
unsubscribe();
```

## Error Handling

```typescript
try {
  await client.loginEmail(email, password);
} catch (error) {
  if (error.code === "INVALID_CREDENTIALS") {
    // Wrong email/password
  } else if (error.code === "USER_NOT_FOUND") {
    // No account with this email
  } else if (error.code === "NETWORK_ERROR") {
    // Server unreachable
  }
}
```

## Best Practices

1. **Prefer passkeys** — More secure than passwords
2. **Store recovery key separately** — Not tied to auth account
3. **Handle offline state** — Auth may fail without network
4. **Clear sensitive data on logout** — Consider clearing vault too
