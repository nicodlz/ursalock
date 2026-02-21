# Server Security Fixes — Summary

Applied 2026-02-21. All changes compile with zero new TypeScript errors.

## Fixes Applied

### 1. Rate Limiting (C-01 CRITICAL) ✅
- **Created** `packages/server/src/features/auth/rate-limit.ts`
- Sliding window by IP, in-memory store with periodic cleanup
- Standard headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`
- Auth routes: 10 req/60s — Global: 100 req/60s
- Applied in `app.ts`: global middleware + stricter `/auth/*` layer

### 2. Security Headers (H-02 HIGH) ✅
- **Modified** `app.ts` — `secureHeaders()` now configured with:
  - HSTS: `max-age=63072000; includeSubDomains; preload`
  - CSP: `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `connect-src 'self'`, `frame-ancestors 'none'`
  - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`

### 3. CSRF Protection (C-04 CRITICAL) ✅
- **Created** `packages/server/src/features/auth/csrf.ts`
- Double-submit cookie pattern (`__csrf` cookie ↔ `X-CSRF-Token` header)
- Skips GET/HEAD/OPTIONS, rotates token after each validation
- Applied globally in `app.ts`

### 4. CORS Validation Stricte (M-06 MEDIUM) ✅
- **Modified** `env.ts` — `RP_ORIGINS` now validated as proper URLs via Zod `.refine()`
- HTTPS enforced in production
- **Exported** `getAllowedOrigins()` helper
- **Modified** `app.ts` — dynamic `origin` function instead of static array; also exposes rate-limit headers

### 5. Input Validation (M-04 MEDIUM) ✅
- **Modified** `api/schemas.ts`:
  - `data` max reduced to 5 MB
  - `salt` max reduced to 64 chars
  - Base64 regex on `data` and `salt`
  - Alphanumeric regex on vault `name` (allows hyphens/underscores)
  - Named constants (`MAX_DATA_SIZE`, `MAX_SALT_LENGTH`, `BASE64_RE`, `VAULT_NAME_RE`)

### 6. Auth Failure Logging (M-02 MEDIUM) ✅
- **Created** `packages/server/src/features/auth/audit-log.ts`
  - `AuthAuditEvent` interface, `logAuthEvent()` structured JSON, `extractRequestMeta()` helper
- **Modified** `api/auth/passkey.ts` — logs `passkey_register_fail` and `passkey_login_fail`
- **Modified** `api/auth/zkc.ts` — logs `zkc_register_fail` and `zkc_auth_fail`

### 7. Session Limits (H-03 HIGH) ✅
- **Modified** `db/client.ts` — `createSession()` now:
  - Counts active sessions for the user
  - Evicts the oldest when `>= MAX_SESSIONS` (10)
  - `deleteExpiredSessions()` already existed

### 8. Session Cleanup (L-03 LOW) ✅
- Already present in `server.ts` (hourly `setInterval` calling `deleteExpiredSessions()` with logging) — **no changes needed**.

## Files Changed
| File | Action |
|------|--------|
| `features/auth/rate-limit.ts` | Created |
| `features/auth/csrf.ts` | Created |
| `features/auth/audit-log.ts` | Created |
| `app.ts` | Modified (headers, CORS, CSRF, global rate limit) |
| `env.ts` | Modified (origin validation, `getAllowedOrigins` export) |
| `api/schemas.ts` | Modified (stricter validation) |
| `api/auth/passkey.ts` | Modified (audit logging) |
| `api/auth/zkc.ts` | Modified (audit logging) |
| `db/client.ts` | Modified (session limits) |
