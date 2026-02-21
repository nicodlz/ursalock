# Fix: Sync Integrity & Data Safety

**Date:** 2026-02-21  
**Scope:** packages/server + packages/zustand

---

## Changes Applied

### 1. Optimistic Locking Enforcement (P0)

**Client (`packages/zustand/src/sync.ts`):**
- `createSyncEngine` now tracks `knownServerVersion` — updated on every `fetchServer()` and successful `pushServer()` response
- `pushServer()` always includes `version` in the PUT body when available
- On **409 Conflict**: pulls the latest server state via `fetchServer()`, calls `onServerData()` to re-merge, then retries the push once with the updated version
- Backward compatible: clients that haven't fetched yet send no version (server falls back to unconditional update)

**Server (`packages/server/src/services/vault-service.ts`):**
- `updateVault()` now uses the `vault_conflict` error type (was inline `version_conflict` string)
- On version mismatch: distinguishes 404 (vault not found) from 409 (version conflict) by checking if vault exists

**Server (`packages/server/src/db/client.ts`):**
- `updateVault()` already had atomic SQL `WHERE version = ?` — no change needed, confirmed correct

### 2. Vault Name Encryption Documentation (Metadata Leak)

- `packages/server/src/db/schema.ts`: Added TODO comment on `Vault` interface documenting the plaintext name leak and the need for client-side encryption/hashing
- `packages/server/src/api/schemas.ts`: Added NOTE on `CreateVaultRequest` documenting the future plan for opaque name identifiers
- No schema changes (would be a breaking change)

### 3. SQLite Secure Delete

- `packages/server/src/db/client.ts`: Added `PRAGMA secure_delete = ON` after connection open
- Comment explains: deleted data is overwritten with zeros to prevent forensic recovery of sensitive vault content

### 4. Fire-and-Forget Promise Handling

**`packages/zustand/src/vault.ts`** — 6 `void` calls now have `.catch()`:
- `syncEngine?.push()` → "Failed to push after local-newer conflict"
- `storage.setItem(...)` → "Failed to persist server data to local storage"
- `syncEngine?.sync()` (debounce) → "Debounced sync failed"
- `rehydrate()` → "Auto-rehydration failed"
- `syncEngine.sync()` (post-hydration) → "Initial sync after hydration failed"
- `sync()` (interval) → "Periodic sync failed"

No unhandled `void` calls remain in `sync.ts`.

### 5. Conflict Error Type

- `packages/server/src/errors.ts`: Added `vault_conflict` to `ErrorCode` enum and `errors` factory
  - Code: `"vault_conflict"`
  - Message: `"Version conflict - vault has been modified. Please refresh and retry."`
  - Status: 409

## Tests

- Added `version conflict (409)` test suite in `packages/zustand/src/sync.test.ts`
- Verifies: 409 triggers pull → `onServerData` callback → retry push → success

## Backward Compatibility

- Clients that don't send `version` in PUT requests continue to work (server falls back to unconditional `version + 1` update)
- No database schema changes
- No breaking API changes
