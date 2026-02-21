/**
 * Database schema definitions
 * Tables and types for SQLite database
 */

/** User account */
export interface User {
  id: number;
  uid: string;
  email: string | null;
  passwordHash: string | null;
  /** Opaque ID from ZKCredentials (for passkey-only auth) */
  opaqueId: string | null;
  /** Display name (for ZKC users without email) */
  displayName: string | null;
  createdAt: number;
  updatedAt: number;
}

/** WebAuthn passkey credential */
export interface Passkey {
  id: number;
  userId: number;
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports: string | null;
  createdAt: number;
}

/** User session (JWT token tracking) */
export interface Session {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
}

/**
 * Encrypted vault blob
 *
 * TODO(security): The `name` field is stored in plaintext, which is a metadata leak.
 * Vault names should be encrypted or hashed client-side before being sent to the server.
 * This requires a coordinated client+server migration (breaking change) and is deferred
 * to a future version. See also: packages/server/src/api/schemas.ts
 */
export interface Vault {
  id: number;
  uid: string;
  userId: number;
  name: string;
  /** Encrypted blob (base64) */
  data: string;
  /** Salt used for encryption (base64) - empty for JWK mode */
  salt: string;
  /** Schema version for migrations */
  version: number;
  createdAt: number;
  updatedAt: number;
}

/** SQL statements for creating tables */
export const CREATE_TABLES_SQL = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  email TEXT UNIQUE,
  password_hash TEXT,
  opaque_id TEXT UNIQUE,
  display_name TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_uid ON users(uid);
CREATE INDEX IF NOT EXISTS idx_users_opaque_id ON users(opaque_id);

-- Passkeys table (WebAuthn credentials) - kept for legacy support
CREATE TABLE IF NOT EXISTS passkeys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_type TEXT NOT NULL DEFAULT 'singleDevice',
  backed_up INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkeys(user_id);
CREATE INDEX IF NOT EXISTS idx_passkeys_credential_id ON passkeys(credential_id);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- Vaults table (encrypted blobs)
CREATE TABLE IF NOT EXISTS vaults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  salt TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_vaults_uid ON vaults(uid);
CREATE INDEX IF NOT EXISTS idx_vaults_user_id ON vaults(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vaults_user_name ON vaults(user_id, name);
`;
