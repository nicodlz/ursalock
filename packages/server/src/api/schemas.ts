/**
 * API request/response schemas
 * Pattern: Zod as source of truth for types
 */

import { z } from "zod";

// ===================
// Common schemas
// ===================

export const UserResponse = z.object({
  id: z.string(),
  email: z.string().email().nullable(),
  createdAt: z.number(),
});
export type UserResponse = z.infer<typeof UserResponse>;

// ===================
// Auth schemas
// ===================

/** Email/password registration request */
export const EmailRegisterRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type EmailRegisterRequest = z.infer<typeof EmailRegisterRequest>;

/** Email/password login request */
export const EmailLoginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type EmailLoginRequest = z.infer<typeof EmailLoginRequest>;

/** Successful auth response */
export const AuthResponse = z.object({
  user: UserResponse,
  token: z.string(),
  recoveryKey: z.string().optional(),
});
export type AuthResponse = z.infer<typeof AuthResponse>;

/** Token refresh response */
export const RefreshResponse = z.object({
  token: z.string(),
  expiresIn: z.number(),
});
export type RefreshResponse = z.infer<typeof RefreshResponse>;

/** Current user response */
export const MeResponse = z.object({
  user: UserResponse,
});
export type MeResponse = z.infer<typeof MeResponse>;

// ===================
// Passkey schemas
// ===================

/** Passkey registration options request */
export const PasskeyRegisterOptionsRequest = z.object({
  email: z.string().email().optional(),
});
export type PasskeyRegisterOptionsRequest = z.infer<typeof PasskeyRegisterOptionsRequest>;

/** Passkey registration verify request */
export const PasskeyRegisterVerifyRequest = z.object({
  email: z.string().email().optional(),
  credential: z.record(z.unknown()),
});
export type PasskeyRegisterVerifyRequest = z.infer<typeof PasskeyRegisterVerifyRequest>;

/** Passkey login options request */
export const PasskeyLoginOptionsRequest = z.object({
  email: z.string().email().optional(),
});
export type PasskeyLoginOptionsRequest = z.infer<typeof PasskeyLoginOptionsRequest>;

/** Passkey login verify request */
export const PasskeyLoginVerifyRequest = z.object({
  credential: z.record(z.unknown()),
});
export type PasskeyLoginVerifyRequest = z.infer<typeof PasskeyLoginVerifyRequest>;

// ===================
// Vault schemas
// ===================

/** Maximum encrypted data size (5 MB) */
const MAX_DATA_SIZE = 5 * 1024 * 1024;

/** Base64 (standard + url-safe) pattern */
const BASE64_RE = /^[A-Za-z0-9+/\-_=]*$/;

/** Alphanumeric with hyphens and underscores */
const VAULT_NAME_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Create vault request
 *
 * Vaults are now containers for documents only. They do not store encrypted blobs directly.
 * Use the Document API (@ursalock/client DocumentClient) for storing encrypted data.
 *
 * NOTE: The `name` field is currently sent in plaintext. In a future version,
 * clients should send a deterministic hash or client-encrypted value to prevent
 * metadata leakage on the server. The server will treat the name as an opaque
 * identifier and the unique constraint (user_id, name) will still apply.
 */
export const CreateVaultRequest = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(VAULT_NAME_RE, "Name must be alphanumeric (hyphens and underscores allowed)"),
});
export type CreateVaultRequest = z.infer<typeof CreateVaultRequest>;

/** Vault response (container metadata only) */
export const VaultResponse = z.object({
  uid: z.string(),
  name: z.string(),
  version: z.number(),
  updatedAt: z.number(),
});
export type VaultResponse = z.infer<typeof VaultResponse>;

/** List vaults response */
export const VaultsListResponse = z.object({
  vaults: z.array(VaultResponse),
});
export type VaultsListResponse = z.infer<typeof VaultsListResponse>;

// ===================
// Document schemas
// ===================

/** Collection name pattern (same constraints as vault names) */
const COLLECTION_NAME_RE = /^[A-Za-z0-9_-]+$/;

/** HMAC-SHA256 hex string: exactly 64 lowercase hex characters */
const HMAC_HEX_RE = /^[0-9a-f]{64}$/;

/** Create document request */
export const CreateDocumentRequest = z.object({
  collection: z
    .string()
    .min(1)
    .max(255)
    .regex(COLLECTION_NAME_RE, "Collection name must be alphanumeric (hyphens and underscores allowed)"),
  data: z
    .string()
    .max(MAX_DATA_SIZE, `Data must not exceed ${MAX_DATA_SIZE} bytes`)
    .regex(BASE64_RE, "Data must be valid base64"),
  hmac: z
    .string()
    .regex(HMAC_HEX_RE, "HMAC must be a valid SHA-256 hex string (64 characters)")
    .optional(),
});
export type CreateDocumentRequest = z.infer<typeof CreateDocumentRequest>;

/** Update document request */
export const UpdateDocumentRequest = z.object({
  data: z
    .string()
    .max(MAX_DATA_SIZE, `Data must not exceed ${MAX_DATA_SIZE} bytes`)
    .regex(BASE64_RE, "Data must be valid base64"),
  hmac: z
    .string()
    .regex(HMAC_HEX_RE, "HMAC must be a valid SHA-256 hex string (64 characters)")
    .optional(),
  version: z.number().optional(),
});
export type UpdateDocumentRequest = z.infer<typeof UpdateDocumentRequest>;

/** Document response */
export const DocumentResponse = z.object({
  uid: z.string(),
  collection: z.string(),
  data: z.string(),
  hmac: z.string().nullable(),
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});
export type DocumentResponse = z.infer<typeof DocumentResponse>;

/** List documents response */
export const DocumentListResponse = z.object({
  documents: z.array(DocumentResponse),
});
export type DocumentListResponse = z.infer<typeof DocumentListResponse>;

/** Document sync response */
export const DocumentSyncResponse = z.object({
  documents: z.array(DocumentResponse),
  syncedAt: z.number(),
});
export type DocumentSyncResponse = z.infer<typeof DocumentSyncResponse>;

// ===================
// API Key schemas
// ===================

/** Create API key request */
export const CreateApiKeyRequest = z.object({
  name: z.string().min(1).max(255),
  permissions: z.array(z.enum(["read", "write", "delete"])).optional(),
  vaultUids: z.array(z.string()).optional(),
  collections: z.array(z.string()).optional(),
  expiresAt: z.number().optional(),
});
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequest>;

/** API key response (without secret) */
export const ApiKeyResponse = z.object({
  uid: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  permissions: z.array(z.string()),
  vaultUids: z.array(z.string()).nullable(),
  collections: z.array(z.string()).nullable(),
  expiresAt: z.number().nullable(),
  lastUsedAt: z.number().nullable(),
  createdAt: z.number(),
  revokedAt: z.number().nullable(),
});
export type ApiKeyResponse = z.infer<typeof ApiKeyResponse>;

/** API key created response (includes secret key - only returned once) */
export const ApiKeyCreatedResponse = ApiKeyResponse.extend({
  key: z.string(),
});
export type ApiKeyCreatedResponse = z.infer<typeof ApiKeyCreatedResponse>;

/** List API keys response */
export const ApiKeysListResponse = z.object({
  apiKeys: z.array(ApiKeyResponse),
});
export type ApiKeysListResponse = z.infer<typeof ApiKeysListResponse>;
