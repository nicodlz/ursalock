---
title: "@zod-vault/server"
description: Server API reference
---

Self-hostable backend with Hono and SQLite.

## Server Setup

```typescript
import { createServer } from "@zod-vault/server";

const server = createServer({
  jwtSecret: process.env.JWT_SECRET,
  dbPath: "./data/vault.db",
});

server.listen(3000);
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | Secret for JWT signing |
| `JWT_ISSUER` | No | `zod-vault` | JWT issuer claim |
| `JWT_ACCESS_EXPIRY` | No | `15m` | Access token expiry |
| `JWT_REFRESH_EXPIRY` | No | `7d` | Refresh token expiry |
| `DB_PATH` | No | `./data/vault.db` | SQLite path |
| `PORT` | No | `3000` | HTTP port |

## REST API

### Auth Endpoints

#### POST /auth/email/register

Register a new user.

```bash
curl -X POST https://vault.example.com/auth/email/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secret"}'
```

Response:
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "...", "email": "user@example.com" }
}
```

#### POST /auth/email/login

Login with email/password.

```bash
curl -X POST https://vault.example.com/auth/email/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secret"}'
```

#### GET /auth/me

Get current user.

```bash
curl https://vault.example.com/auth/me \
  -H "Authorization: Bearer <token>"
```

#### POST /auth/refresh

Refresh access token.

```bash
curl -X POST https://vault.example.com/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "eyJ..."}'
```

#### POST /auth/logout

Logout (invalidate refresh token).

```bash
curl -X POST https://vault.example.com/auth/logout \
  -H "Authorization: Bearer <token>"
```

### Vault Endpoints

#### GET /vault

List user's vaults.

```bash
curl https://vault.example.com/vault \
  -H "Authorization: Bearer <token>"
```

Response:
```json
{
  "vaults": [
    {
      "uid": "abc123",
      "name": "my-store",
      "data": "encrypted...",
      "salt": "base64...",
      "version": 1,
      "updatedAt": 1234567890
    }
  ]
}
```

#### POST /vault

Create a vault.

```bash
curl -X POST https://vault.example.com/vault \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-store", "data": "encrypted...", "salt": "base64..."}'
```

#### GET /vault/:uid

Get a specific vault.

```bash
curl https://vault.example.com/vault/abc123 \
  -H "Authorization: Bearer <token>"
```

#### PUT /vault/:uid

Update a vault.

```bash
curl -X PUT https://vault.example.com/vault/abc123 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"data": "new-encrypted...", "salt": "new-salt..."}'
```

#### DELETE /vault/:uid

Delete a vault.

```bash
curl -X DELETE https://vault.example.com/vault/abc123 \
  -H "Authorization: Bearer <token>"
```

### Health

#### GET /health

```bash
curl https://vault.example.com/health
```

Response:
```json
{"status": "ok", "timestamp": 1234567890}
```

## Database Schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE vaults (
  uid TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  salt TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, name)
);

CREATE TABLE refresh_tokens (
  jti TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```
