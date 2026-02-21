/**
 * SQLite database client with typed queries
 * Pattern: Explicit queries, no ORM magic
 */

import Database from "better-sqlite3";
import { env } from "#env.js";
import { CREATE_TABLES_SQL, type User, type Passkey, type Session, type Vault, type Document, type ApiKey } from "#db/schema.js";

/** Database instance (singleton) */
let _db: Database.Database | null = null;

/**
 * Get or create the database connection
 */
export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(env.DATABASE_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    // Overwrite deleted data with zeros to prevent recovery of sensitive vault content
    _db.pragma("secure_delete = ON");
    _db.exec(CREATE_TABLES_SQL);
    
    // Run migrations for new columns
    runMigrations(_db);
  }
  return _db;
}

/**
 * Run schema migrations
 */
function runMigrations(db: Database.Database): void {
  // Check if opaque_id column exists
  const columns = db.pragma("table_info(users)") as Array<{ name: string }>;
  const hasOpaqueId = columns.some((col) => col.name === "opaque_id");
  
  if (!hasOpaqueId) {
    try {
      db.exec(`
        ALTER TABLE users ADD COLUMN opaque_id TEXT UNIQUE;
        ALTER TABLE users ADD COLUMN display_name TEXT;
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_users_opaque_id ON users(opaque_id);");
    } catch {
      // Columns might already exist from a partial migration
    }
  }
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ===================
// User queries
// ===================

/** Reusable SELECT columns for user queries (DRY) */
const USER_COLUMNS = `id, uid, email, password_hash as passwordHash,
           opaque_id as opaqueId, display_name as displayName,
           created_at as createdAt, updated_at as updatedAt`;

/** Reusable SELECT columns for user fields in JOIN queries */
const USER_JOIN_COLUMNS = `u.id as "user.id", u.uid as "user.uid", u.email as "user.email",
      u.password_hash as "user.passwordHash", u.opaque_id as "user.opaqueId",
      u.display_name as "user.displayName", u.created_at as "user.createdAt",
      u.updated_at as "user.updatedAt"`;

/** Map a JOIN row's user.* fields to a User object */
function userFromRow(row: Record<string, unknown>): User {
  return {
    id: row["user.id"] as number,
    uid: row["user.uid"] as string,
    email: (row["user.email"] as string | null) ?? null,
    passwordHash: (row["user.passwordHash"] as string | null) ?? null,
    opaqueId: (row["user.opaqueId"] as string | null) ?? null,
    displayName: (row["user.displayName"] as string | null) ?? null,
    createdAt: row["user.createdAt"] as number,
    updatedAt: row["user.updatedAt"] as number,
  };
}

export interface CreateUserInput {
  email?: string;
  passwordHash?: string;
  /** Opaque ID from ZKCredentials */
  opaqueId?: string;
  /** Display name for ZKC users */
  displayName?: string;
}

export function createUser(input: CreateUserInput): User {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO users (email, password_hash, opaque_id, display_name)
    VALUES (?, ?, ?, ?)
    RETURNING ${USER_COLUMNS}
  `);
  return stmt.get(
    input.email ?? null,
    input.passwordHash ?? null,
    input.opaqueId ?? null,
    input.displayName ?? null
  ) as User;
}

export function getUserById(id: number): User | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT ${USER_COLUMNS}
    FROM users WHERE id = ?
  `);
  return stmt.get(id) as User | undefined;
}

export function getUserByUid(uid: string): User | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT ${USER_COLUMNS}
    FROM users WHERE uid = ?
  `);
  return stmt.get(uid) as User | undefined;
}

export function getUserByEmail(email: string): User | undefined {
  const db = getDb();
  email = email.toLowerCase().trim();
  const stmt = db.prepare(`
    SELECT ${USER_COLUMNS}
    FROM users WHERE email = ?
  `);
  return stmt.get(email) as User | undefined;
}

/**
 * Get user by ZKCredentials opaque ID
 */
