# Project State

## Current Position
- Milestone: v0.1.0
- Phase: 1
- Task: Starting crypto implementation
- Status: planning complete, execution starting

## Active Context
Building the crypto foundation: Argon2id key derivation + AES-256-GCM encryption.

## Recent Decisions
- 2026-02-09: Chose Argon2id over PBKDF2 (OWASP 2026 recommendation, PBKDF2 caused breaches)
- 2026-02-09: Chose hash-wasm for Argon2id (~15KB, WASM, fast)
- 2026-02-09: AES-256-GCM via native Web Crypto API (0KB overhead)
- 2026-02-09: SQLite over PostgreSQL (simpler self-hosting)
- 2026-02-09: Passkeys default, email/password fallback
- 2026-02-09: 1 user = 1 vault for v1 (no sharing)
- 2026-02-09: LWW conflict resolution for v1 (no CRDT complexity)

## Blockers
- None

## Session Notes
Interview complete. All decisions validated by Nicolas. Ready to execute.

## Last Updated
2026-02-09T15:10:00Z
