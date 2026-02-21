/**
 * API key authentication middleware
 * Handles Bearer ulk_... tokens for agent/service access
 */

import { createMiddleware } from "hono/factory";
import { hashToken } from "#features/auth/jwt.js";
import { getApiKeyByHash, updateApiKeyLastUsed } from "#db/client.js";
import { ApiException, errors, getError } from "#errors.js";
import type { SessionContext } from "#features/auth/middleware.js";

/**
 * API key authentication middleware
 * Checks for Authorization: Bearer ulk_... header
 * Verifies key is valid, not revoked, not expired
 * Sets session context with user + API key metadata
 */
export const apiKeyAuthMiddleware = createMiddleware<{
  Variables: { session: SessionContext };
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  
  if (!authHeader?.startsWith("Bearer ulk_")) {
    throw new ApiException(getError("unauthorized"), 401);
  }

  const apiKey = authHeader.slice(7); // Remove "Bearer "
  
  // Validate format: ulk_ + 48 hex chars = 52 total
  if (apiKey.length !== 52 || !apiKey.startsWith("ulk_")) {
    throw new ApiException(getError("unauthorized"), 401);
  }

  // Hash and lookup
  const keyHash = hashToken(apiKey);
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
});
