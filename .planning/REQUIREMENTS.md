# Requirements

## V1 (Must Have)

### Crypto (Phase 1)
- [ ] REQ-001: Argon2id key derivation (64MiB, 3 iter, p=4)
- [ ] REQ-002: AES-256-GCM encryption/decryption
- [ ] REQ-003: Recovery key generation (256-bit → 52 char base32)
- [ ] REQ-004: Recovery key validation and import

### Zustand Middleware (Phase 2)
- [ ] REQ-010: `vault()` middleware drop-in replacement for `persist()`
- [ ] REQ-011: State serialization with Zod schema validation
- [ ] REQ-012: LocalStorage encrypted fallback (offline)
- [ ] REQ-013: Encryption pipeline (state → JSON → encrypt → blob)

### Auth (Phase 3)
- [ ] REQ-020: Passkeys (WebAuthn) registration and login
- [ ] REQ-021: Email/password fallback authentication
- [ ] REQ-022: Session token management (JWT)
- [ ] REQ-023: Token refresh with sliding expiry

### Backend API (Phase 4)
- [ ] REQ-030: Hono server with TypeScript
- [ ] REQ-031: SQLite database with encrypted blob storage
- [ ] REQ-032: REST API: GET/PUT /vault/:id
- [ ] REQ-033: Auth middleware with JWT validation
- [ ] REQ-034: Docker image for self-hosting

### Sync Engine (Phase 5)
- [ ] REQ-040: HTTP polling sync client
- [ ] REQ-041: Last-write-wins conflict resolution
- [ ] REQ-042: Offline mutation queue
- [ ] REQ-043: Sync status hooks (syncing, synced, error)

### Documentation (Phase 6)
- [ ] REQ-050: README with quick start guide
- [ ] REQ-051: React/Next.js example app
- [ ] REQ-052: Migration guide from persist() to vault()
- [ ] REQ-053: Self-hosting guide (Docker, Coolify)

## V2 (Nice to Have)

- [ ] REQ-101: WebSocket real-time sync
- [ ] REQ-102: Multi-vault per user
- [ ] REQ-103: Vault sharing with other users
- [ ] REQ-104: Version history / point-in-time restore
- [ ] REQ-105: CLI for backup/restore
- [ ] REQ-106: React Native support

## Out of Scope

- Multi-user collaboration on same vault (v2+ with key sharing)
- CRDT-based conflict resolution (complexity not justified for v1)
- Native mobile SDKs (React Native only via v2)
- Admin dashboard (API-only for v1)

## Non-Functional Requirements

### Security
- All crypto operations client-side only
- Server stores only encrypted blobs
- No plaintext ever leaves client
- Recovery key = only way to decrypt

### Performance
- Encrypt/decrypt: <100ms for 1MB payload
- Sync latency: <500ms on good connection
- Bundle size: <20KB gzipped

### Compatibility
- Browsers: Chrome 90+, Firefox 90+, Safari 15+
- Node.js: 18+ (for server)
- Zustand: 4.x, 5.x
- Zod: 3.x
