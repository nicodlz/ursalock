/**
 * JWT token creation and verification
 * Uses jose library for standards-compliant JWT handling
 *
 * Supports secret rotation: JWT_SECRET can be a comma-separated list of secrets.
 * The first secret is "current" (used for signing), subsequent secrets are
 * "previous" (accepted for verification during rotation transition).
 */

import { createHash } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "#env.js";

/** JWT payload for user authentication */
export interface AuthTokenPayload extends JWTPayload {
  sub: string;  // User UID
  email?: string;
}

/**
 * Parse JWT_SECRET into an ordered list of secrets.
 * First element = current (for signing), rest = previous (for verification only).
 */
function getSecretKeys(): Uint8Array[] {
  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set. Refusing to sign/verify tokens with an empty secret.");
  }

  const secrets = env.JWT_SECRET.split(",").map((s) => s.trim()).filter(Boolean);

  if (secrets.length === 0) {
    throw new Error("JWT_SECRET is empty after parsing. Refusing to sign/verify tokens.");
  }

  return secrets.map((s) => new TextEncoder().encode(s));
}

/**
 * Get the current (first) secret key for signing new tokens.
 */
function getCurrentSecretKey(): Uint8Array {
  return getSecretKeys()[0]!;
}

/**
 * Create a signed JWT token (always uses the current secret)
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

  return jwt.sign(getCurrentSecretKey());
}

/**
 * Verify and decode a JWT token.
 * Tries the current secret first, then falls back to previous secrets
 * for seamless rotation. Logs a warning when validated with an old secret.
 *
 * @returns Decoded payload, or null if invalid/expired with all secrets.
 */
export async function verifyToken(token: string): Promise<AuthTokenPayload | null> {
  const keys = getSecretKeys();

  for (let i = 0; i < keys.length; i++) {
    try {
      const { payload } = await jwtVerify(token, keys[i]!);

      if (!payload.sub) {
        return null;
      }

      if (i > 0) {
        console.warn(
          `[auth/jwt] Token for sub=${payload.sub} validated with rotated secret (index=${i}). ` +
          "The token was signed with a previous JWT_SECRET. It will stop working once that secret is removed.",
        );
      }

      return payload as AuthTokenPayload;
    } catch {
      // Try next secret
      continue;
    }
  }

  return null;
}

/**
 * Hash a token for storage (prevents token theft from DB)
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
