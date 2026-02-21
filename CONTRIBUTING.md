# Contributing to Ursalock

## Setup

```bash
git clone https://github.com/nicodlz/ursalock.git
cd ursalock
npm install        # installs all workspace dependencies
npm run build      # builds all packages (crypto → zustand → client → server)
npm test           # runs all tests
```

## Monorepo Structure

| Package | Description |
|---------|-------------|
| `packages/crypto` | E2EE crypto primitives (AES-256-GCM, Argon2id, JWK) |
| `packages/zustand` | Encrypted persistence middleware for Zustand stores |
| `packages/client` | Auth + API client with passkey/ZKC support |
| `packages/server` | Self-hostable Hono server with SQLite |

Dependencies flow: `crypto` → `zustand` → `client`. `server` is independent.

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build all packages via Turbo |
| `npm test` | Run all tests via Turbo |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint:eslint` | ESLint across all packages |
| `npm run format` | Prettier format (write) |
| `npm run format:check` | Prettier format (check only) |

### Per-package

```bash
cd packages/server
npm run dev          # watch mode with tsx
npm run test:watch   # vitest in watch mode
```

## PR Standards

1. **One concern per PR** — don't mix features with refactors
2. **Tests required** — new features and bug fixes must include tests
3. **Typecheck must pass** — `npm run typecheck` with zero errors
4. **CI must be green** — all jobs (typecheck, lint, test, audit) must pass

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(crypto): add HKDF key derivation
fix(server): handle concurrent vault updates
test(server): add rate limiting integration tests
docs: update CONTRIBUTING.md
chore: bump dependencies
```

Scopes: `crypto`, `zustand`, `client`, `server`, or omit for repo-wide changes.

## Security Guidelines

**This is a cryptography project. Extra care is required.**

- **Never** log encryption keys, secrets, tokens, or passwords — not even in debug mode
- **Never** use custom IVs — always let the crypto library generate random IVs
- **Never** commit `.env` files or secrets
- **Never** weaken crypto parameters (rounds, key sizes) "for testing"
- Use `DATABASE_PATH=:memory:` for tests, never a real database
- Report security issues via [SECURITY.md](./SECURITY.md), not public issues