export function getUserByOpaqueId(opaqueId: string): User | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT ${USER_COLUMNS}
    FROM users WHERE opaque_id = ?
  `);
  return stmt.get(opaqueId) as User | undefined;
}

// ===================
// Passkey queries (legacy - kept for backward compatibility)
// ===================

export interface CreatePasskeyInput {
  userId: number;
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports?: string[];
}

export function createPasskey(input: CreatePasskeyInput): Passkey {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO passkeys (user_id, credential_id, public_key, counter, device_type, backed_up, transports)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING id, user_id as userId, credential_id as credentialId, public_key as publicKey,
              counter, device_type as deviceType, backed_up as backedUp, transports, created_at as createdAt
  `);
  const result = stmt.get(
    input.userId,
    input.credentialId,
    input.publicKey,
    input.counter,
    input.deviceType,
    input.backedUp ? 1 : 0,
    input.transports?.join(",") ?? null,
  ) as Passkey;
  return { ...result, backedUp: Boolean(result.backedUp) };
}

export function getPasskeyByCredentialId(credentialId: string): (Passkey & { user: User }) | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      p.id, p.user_id as userId, p.credential_id as credentialId, p.public_key as publicKey,
      p.counter, p.device_type as deviceType, p.backed_up as backedUp, p.transports, p.created_at as createdAt,
      ${USER_JOIN_COLUMNS}
    FROM passkeys p
    JOIN users u ON p.user_id = u.id
    WHERE p.credential_id = ?
  `);
  const row = stmt.get(credentialId) as Record<string, unknown> | undefined;
  if (!row) return undefined;

  return {
    id: row["id"] as number,
    userId: row["userId"] as number,
    credentialId: row["credentialId"] as string,
    publicKey: row["publicKey"] as string,
    counter: row["counter"] as number,
    deviceType: row["deviceType"] as string,
    backedUp: Boolean(row["backedUp"]),
    transports: row["transports"] as string | null,
    createdAt: row["createdAt"] as number,
    user: userFromRow(row),
  };
}

export function getPasskeysByUserId(userId: number): Passkey[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, user_id as userId, credential_id as credentialId, public_key as publicKey,
           counter, device_type as deviceType, backed_up as backedUp, transports, created_at as createdAt
    FROM passkeys WHERE user_id = ?
  `);
  return (stmt.all(userId) as Passkey[]).map((p) => ({ ...p, backedUp: Boolean(p.backedUp) }));
}

export function updatePasskeyCounter(credentialId: string, counter: number): void {
  const db = getDb();
  const stmt = db.prepare(`UPDATE passkeys SET counter = ? WHERE credential_id = ?`);
  stmt.run(counter, credentialId);
}

// ===================
// Session queries
// ===================

export interface CreateSessionInput {
  userId: number;
  tokenHash: string;
  expiresAt: number;
}

/** Maximum concurrent sessions per user */
const MAX_SESSIONS = 10;

/**
 * Create a session, enforcing a per-user session limit.
 * If the user already has MAX_SESSIONS active sessions, the oldest is deleted.
 */
export function createSession(input: CreateSessionInput): Session {
  const db = getDb();

  // Enforce session limit: count active sessions for this user
  const countStmt = db.prepare(
    `SELECT COUNT(*) as cnt FROM sessions WHERE user_id = ? AND expires_at > unixepoch()`,
  );
  const { cnt } = countStmt.get(input.userId) as { cnt: number };

  if (cnt >= MAX_SESSIONS) {
    // Delete the oldest active session(s) to make room
    const deleteOldest = db.prepare(`
      DELETE FROM sessions WHERE id IN (
        SELECT id FROM sessions
        WHERE user_id = ? AND expires_at > unixepoch()
        ORDER BY created_at ASC
        LIMIT ?
      )
    `);
    deleteOldest.run(input.userId, cnt - MAX_SESSIONS + 1);
  }

  const stmt = db.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
    RETURNING id, user_id as userId, token_hash as tokenHash, expires_at as expiresAt, created_at as createdAt
  `);
  return stmt.get(input.userId, input.tokenHash, input.expiresAt) as Session;
}

export function getSessionByTokenHash(tokenHash: string): (Session & { user: User }) | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      s.id, s.user_id as userId, s.token_hash as tokenHash, s.expires_at as expiresAt, s.created_at as createdAt,
      ${USER_JOIN_COLUMNS}
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > unixepoch()
  `);
  const row = stmt.get(tokenHash) as Record<string, unknown> | undefined;
  if (!row) return undefined;

  return {
    id: row["id"] as number,
    userId: row["userId"] as number,
    tokenHash: row["tokenHash"] as string,
    expiresAt: row["expiresAt"] as number,
    createdAt: row["createdAt"] as number,
    user: userFromRow(row),
  };
}

