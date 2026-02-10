---
title: Authentication
description: Passkey-based authentication with WebAuthn PRF
---

ursalock uses **passkey-only** authentication via WebAuthn. The passkey not only authenticates you but also derives the encryption key for your data.

## How It Works

1. **Registration**: Create a passkey → server stores your `opaqueId` (hash of passkey)
2. **Authentication**: Use passkey → WebAuthn PRF derives your `cipherJwk`
3. **Encryption**: Your Zustand store encrypts/decrypts using that `cipherJwk`

The server never sees your passkey or encryption key — only the `opaqueId` for identification.

## Setup

```typescript
import { VaultClient } from "@ursalock/client";

export const vaultClient = new VaultClient({
  serverUrl: "https://vault.example.com",
});
```

## React Hooks

### useSignUp

Register a new user with a passkey.

```typescript
import { useSignUp } from "@ursalock/client";

function SignUpButton() {
  const { signUp, isLoading, error } = useSignUp(vaultClient);

  const handleSignUp = async () => {
    const result = await signUp({ usePasskey: true });
    
    if (result.success && result.credential) {
      // result.credential contains:
      // - jwt: auth token for server requests
      // - cipherJwk: encryption key for your store
      initializeStore(result.credential.cipherJwk);
    } else {
      console.error(result.error);
    }
  };

  return (
    <button onClick={handleSignUp} disabled={isLoading}>
      {isLoading ? "Creating passkey..." : "Sign Up"}
    </button>
  );
}
```

### useSignIn

Authenticate an existing user.

```typescript
import { useSignIn } from "@ursalock/client";

function SignInButton() {
  const { signIn, isLoading, error } = useSignIn(vaultClient);

  const handleSignIn = async () => {
    const result = await signIn({ usePasskey: true });
    
    if (result.success && result.credential) {
      initializeStore(result.credential.cipherJwk);
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

Check if the browser supports WebAuthn.

```typescript
import { usePasskeySupport } from "@ursalock/client";

function AuthGate({ children }) {
  const supportsPasskey = usePasskeySupport(vaultClient);

  if (!supportsPasskey) {
    return <div>Your browser doesn't support passkeys.</div>;
  }

  return children;
}
```

## The ZKCredential Object

Both `signUp` and `signIn` return a `ZKCredential` on success:

```typescript
interface ZKCredential {
  jwt: string;        // Auth token for server requests
  cipherJwk: CipherJWK; // Encryption key for your store
}
```

- **jwt**: Short-lived token, stored in localStorage, refreshed automatically
- **cipherJwk**: Derived from passkey via PRF, lives only in memory (lost on refresh)

## Session Management

### Get Auth Header

```typescript
const header = vaultClient.getAuthHeader();
// { "Authorization": "Bearer <jwt>" }

// Use in fetch calls
fetch("/api/protected", { headers: header });
```

### Get Token

```typescript
const token = vaultClient.getToken();
// Returns JWT string or null
```

### Check Auth Status

```typescript
if (vaultClient.isAuthenticated()) {
  // Has valid JWT (but might need re-auth for cipherJwk)
}
```

### Logout

```typescript
await vaultClient.logout();
// Clears JWT from localStorage
```

## Re-Authentication Pattern

The `cipherJwk` is derived from the passkey at authentication time and lives only in memory. After a page refresh:
- The **JWT** is still in localStorage ✓
- The **cipherJwk** is gone ✗

You need to detect this and prompt for re-authentication:

```tsx
function App() {
  const [credential, setCredential] = useState<ZKCredential | null>(null);

  // Check if we need re-auth
  const hasJwt = vaultClient.isAuthenticated();
  const hasCipherKey = credential !== null;
  const needsReauth = hasJwt && !hasCipherKey;

  if (!hasJwt || needsReauth) {
    return <Auth onAuthenticated={setCredential} />;
  }

  return <MainApp />;
}
```

## Cross-Device Sync

For passkeys to work across devices, they must be synced by your passkey provider:

| Provider | Syncs Passkeys | Same rawId Across Devices |
|----------|---------------|---------------------------|
| iCloud Keychain | ✅ Yes | ✅ Yes |
| Google Password Manager | ✅ Yes | ✅ Yes |
| Proton Pass | ✅ Yes | ✅ Yes |
| Hardware keys (YubiKey) | ❌ No | ❌ No (per-device) |

**Important**: The `opaqueId` (user identity) is derived from the passkey's `rawId`. If your passkey provider syncs the same credential across devices, you'll have the same identity and data everywhere.

## Error Handling

```typescript
const result = await signIn({ usePasskey: true });

if (!result.success) {
  switch (result.error) {
    case "NotAllowedError":
      // User cancelled the passkey prompt
      break;
    case "NotFoundError":
      // No passkey found for this site
      break;
    case "SecurityError":
      // Insecure context (needs HTTPS)
      break;
    default:
      // Other error
      console.error(result.error);
  }
}
```

## Complete Auth Component

```tsx
import { useState } from "react";
import { useSignUp, useSignIn, usePasskeySupport, type ZKCredential } from "@ursalock/client";
import { vaultClient } from "../lib/vault-client";

interface AuthProps {
  onAuthenticated: (credential: ZKCredential) => void;
}

export function Auth({ onAuthenticated }: AuthProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);

  const supportsPasskey = usePasskeySupport(vaultClient);
  const { signUp, isLoading: isSigningUp } = useSignUp(vaultClient);
  const { signIn, isLoading: isSigningIn } = useSignIn(vaultClient);
  
  const isLoading = isSigningUp || isSigningIn;

  if (!supportsPasskey) {
    return <div>Passkeys not supported. Use Chrome, Safari, Firefox, or Edge.</div>;
  }

  const handleAuth = async () => {
    setError(null);
    try {
      const fn = mode === "signup" ? signUp : signIn;
      const result = await fn({ usePasskey: true });
      
      if (result.success && result.credential) {
        onAuthenticated(result.credential);
      } else {
        setError(result.error ?? "Authentication failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  return (
    <div>
      <h1>{mode === "signup" ? "Create Account" : "Sign In"}</h1>
      
      {error && <div className="error">{error}</div>}
      
      <button onClick={handleAuth} disabled={isLoading}>
        {isLoading ? "..." : `${mode === "signup" ? "Create" : "Sign in with"} Passkey`}
      </button>
      
      <p>
        {mode === "signin" ? "No account? " : "Have an account? "}
        <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Sign up" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
```

## Security Notes

1. **HTTPS required** — WebAuthn only works on secure origins
2. **Same origin** — Passkeys are bound to your domain (rpId)
3. **No password fallback** — This is passkey-only by design
4. **PRF extension** — Required for key derivation (Chrome 116+, Safari 17+)
