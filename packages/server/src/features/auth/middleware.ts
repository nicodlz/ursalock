/**
 * Authentication middleware
 * Pattern: Darika style - typed context variables
 */

import { createMiddleware } from "hono/factory";
import type { User } from "#db/schema.js";
import { verifyToken, hashToken } from "#features/auth/jwt.js";
import { getSessionByTokenHash } from "#db/client.js";
import { getError, ApiException } from "#errors.js";

/** Session context available after authentication */
export interface SessionContext {
  user: Pick<User, "id" | "uid" | "email">;
  sessionId: number;
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
 */
export const requireAuthMiddleware = createMiddleware<{
  Variables: { session: SessionContext };
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  
  if (!authHeader?.startsWith("Bearer ")) {
    throw new ApiException(getError("unauthorized"), 401);
  }

  const token = authHeader.slice(7);
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
