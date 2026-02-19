/**
 * JWT token creation and verification
 * Uses jose library for standards-compliant JWT handling
 */

import { createHash } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "#env.js";

/** JWT payload for user authentication */
export interface AuthTokenPayload extends JWTPayload {
  sub: string;  // User UID
  email?: string;
}

/** Encode secret as Uint8Array for jose */
function getSecretKey(): Uint8Array {
  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set. Refusing to sign/verify tokens with an empty secret.");
  }
  return new TextEncoder().encode(env.JWT_SECRET);
}

/**
 * Create a signed JWT token
 */
export async function createToken(payload: { userId: string; email?: string }): Promise<string> {
  // Add jti (JWT ID) for uniqueness even when created at same millisecond
  const jti = crypto.randomUUID();
  
  const jwt = new SignJWT({ email: payload.email })
    .setSubject(payload.userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_EXPIRY}s`)
    .setProtectedHeader({ alg: "HS256" });

  return jwt.sign(getSecretKey());
}

/**
 * Verify and decode a JWT token
 * Returns null if invalid or expired
 */
export async function verifyToken(token: string): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    
    if (!payload.sub) {
      return null;
    }
    
    return payload as AuthTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Hash a token for storage (prevents token theft from DB)
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
