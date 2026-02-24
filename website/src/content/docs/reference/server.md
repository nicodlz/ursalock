---
title: "@ursalock/server"
description: Server API reference
---

Self-hostable backend with Hono and SQLite.

## Server Setup

```typescript
import { createServer } from "@ursalock/server";

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
| `JWT_ISSUER` | No | `ursalock` | JWT issuer claim |
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
      "version": 1,
      "updatedAt": 1234567890
    }
  ]
}
```

#### POST /vault

Create a vault (container only, no data).

```bash
curl -X POST https://vault.example.com/vault \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-store"}'
```

#### GET /vault/:uid

Get a specific vault.

```bash
curl https://vault.example.com/vault/abc123 \
  -H "Authorization: Bearer <token>"
```

Response:
```json
{
  "uid": "abc123",
  "name": "my-store",
  "version": 1,
  "updatedAt": 1234567890
}
```

#### GET /vault/by-name/:name

Get vault by name.

```bash
curl https://vault.example.com/vault/by-name/my-store \
  -H "Authorization: Bearer <token>"
```

#### DELETE /vault/:uid

Delete a vault and all its documents.

```bash
curl -X DELETE https://vault.example.com/vault/abc123 \
  -H "Authorization: Bearer <token>"
```

### Document Endpoints

Documents are encrypted data stored within vaults. The `data` field contains base64-encoded encrypted ciphertext. The server never sees plaintext.

#### POST /vaults/:vaultUid/documents

Create a document in a vault.

```bash
curl -X POST https://vault.example.com/vaults/abc123/documents \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "collection": "notes",
    "data": "base64-encrypted-data...",
    "hmac": "optional-hmac-for-integrity"
  }'
```

Response:
```json
{
  "uid": "doc-xyz",
  "vaultUid": "abc123",
  "collection": "notes",
  "data": "base64-encrypted-data...",
  "hmac": "optional-hmac...",
  "version": 1,
  "createdAt": 1234567890,
  "updatedAt": 1234567890
}
```

#### GET /vaults/:vaultUid/documents

List documents in a vault.

Query parameters:
- `collection` — Filter by collection name
- `since` — Only return documents updated after this timestamp (milliseconds)
- `limit` — Maximum number of documents to return

```bash
curl "https://vault.example.com/vaults/abc123/documents?collection=notes&since=1234567890" \
  -H "Authorization: Bearer <token>"
```

Response:
```json
{
  "documents": [
    {
      "uid": "doc-xyz",
      "vaultUid": "abc123",
      "collection": "notes",
      "data": "base64-encrypted-data...",
      "hmac": "optional-hmac...",
      "version": 1,
      "createdAt": 1234567890,
      "updatedAt": 1234567890,
      "deletedAt": null
    }
  ]
}
```

#### GET /vaults/:vaultUid/documents/:uid

Get a specific document.

```bash
curl https://vault.example.com/vaults/abc123/documents/doc-xyz \
  -H "Authorization: Bearer <token>"
```

#### PUT /vaults/:vaultUid/documents/:uid

Update a document.

```bash
curl -X PUT https://vault.example.com/vaults/abc123/documents/doc-xyz \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "data": "new-encrypted-data...",
    "hmac": "new-hmac...",
    "version": 1
  }'
```

Returns 409 Conflict if the version doesn't match (optimistic locking for conflict resolution).

#### DELETE /vaults/:vaultUid/documents/:uid

Soft delete a document (sets `deletedAt` timestamp).

```bash
curl -X DELETE https://vault.example.com/vaults/abc123/documents/doc-xyz \
  -H "Authorization: Bearer <token>"
```

### API Key Endpoints

API keys provide programmatic access without user passwords.

#### POST /auth/api-keys

Create an API key.

```bash
curl -X POST https://vault.example.com/auth/api-keys \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My App Key", "expiresAt": 1735689600000}'
```

Response:
```json
{
  "uid": "key-123",
  "name": "My App Key",
  "key": "urs_abc123...",
  "expiresAt": 1735689600000,
  "createdAt": 1234567890
}
```

**Note:** The `key` field is only returned once at creation. Store it securely.

#### GET /auth/api-keys

List API keys for the current user.

```bash
curl https://vault.example.com/auth/api-keys \
  -H "Authorization: Bearer <token>"
```

Response:
```json
{
  "keys": [
    {
      "uid": "key-123",
      "name": "My App Key",
      "expiresAt": 1735689600000,
      "createdAt": 1234567890,
      "lastUsedAt": 1234567890
    }
  ]
}
```

#### DELETE /auth/api-keys/:uid

Revoke an API key.

```bash
curl -X DELETE https://vault.example.com/auth/api-keys/key-123 \
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
  version INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, name)
);

CREATE TABLE documents (
  uid TEXT PRIMARY KEY,
  vault_uid TEXT NOT NULL REFERENCES vaults(uid) ON DELETE CASCADE,
  collection TEXT NOT NULL,
  data TEXT NOT NULL,
  hmac TEXT,
  version INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  INDEX(vault_uid, collection),
  INDEX(vault_uid, updated_at)
);

CREATE TABLE api_keys (
  uid TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  expires_at INTEGER,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE refresh_tokens (
  jti TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```
