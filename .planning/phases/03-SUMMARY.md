# Phase 3 Summary: Authentication

## Deliverables
- `@ursalock/client` package (20.03 KB)
- PasskeyAuth - WebAuthn client
- EmailAuth - Email/password fallback
- TokenManager - JWT with auto-refresh
- VaultClient - Unified auth + API
- React hooks (optional, tree-shakeable)

## Files Created/Modified
- `packages/client/src/passkey.ts` - WebAuthn using @simplewebauthn/browser
- `packages/client/src/email.ts` - Email/password auth
- `packages/client/src/token.ts` - JWT management + refresh
- `packages/client/src/client.ts` - Main VaultClient
- `packages/client/src/hooks.ts` - React hooks (NEW)
- `packages/client/src/types.ts` - Auth types
- `packages/client/src/index.test.ts` - 15 tests

## API Surface

### VaultClient
```typescript
const client = new VaultClient({
  serverUrl: 'https://api.example.com',
  rpName: 'My App', // For passkeys
  preferPasskey: true,
})

// Sign up
const result = await client.signUp({ email, password })
// or with passkey
const result = await client.signUp({ usePasskey: true })

// Sign in
const result = await client.signIn({ usePasskey: true })

// Sign out
await client.signOut()

// Get auth state
const state = client.getState()
// { isAuthenticated, user, isLoading, error }

// Make authenticated requests
const response = await client.fetch('/api/vault/123')
```

### TokenManager
```typescript
const tokens = new TokenManager({
  serverUrl: 'https://api.example.com',
  autoRefresh: true,
  refreshBuffer: 5 * 60 * 1000, // 5 min before expiry
})

// Manual refresh
await tokens.refresh()
```

### React Hooks
```typescript
// Subscribe to auth state
const { isAuthenticated, user, isLoading } = useAuth(client)

// Actions
const { signUp } = useSignUp(client)
const { signIn } = useSignIn(client)
const signOut = useSignOut(client)

// Helpers
const user = useUser(client)
const supportsPasskey = usePasskeySupport(client)
```

## Requirements Coverage
| REQ | Description | Status |
|-----|-------------|--------|
| REQ-020 | Passkeys (WebAuthn) | ✅ |
| REQ-021 | Email/password fallback | ✅ |
| REQ-022 | JWT token management | ✅ |
| REQ-023 | Token refresh sliding expiry | ✅ |

## Test Coverage
| Module | Tests | Status |
|--------|-------|--------|
| TokenManager | 9 | ✅ |
| EmailAuth | 4 | ✅ |
| PasskeyAuth | 2 | ✅ |
| **Total** | **15** | ✅ |

## Dependencies
- `@simplewebauthn/browser` - WebAuthn client library
- `react` (peer, optional) - For hooks

## Bundle Size
- Runtime: 20.03 KB
- Types: 9.94 KB
- Hooks are tree-shakeable (not included if not imported)

## Commits
- `709beb0`: Complete auth package

## Duration
~30 minutes (code was partially pre-written)

## Next Phase
Phase 4: Backend API (Hono + SQLite)
