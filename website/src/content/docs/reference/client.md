---
title: "@zod-vault/client"
description: Authentication client API reference
---

Passkey-based authentication client for zod-vault.

## Installation

```bash
npm install @zod-vault/client
```

## VaultClient

The main client for authentication and session management.

```typescript
import { VaultClient } from "@zod-vault/client";

const vaultClient = new VaultClient({
  serverUrl: "https://vault.example.com",
});
```

### Constructor Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `serverUrl` | `string` | Yes | - | Base URL of your zod-vault server |

## React Hooks

### useSignUp

Register a new user with a passkey.

```typescript
import { useSignUp } from "@zod-vault/client";

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
import { useSignIn } from "@zod-vault/client";

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
import { usePasskeySupport } from "@zod-vault/client";

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
- Used by `@zod-vault/zustand` for encryption

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
import type { ZKCredential, SignUpResult, SignInResult } from "@zod-vault/client";

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
import { VaultClient, useSignUp, useSignIn, usePasskeySupport, type ZKCredential } from "@zod-vault/client";

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
