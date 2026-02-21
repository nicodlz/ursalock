# Auth Security Fixes — Summary

Applied 2026-02-21. All fixes in `packages/server/src/`.

## 1. JWT Secret Validation (C-02 CRITICAL) ✅
**File:** `env.ts`

- JWT_SECRET is now validated to be ≥ 32 chars **in all environments**, including test
- In test env without JWT_SECRET set, a secure default (`TEST_JWT_SECRET`) is auto-provided
- Validation happens **before** the Zod schema parsing, so no code path can bypass it
- Empty or short secrets throw immediately with a clear error message

## 2. JWT Secret Rotation (H-05 HIGH) ✅
**File:** `features/auth/jwt.ts`

- `JWT_SECRET` now supports comma-separated secrets (e.g. `newSecret,oldSecret`)
- First secret = **current** (used by `createToken()` for signing)
- Subsequent secrets = **previous** (accepted by `verifyToken()` for verification)
- `verifyToken()` tries current first, then falls back to older secrets sequentially
- Logs a `console.warn` when a token is validated with a rotated (non-current) secret, including `sub` and secret index
- `createToken()` always uses the first (current) secret

## 3. ZKC Origin Validation (C-05 CRITICAL) ✅
**File:** `api/auth/zkc.ts`

- Added `getRpConfigFromRequest(c)` call at the top of both `/register` and `/authenticate` handlers
- Imported from `#features/auth/origin.js` (same pattern as `passkey.ts`)
- Invalid origins are rejected with 403 before any business logic executes

## 4. Passkey Counter Verification (H-04 HIGH) ✅
**File:** `api/auth/passkey.ts`

- After `verifyAuthenticationResponse()`, checks that `newCounter > passkey.counter`
- If `newCounter > 0 && newCounter <= storedCounter`: 
  - Logs a `[SECURITY]` warning with credentialId, both counters, and userId
  - Rejects authentication with 401 and explicit message about possible cloned authenticator
- Counter value of 0 is allowed (some authenticators don't implement counters)

## 5. Challenge Store Improvement (C-03 CRITICAL) ✅
**File:** `api/auth/passkey.ts`

- Added `MAX_CHALLENGES = 1000` capacity limit
- New helper functions: `setChallenge()`, `getChallenge()`, `pruneExpiredChallenges()`, `evictOldestChallenges()`
- Expired entries are pruned on **every access** (not just the periodic interval)
- `getChallenge()` checks expiry inline and deletes stale entries immediately
- When at capacity, oldest entries are evicted (Map insertion-order = LRU-like)
- Periodic `setInterval` cleanup retained as safety net
- JSDoc documents that **Redis should be used in production** for multi-instance deployments

## Notes
- All changes respect the existing code style (Darika patterns, JSDoc, no `any`)
- Pre-existing test failures (CSRF middleware, TS type issues) were not introduced by these changes
- No new `any` types introduced
