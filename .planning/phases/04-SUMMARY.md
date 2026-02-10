# Phase 4 Summary: Backend API

## Deliverables
- `@ursalock/server` package (20.58 KB)
- Hono API server with SQLite
- Auth endpoints (email/password)
- Vault CRUD endpoints
- Typed error handling

## Architecture (Darika Style)

```
packages/server/src/
├── api/
│   ├── auth/router.ts      # Auth endpoints
│   ├── vault/router.ts     # Vault CRUD
│   └── schemas.ts          # Zod schemas (source of truth)
├── db/
│   ├── client.ts           # Typed SQLite queries
│   └── schema.ts           # Table definitions
├── features/
│   └── auth/
│       ├── jwt.ts          # JWT create/verify
│       └── middleware.ts   # Auth middleware
├── app.ts                  # Hono app factory
├── server.ts               # HTTP server entry
├── env.ts                  # Zod-validated env vars
└── errors.ts               # Typed error factories
```

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/email/register | Register with email/password |
| POST | /auth/email/login | Login |
| GET | /auth/me | Get current user |
| POST | /auth/refresh | Refresh token |
| POST | /auth/logout | Logout |

### Vault
| Method | Path | Description |
|--------|------|-------------|
| GET | /vault | List user's vaults |
| POST | /vault | Create vault |
| GET | /vault/:uid | Get vault by UID |
| PUT | /vault/:uid | Update vault |
| DELETE | /vault/:uid | Delete vault |

## Database Schema

```sql
-- Users
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

-- Sessions (JWT tracking)
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  token_hash TEXT UNIQUE,
  expires_at INTEGER,
  created_at INTEGER
);

-- Vaults (encrypted blobs)
CREATE TABLE vaults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  user_id INTEGER REFERENCES users(id),
  name TEXT,
  data TEXT,      -- Encrypted blob (base64)
  salt TEXT,      -- Encryption salt
  version INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);
```

## Code Patterns

### Zod Schemas as Source of Truth
```typescript
export const CreateVaultRequest = z.object({
  name: z.string().min(1).max(255),
  data: z.string(),
  salt: z.string(),
});
export type CreateVaultRequest = z.infer<typeof CreateVaultRequest>;
```

### Typed Error Factories
```typescript
export const errors: ErrorFactoryMap = {
  unauthorized: { code: "unauthorized", message: "Unauthorized" },
  vault_already_exists: (name: string) => ({
    code: "vault_already_exists",
    message: `Vault "${name}" already exists`,
  }),
};
```

### Auth Middleware
```typescript
export const requireAuthMiddleware = createMiddleware<{
  Variables: { session: SessionContext };
}>(async (c, next) => {
  // Verify JWT + session in DB
  c.set("session", { user, sessionId });
  return next();
});
```

## Test Coverage
| Suite | Tests | Status |
|-------|-------|--------|
| Health check | 1 | ✅ |
| Auth - Register | 4 | ✅ |
| Auth - Login | 3 | ✅ |
| Auth - Me | 3 | ✅ |
| Vault CRUD | 7 | ✅ |
| **Total** | **18** | ✅ |

## Dependencies
- `hono` - Web framework
- `@hono/node-server` - Node.js adapter
- `@hono/zod-validator` - Zod validation middleware
- `better-sqlite3` - SQLite driver
- `jose` - JWT library
- `zod` - Schema validation

## Bundle Size
- Runtime: 20.58 KB
- Types: 11.26 KB

## Environment Variables
| Var | Description | Default |
|-----|-------------|---------|
| PORT | Server port | 3456 |
| DATABASE_PATH | SQLite file path | ./data/vault.db |
| JWT_SECRET | JWT signing secret | (required) |
| JWT_EXPIRY | Token expiry (seconds) | 604800 (7 days) |
| RP_ID | WebAuthn RP ID | localhost |
| RP_NAME | WebAuthn RP name | ursalock |
| RP_ORIGIN | WebAuthn origin | http://localhost:5173 |

## Commits
- `b1263ad`: Complete server package

## Duration
~45 minutes

## Next Phase
Phase 5: Sync Engine (HTTP polling, offline queue, LWW)