export function deleteSession(tokenHash: string): void {
  const db = getDb();
  const stmt = db.prepare(`DELETE FROM sessions WHERE token_hash = ?`);
  stmt.run(tokenHash);
}

export function deleteExpiredSessions(): number {
  const db = getDb();
  const stmt = db.prepare(`DELETE FROM sessions WHERE expires_at <= unixepoch()`);
  return stmt.run().changes;
}

// ===================
// Vault queries
// ===================

export interface CreateVaultInput {
  userId: number;
  name: string;
  data: string;
  salt: string;
  version?: number;
}

export function createVault(input: CreateVaultInput): Vault {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO vaults (user_id, name, data, salt, version)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id, uid, user_id as userId, name, data, salt, version, created_at as createdAt, updated_at as updatedAt
  `);
  return stmt.get(input.userId, input.name, input.data, input.salt, input.version ?? 1) as Vault;
}

export function getVaultByUid(uid: string, userId: number): Vault | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, uid, user_id as userId, name, data, salt, version, created_at as createdAt, updated_at as updatedAt
    FROM vaults WHERE uid = ? AND user_id = ?
  `);
  return stmt.get(uid, userId) as Vault | undefined;
}

export function getVaultByName(name: string, userId: number): Vault | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, uid, user_id as userId, name, data, salt, version, created_at as createdAt, updated_at as updatedAt
    FROM vaults WHERE name = ? AND user_id = ?
  `);
  return stmt.get(name, userId) as Vault | undefined;
}

export function getVaultsByUserId(userId: number): Vault[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, uid, user_id as userId, name, data, salt, version, created_at as createdAt, updated_at as updatedAt
    FROM vaults WHERE user_id = ?
    ORDER BY updated_at DESC
  `);
  return stmt.all(userId) as Vault[];
}

export interface UpdateVaultInput {
  data: string;
  salt: string;
  version?: number;
}

export function updateVault(uid: string, userId: number, input: UpdateVaultInput): Vault | undefined {
  const db = getDb();
  if (input.version != null) {
    // Optimistic locking: only update if version matches
    const stmt = db.prepare(`
      UPDATE vaults SET data = ?, salt = ?, version = ? + 1, updated_at = unixepoch()
      WHERE uid = ? AND user_id = ? AND version = ?
      RETURNING id, uid, user_id as userId, name, data, salt, version, created_at as createdAt, updated_at as updatedAt
    `);
    return stmt.get(input.data, input.salt, input.version, uid, userId, input.version) as Vault | undefined;
  }
  const stmt = db.prepare(`
    UPDATE vaults SET data = ?, salt = ?, version = version + 1, updated_at = unixepoch()
    WHERE uid = ? AND user_id = ?
    RETURNING id, uid, user_id as userId, name, data, salt, version, created_at as createdAt, updated_at as updatedAt
  `);
  return stmt.get(input.data, input.salt, uid, userId) as Vault | undefined;
}

export function deleteVault(uid: string, userId: number): boolean {
  const db = getDb();
  const stmt = db.prepare(`DELETE FROM vaults WHERE uid = ? AND user_id = ?`);
  return stmt.run(uid, userId).changes > 0;
}

// ===================
// Document queries
// ===================

