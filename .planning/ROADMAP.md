# Roadmap

## Milestone: v0.1.0 (MVP)

### Phase 1: Core Crypto
Status: pending
Requirements: REQ-001, REQ-002, REQ-003, REQ-004
Estimated: 2h

Deliverables:
- `@ursalock/crypto` package with Argon2id + AES-256-GCM
- Recovery key generation and validation
- 100% test coverage on crypto functions
- Zero external deps except hash-wasm

Dependencies:
- None (foundation)

---

### Phase 2: Zustand Middleware
Status: pending
Requirements: REQ-010, REQ-011, REQ-012, REQ-013
Estimated: 3h

Deliverables:
- `vault()` middleware function
- State serialization with encryption
- LocalStorage encrypted persistence
- Works offline without server

Dependencies:
- Phase 1 (crypto functions)

---

### Phase 3: Authentication
Status: pending
Requirements: REQ-020, REQ-021, REQ-022, REQ-023
Estimated: 3h

Deliverables:
- Passkeys (WebAuthn) client library
- Email/password fallback
- JWT token management
- Auth hooks for React

Dependencies:
- Phase 1 (crypto for password hashing)

---

### Phase 4: Backend API
Status: pending
Requirements: REQ-030, REQ-031, REQ-032, REQ-033, REQ-034
Estimated: 3h

Deliverables:
- Hono API server
- SQLite schema (users, vaults, blobs)
- REST endpoints with auth
- Dockerfile for deployment

Dependencies:
- Phase 3 (auth design)

---

### Phase 5: Sync Engine
Status: pending
Requirements: REQ-040, REQ-041, REQ-042, REQ-043
Estimated: 2h

Deliverables:
- HTTP polling client
- Offline queue with retry
- LWW conflict resolution
- useSyncStatus() hook

Dependencies:
- Phase 2 (middleware)
- Phase 4 (API)

---

### Phase 6: Polish & Documentation
Status: pending
Requirements: REQ-050, REQ-051, REQ-052, REQ-053
Estimated: 2h

Deliverables:
- README.md killer
- /examples/react-demo
- /examples/nextjs-demo
- Migration guide
- npm publish @ursalock/*

Dependencies:
- All previous phases

---

## Total Estimated: ~15h
