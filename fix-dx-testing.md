# Fix DX & Testing Summary

Applied on: 2026-02-21

## Changes

### 1. ✅ Fix Turbo Build
- Added `packageManager` field to root `package.json` (required by turbo 2.8+)
- Created `turbo.json` with task pipeline configuration
- Changed all root scripts to use `npx turbo run ...` (no global turbo needed)
- Tests run independently (no build dependency — vitest uses source directly via tsx)
- **Status**: `npm test` works. Server: 36/36 tests pass. Crypto: all pass. Client has 1 pre-existing failure (not related).

### 2. ✅ ESLint + Prettier Setup
- Created `.eslintrc.cjs` with `@typescript-eslint` parser, recommended rules, `no-explicit-any: error`, `consistent-type-imports`
- Created `.prettierrc` with double quotes (matching existing code style), trailing commas, 2-space tabs
- Added `lint:eslint`, `format`, `format:check` scripts to root `package.json`
- **Note**: Dependencies not installed — run `npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier`

### 3. ✅ CI/CD Pipeline
- Created `.github/workflows/ci.yml` with 4 jobs: typecheck, lint, test, audit
- Node 22, npm ci, npm cache

### 4. ✅ CONTRIBUTING.md
- Setup instructions, package structure table, all dev commands
- PR standards, conventional commit conventions
- Security guidelines specific to crypto projects

### 5. ✅ SECURITY.md
- Responsible disclosure policy with contact email
- Supported versions table
- Contributor security guidelines (no custom IVs, no key logging, use crypto.getRandomValues, etc.)

### 6. ✅ Server Tests
- Created `packages/server/src/__tests__/vault.test.ts` (10 tests):
  - Create, read (owner only), list, update, delete vault
  - 401 without token, 401 with invalid token
  - Cross-user access prevention (returns 404, not 403)
  - 404 for non-existent vault
- Created `packages/server/src/__tests__/auth.test.ts` (8 tests):
  - JWT validation (missing header, malformed, invalid, revoked session)
  - Rate limiting (headers present, enforced after max)
  - Security headers (X-Content-Type-Options, X-Frame-Options)
- **Fixed existing `index.test.ts`** — was broken by CSRF middleware addition (all 18 tests now pass)
- All tests handle CSRF double-submit cookie pattern correctly
- Each test file creates fresh app instances to avoid rate limiter state leaking between tests

## Pre-existing Issues (not addressed)
- `@ursalock/crypto` build fails (DTS error: SharedArrayBuffer type mismatch) — affects `npm run build`
- `@ursalock/client` has 1 failing test (pre-existing)