/** Reusable SELECT columns for document queries (DRY) */
const DOCUMENT_COLUMNS = `id, uid, vault_uid as vaultUid, user_id as userId, collection,
           data, hmac, version, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt`;

export interface CreateDocumentInput {
  vaultUid: string;
  userId: number;
  collection: string;
  data: string;
  hmac?: string;
}

export function createDocument(input: CreateDocumentInput): Document {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO documents (vault_uid, user_id, collection, data, hmac)
    VALUES (?, ?, ?, ?, ?)
    RETURNING ${DOCUMENT_COLUMNS}
  `);
  return stmt.get(
    input.vaultUid,
    input.userId,
    input.collection,
    input.data,
    input.hmac ?? null
  ) as Document;
}

export function getDocumentByUid(uid: string, vaultUid: string, userId: number): Document | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT ${DOCUMENT_COLUMNS}
    FROM documents WHERE uid = ? AND vault_uid = ? AND user_id = ?
  `);
  return stmt.get(uid, vaultUid, userId) as Document | undefined;
}

export interface ListDocumentsOptions {
  collection?: string;
  since?: number;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export function listDocuments(vaultUid: string, userId: number, opts?: ListDocumentsOptions): Document[] {
  const db = getDb();
  const conditions: string[] = ["vault_uid = ?", "user_id = ?"];
  const params: (string | number)[] = [vaultUid, userId];

  if (opts?.collection) {
    conditions.push("collection = ?");
    params.push(opts.collection);
  }

  if (opts?.since != null) {
    conditions.push("updated_at >= ?");
    params.push(opts.since);
  }

  if (!opts?.includeDeleted) {
    conditions.push("deleted_at IS NULL");
  }

  let query = `SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC`;

  if (opts?.limit != null) {
    query += ` LIMIT ?`;
    params.push(opts.limit);
  }

  if (opts?.offset != null) {
    query += ` OFFSET ?`;
    params.push(opts.offset);
  }

  const stmt = db.prepare(query);
  return stmt.all(...params) as Document[];
}

export interface UpdateDocumentInput {
  data: string;
  hmac?: string;
  version?: number;
}

export function updateDocument(uid: string, vaultUid: string, userId: number, input: UpdateDocumentInput): Document | undefined {
  const db = getDb();
  if (input.version != null) {
    // Optimistic locking: only update if version matches
    const stmt = db.prepare(`
      UPDATE documents SET data = ?, hmac = ?, version = ? + 1, updated_at = unixepoch()
      WHERE uid = ? AND vault_uid = ? AND user_id = ? AND version = ?
      RETURNING ${DOCUMENT_COLUMNS}
    `);
    return stmt.get(input.data, input.hmac ?? null, input.version, uid, vaultUid, userId, input.version) as Document | undefined;
  }
  const stmt = db.prepare(`
    UPDATE documents SET data = ?, hmac = ?, version = version + 1, updated_at = unixepoch()
    WHERE uid = ? AND vault_uid = ? AND user_id = ?
    RETURNING ${DOCUMENT_COLUMNS}
  `);
  return stmt.get(input.data, input.hmac ?? null, uid, vaultUid, userId) as Document | undefined;
}

export function softDeleteDocument(uid: string, vaultUid: string, userId: number): Document | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE documents SET deleted_at = unixepoch(), updated_at = unixepoch()
    WHERE uid = ? AND vault_uid = ? AND user_id = ? AND deleted_at IS NULL
    RETURNING ${DOCUMENT_COLUMNS}
  `);
  return stmt.get(uid, vaultUid, userId) as Document | undefined;
}

/**
 * Get documents modified since timestamp (for delta sync).
 * Intentionally includes soft-deleted documents so clients can
 * detect deletions and remove their local copies.
 */
export function getDocumentsSince(vaultUid: string, userId: number, since: number): Document[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT ${DOCUMENT_COLUMNS}
    FROM documents WHERE vault_uid = ? AND user_id = ? AND updated_at >= ?
    ORDER BY updated_at DESC
  `);
  return stmt.all(vaultUid, userId, since) as Document[];
}

