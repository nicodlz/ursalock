/**
 * @zod-vault/server
 * Self-hostable E2EE vault server with SQLite
 */

// App factory
export { createApp, type App } from "#app.js";

// Database
export { getDb, closeDb } from "#db/client.js";
export type { User, Passkey, Session, Vault } from "#db/schema.js";

// Auth utilities
export { createToken, verifyToken, hashToken } from "#features/auth/jwt.js";
export { requireAuthMiddleware, optionalAuthMiddleware } from "#features/auth/middleware.js";
export type { SessionContext } from "#features/auth/middleware.js";

// Errors
export { ApiException, errors, getError } from "#errors.js";
export type { ApiError, ErrorCode } from "#errors.js";

// Schemas (for client type generation)
export * from "#api/schemas.js";
