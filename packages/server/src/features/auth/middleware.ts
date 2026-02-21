/**
 * Authentication middleware
 * Pattern: Darika style - typed context variables
 */

import { createMiddleware } from "hono/factory";
import { type User, parseApiKeyScopes } from "#db/schema.js";
import { verifyToken, hashToken } from "#features/auth/jwt.js";
import { getSessionByTokenHash, getApiKeyByHash, updateApiKeyLastUsed } from "#db/client.js";
import { getError, ApiException } from "#errors.js";

/** Session context available after authentication */
export interface SessionContext {
  user: Pick<User, "id" | "uid" | "email">;
  /** For JWT: session row ID. For API key: api_key row ID. Use authType to distinguish. */
  sessionId: number;
  /** Authentication method used */
  authType: "jwt" | "apiKey";
  /** API key context (only present when authType === "apiKey") */
  apiKey?: {
    uid: string;
    permissions: string[];
    vaultUids: string[] | null;
    collections: string[] | null;
  };
}

/**
 * Optional auth middleware - sets session if valid token present
 */
export const optionalAuthMiddleware = createMiddleware<{
  Variables: { session: SessionContext | null };
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  
  if (!authHeader?.startsWith("Bearer ")) {
    c.set("session", null);
    return next();
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);
  
  if (!payload?.sub) {
    c.set("session", null);
    return next();
  }

  // Verify session exists in DB
  const tokenHash = hashToken(token);
  const session = getSessionByTokenHash(tokenHash);
  
  if (!session) {
    c.set("session", null);
    return next();
  }

  c.set("session", {
    user: {
      id: session.user.id,
      uid: session.user.uid,
      email: session.user.email,
    },
    sessionId: session.id,
    authType: "jwt",
  });

  return next();
});

/**
 * Required auth middleware - throws if no valid session
 * Tries JWT first, then falls back to API key auth.
 *
 * API key lookup is timing-safe: we compare SHA-256 hashes via SQL equality,
 * so the raw key is never compared directly (no timing oracle).
 */
export const requireAuthMiddleware = createMiddleware<{
  Variables: { session: SessionContext };
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  
  if (!authHeader?.startsWith("Bearer ")) {
    throw new ApiException(getError("unauthorized"), 401);
  }

  const token = authHeader.slice(7);

  // API key auth path (ulk_ prefix)
  if (token.startsWith("ulk_")) {
    // Validate format: ulk_ + 48 hex chars = 52 total
    if (token.length !== 52) {
      throw new ApiException(getError("unauthorized"), 401);
    }

    // Hash and lookup — comparing hashes, not raw secrets (timing-safe)
    const keyHash = hashToken(token);
    const keyRecord = getApiKeyByHash(keyHash);
    
    if (!keyRecord) {
      throw new ApiException(getError("unauthorized"), 401);
    }

    // Check if revoked
    if (keyRecord.revokedAt !== null) {
      throw new ApiException(getError("api_key_revoked"), 401);
    }

    // Check if expired
    const now = Math.floor(Date.now() / 1000);
    if (keyRecord.expiresAt !== null && keyRecord.expiresAt <= now) {
      throw new ApiException(getError("unauthorized"), 401);
    }

    // Update last used (async, non-blocking — last_used_at is non-critical)
    setImmediate(() => {
      try { updateApiKeyLastUsed(keyRecord.uid); } catch { /* ignore */ }
    });

    const scopes = parseApiKeyScopes(keyRecord);

    c.set("session", {
      user: {
        id: keyRecord.user.id,
        uid: keyRecord.user.uid,
        email: keyRecord.user.email,
      },
      sessionId: keyRecord.id,
      authType: "apiKey",
      apiKey: {
        uid: keyRecord.uid,
        ...scopes,
      },
    });

    return next();
  }

  // JWT auth path
  const payload = await verifyToken(token);
  
  if (!payload?.sub) {
    throw new ApiException(getError("unauthorized"), 401);
  }

  const tokenHash = hashToken(token);
  const session = getSessionByTokenHash(tokenHash);
  
  if (!session) {
    throw new ApiException(getError("session_expired"), 401);
  }

  c.set("session", {
    user: {
      id: session.user.id,
      uid: session.user.uid,
      email: session.user.email,
    },
    sessionId: session.id,
    authType: "jwt",
  });

  return next();
});

/**
 * Require permission middleware factory
 * JWT users have all permissions by default.
 */
export const requirePermission = (permission: string) => {
  return createMiddleware<{
    Variables: { session: SessionContext };
  }>(async (c, next) => {
    const session = c.get("session");
    
    if (!session.apiKey) return next();

    if (!session.apiKey.permissions.includes(permission)) {
      throw new ApiException(getError("insufficient_permissions"), 403);
    }

    return next();
  });
};

/**
 * Require vault access middleware
 * Checks if API key has access to the requested vault.
 * JWT users have access to all their vaults.
 */
export const requireVaultAccess = createMiddleware<{
  Variables: { session: SessionContext };
}>(async (c, next) => {
  const session = c.get("session");
  
  if (!session.apiKey) return next();
  if (session.apiKey.vaultUids === null) return next();

  // Different routes use different param names for vault UID
  const vaultUid = c.req.param("vaultUid") ?? c.req.param("uid");
  if (!vaultUid) return next(); // No vault param — will fail at service layer

  if (!session.apiKey.vaultUids.includes(vaultUid)) {
    throw new ApiException(getError("vault_not_found"), 404);
  }

  return next();
});

/**
 * Require collection access middleware factory
 * Takes a function to extract the collection name from the request context,
 * avoiding body stream consumption issues.
 *
 * For routes where collection comes from query params, use:
 *   requireCollectionAccess((c) => c.req.query("collection"))
 *
 * For routes where collection comes from validated body, check inline
 * after Zod validation in the handler (body already parsed).
 */
export const requireCollectionAccess = (getCollection: (c: unknown) => string | undefined) => {
  return createMiddleware<{
    Variables: { session: SessionContext };
  }>(async (c, next) => {
    const session = c.get("session");
    
    if (!session.apiKey) return next();
    if (session.apiKey.collections === null) return next();

    const collection = getCollection(c);
    if (!collection) return next();

    if (!session.apiKey.collections.includes(collection)) {
      throw new ApiException(getError("insufficient_permissions"), 403);
    }

    return next();
  });
};

/**
 * Inline collection scope check for use after Zod body validation.
 * Call this in handlers where collection comes from the parsed body.
 */
export function assertCollectionAccess(session: SessionContext, collection: string): void {
  if (!session.apiKey) return;
  if (session.apiKey.collections === null) return;
  if (!session.apiKey.collections.includes(collection)) {
    throw new ApiException(getError("insufficient_permissions"), 403);
  }
}