// ===================
// API Key queries
// ===================

/** Reusable SELECT columns for API key queries (DRY) */
const API_KEY_COLUMNS = `id, uid, user_id as userId, name, key_hash as keyHash, key_prefix as keyPrefix,
           permissions, vault_uids as vaultUids, collections, expires_at as expiresAt,
           last_used_at as lastUsedAt, created_at as createdAt, revoked_at as revokedAt`;

export interface CreateApiKeyInput {
  userId: number;
  name: string;
  keyHash: string;
  keyPrefix: string;
  permissions?: string[];
  vaultUids?: string[];
  collections?: string[];
  expiresAt?: number;
}

export function createApiKey(input: CreateApiKeyInput): ApiKey {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO api_keys (user_id, name, key_hash, key_prefix, permissions, vault_uids, collections, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING ${API_KEY_COLUMNS}
  `);
  
  const permissions = input.permissions ? JSON.stringify(input.permissions) : '["read","write"]';
  const vaultUids = input.vaultUids ? JSON.stringify(input.vaultUids) : null;
  const collections = input.collections ? JSON.stringify(input.collections) : null;
  
  return stmt.get(
    input.userId,
    input.name,
    input.keyHash,
    input.keyPrefix,
    permissions,
    vaultUids,
    collections,
    input.expiresAt ?? null
  ) as ApiKey;
}

export function getApiKeyByHash(keyHash: string): (ApiKey & { user: User }) | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      k.id, k.uid, k.user_id as userId, k.name, k.key_hash as keyHash, k.key_prefix as keyPrefix,
      k.permissions, k.vault_uids as vaultUids, k.collections, k.expires_at as expiresAt,
      k.last_used_at as lastUsedAt, k.created_at as createdAt, k.revoked_at as revokedAt,
      ${USER_JOIN_COLUMNS}
    FROM api_keys k
    JOIN users u ON k.user_id = u.id
    WHERE k.key_hash = ?
  `);
  const row = stmt.get(keyHash) as Record<string, unknown> | undefined;
  if (!row) return undefined;

  return {
    id: row["id"] as number,
    uid: row["uid"] as string,
    userId: row["userId"] as number,
    name: row["name"] as string,
    keyHash: row["keyHash"] as string,
    keyPrefix: row["keyPrefix"] as string,
    permissions: row["permissions"] as string,
    vaultUids: (row["vaultUids"] as string | null) ?? null,
    collections: (row["collections"] as string | null) ?? null,
    expiresAt: (row["expiresAt"] as number | null) ?? null,
    lastUsedAt: (row["lastUsedAt"] as number | null) ?? null,
    createdAt: row["createdAt"] as number,
    revokedAt: (row["revokedAt"] as number | null) ?? null,
    user: userFromRow(row),
  };
}

export function listApiKeysByUserId(userId: number): Omit<ApiKey, "keyHash">[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, uid, user_id as userId, name, key_prefix as keyPrefix,
           permissions, vault_uids as vaultUids, collections, expires_at as expiresAt,
           last_used_at as lastUsedAt, created_at as createdAt, revoked_at as revokedAt
    FROM api_keys WHERE user_id = ?
    ORDER BY created_at DESC
  `);
  return stmt.all(userId) as Omit<ApiKey, "keyHash">[];
}

export function revokeApiKey(uid: string, userId: number): boolean {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE api_keys SET revoked_at = unixepoch()
    WHERE uid = ? AND user_id = ? AND revoked_at IS NULL
  `);
  return stmt.run(uid, userId).changes > 0;
}

export function updateApiKeyLastUsed(uid: string): void {
  const db = getDb();
  const stmt = db.prepare(`UPDATE api_keys SET last_used_at = unixepoch() WHERE uid = ?`);
  stmt.run(uid);
}

export function deleteExpiredApiKeys(): number {
  const db = getDb();
  const stmt = db.prepare(`DELETE FROM api_keys WHERE expires_at IS NOT NULL AND expires_at <= unixepoch()`);
  return stmt.run().changes;
}
