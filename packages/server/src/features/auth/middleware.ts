/**
 * Authentication middleware
 * Pattern: Darika style - typed context variables
 */

import { createMiddleware } from "hono/factory";
import type { User } from "#db/schema.js";
import { verifyToken, hashToken } from "#features/auth/jwt.js";
import { getSessionByTokenHash, getApiKeyByHash, updateApiKeyLastUsed } from "#db/client.js";
import { getError, ApiException } from "#errors.js";

/** Session context available after authentication */
export interface SessionContext {
  user: Pick<User, "id" | "uid" | "email">;
  sessionId: number;
  /** API key context (only present for API key auth) */
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
  });

  return next();
});

/**
 * Required auth middleware - throws if no valid session
 * Tries JWT first, then falls back to API key auth
 */
export const requireAuthMiddleware = createMiddleware<{
  Variables: { session: SessionContext };
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  
  if (!authHeader?.startsWith("Bearer ")) {
    throw new ApiException(getError("unauthorized"), 401);
  }

  const token = authHeader.slice(7);

  // Check if it's an API key (starts with ulk_)
  if (token.startsWith("ulk_")) {
    // Validate format: ulk_ + 48 hex chars = 52 total
    if (token.length !== 52) {
      throw new ApiException(getError("unauthorized"), 401);
    }

    // Hash and lookup
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

    // Update last used (async, don't block)
    setImmediate(() => {
      try {
        updateApiKeyLastUsed(keyRecord.uid);
      } catch {
        // Ignore errors - last_used_at is non-critical
      }
    });

    // Parse permissions and scopes
    const permissions = JSON.parse(keyRecord.permissions) as string[];
    const vaultUids = keyRecord.vaultUids ? (JSON.parse(keyRecord.vaultUids) as string[]) : null;
    const collections = keyRecord.collections ? (JSON.parse(keyRecord.collections) as string[]) : null;

    // Set session context
    c.set("session", {
      user: {
        id: keyRecord.user.id,
        uid: keyRecord.user.uid,
        email: keyRecord.user.email,
      },
      sessionId: keyRecord.id,
      apiKey: {
        uid: keyRecord.uid,
        permissions,
        vaultUids,
        collections,
      },
    });

    return next();
  }

  // JWT authentication
  const payload = await verifyToken(token);
  
  if (!payload?.sub) {
    throw new ApiException(getError("unauthorized"), 401);
  }

  // Verify session exists in DB
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
  });

  return next();
});

/**
 * Require permission middleware factory
 * Checks if API key has the required permission
 * JWT users have all permissions by default
 */
export const requirePermission = (permission: string) => {
  return createMiddleware<{
    Variables: { session: SessionContext };
  }>(async (c, next) => {
    const session = c.get("session");
    
    // JWT users have full access
    if (!session.apiKey) {
      return next();
    }

    // Check API key permission
    if (!session.apiKey.permissions.includes(permission)) {
      throw new ApiException(getError("insufficient_permissions"), 403);
    }

    return next();
  });
};

/**
 * Require vault access middleware
 * Checks if API key has access to the requested vault
 * JWT users have access to all their vaults
 */
export const requireVaultAccess = createMiddleware<{
  Variables: { session: SessionContext };
}>(async (c, next) => {
  const session = c.get("session");
  
  // JWT users have full access
  if (!session.apiKey) {
    return next();
  }

  // If vaultUids is null, key has access to all vaults
  if (session.apiKey.vaultUids === null) {
    return next();
  }

  // Get vault UID from request params (different routes use different names)
  const vaultUid = c.req.param("vaultUid") ?? c.req.param("uid");
  if (!vaultUid) {
    // No vault UID in params - allow (will fail at service layer if needed)
    return next();
  }

  // Check if API key has access to this vault
  if (!session.apiKey.vaultUids.includes(vaultUid)) {
    throw new ApiException(getError("vault_not_found"), 404);
  }

  return next();
});

/**
 * Require collection access middleware
 * Checks if API key has access to the requested collection
 * JWT users have access to all collections
 */
export const requireCollectionAccess = createMiddleware<{
  Variables: { session: SessionContext };
}>(async (c, next) => {
  const session = c.get("session");
  
  // JWT users have full access
  if (!session.apiKey) {
    return next();
  }

  // If collections is null, key has access to all collections
  if (session.apiKey.collections === null) {
    return next();
  }

  // Get collection from request body or query
  const body = await c.req.json().catch(() => null);
  const collection = body?.collection || c.req.query("collection");
  
  if (!collection) {
    // No collection specified - allow (will fail at service layer if needed)
    return next();
  }

  // Check if API key has access to this collection
  if (!session.apiKey.collections.includes(collection)) {
    throw new ApiException(getError("insufficient_permissions"), 403);
  }

  return next();
});
