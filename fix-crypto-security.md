# Crypto Security Fixes — Summary

Applied 2026-02-21. All `packages/crypto` and `packages/zustand/src/sync` tests pass.

## 1. Timing Attack Fix (H-01 HIGH)

**File:** `packages/crypto/src/recovery.ts` — `validateRecoveryKey()`

**Before:** Early `return false` inside the character validation loop leaked how many leading characters were valid base32 via timing side-channel.

**After:** Loop always runs over ALL 52 characters, accumulating validity in a boolean. Return happens only after the full scan. This is constant-time with respect to the position of the first invalid character.

Note: `constantTimeEqual()` in `utils.ts` was already correctly implemented (XOR accumulator pattern).

## 2. Argon2 Parameters (H-06 HIGH)

**File:** `packages/crypto/src/derive.ts`

**Changes:**
- Default `memoryCost`: 65536 → **131072** (128 MiB)
- Default `timeCost`: 3 → **4**
- Added `LEGACY_ARGON2_PARAMS` export (64 MiB / 3 iterations) for backward compatibility
- Updated `DEFAULT_ARGON2_PARAMS` to match new defaults
- Added OWASP 2026 / RFC 9106 references in comments

**Backward compat:** Existing vaults can be decrypted by passing `...LEGACY_ARGON2_PARAMS` to `deriveKey()`. The `DeriveKeyOptions` interface already accepts custom params.

## 3. Remove Optional IV Parameter (M-01 MEDIUM)

**Files:** `packages/crypto/src/interfaces.ts`, `packages/crypto/src/providers/web-crypto.ts`

**Changes:**
- Removed `iv?: Uint8Array` parameter from `ICryptoProvider.encrypt()` and `WebCryptoProvider.encrypt()`
- IV is now always generated via `crypto.getRandomValues()` — no caller can supply one
- Added NIST SP 800-38D §8.3 reference explaining why IV reuse is catastrophic under GCM
- Verified: no callers in the codebase pass a custom IV (grep confirmed)

## 4. Sync Integrity — HMAC (M-07 MEDIUM)

**New file:** `packages/crypto/src/hmac.ts`
- `computeHmac(data, key)` → hex-encoded HMAC-SHA256
- `verifyHmac(data, key, expectedHmac)` → uses Web Crypto `verify()` (constant-time internally)

**File:** `packages/zustand/src/sync.ts`
- New optional `hmacKey` in `SyncOptions` (key separation principle)
- `ServerVault` gains optional `hmac` field
- **Push:** HMAC computed over ciphertext before every server write (all code paths: create, update, retry)
- **Pull:** HMAC verified before passing data to `onServerData` (all 3 call sites)
- **Backward compat:** Missing HMAC on server data → `console.warn` + continue. Invalid HMAC → hard error.

**Exports added:** `computeHmac`, `verifyHmac` from `@ursalock/crypto`; `LEGACY_ARGON2_PARAMS` from `@ursalock/crypto`.
