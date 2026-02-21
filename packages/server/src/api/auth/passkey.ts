/**
 * Passkey (WebAuthn) authentication routes
 * Uses @simplewebauthn/server for standards-compliant WebAuthn
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/types";

import {
  createUser,
  getUserByEmail,
  createPasskey,
  getPasskeyByCredentialId,
  getPasskeysByUserId,
  updatePasskeyCounter,
  createSession,
} from "#db/client.js";
import { createToken, hashToken } from "#features/auth/jwt.js";
import { errors, ApiException, type ApiError } from "#errors.js";
import { env } from "#env.js";
// NOTE: Recovery key generation removed - now using ZKCredentials PRF
// Legacy passkey routes kept for backward compatibility
import { getRpConfigFromRequest } from "#features/auth/origin.js";
import { logAuthEvent, extractRequestMeta } from "#features/auth/audit-log.js";

/**
 * In-memory challenge store for WebAuthn ceremonies.
 *
 * @remarks
 * This implementation is suitable for single-instance deployments.
 * **For production multi-instance deployments, replace with Redis or another
 * shared store** to ensure challenges are accessible across all server instances
 * and to benefit from automatic TTL-based expiry.
 *
 * Constraints:
 * - Maximum {@link MAX_CHALLENGES} entries to prevent memory exhaustion
 * - Expired challenges are pruned on every access and periodically
 * - When at capacity, oldest entries are evicted (LRU-style)
 */

interface ChallengeEntry {
  challenge: string;
  email?: string;
  userId?: number;
  expiresAt: number;
}

const MAX_CHALLENGES = 1000;
const challengeStore = new Map<string, ChallengeEntry>();

/**
 * Remove all expired entries from the challenge store.
 */
function pruneExpiredChallenges(): void {
  const now = Date.now();
  for (const [key, value] of challengeStore) {
    if (value.expiresAt < now) {
      challengeStore.delete(key);
    }
  }
}

/**
 * Evict oldest entries when the store exceeds MAX_CHALLENGES.
 */
function evictOldestChallenges(): void {
  if (challengeStore.size <= MAX_CHALLENGES) return;

  // Map preserves insertion order — delete earliest entries
  const excess = challengeStore.size - MAX_CHALLENGES;
  let deleted = 0;
  for (const key of challengeStore.keys()) {
    if (deleted >= excess) break;
    challengeStore.delete(key);
    deleted++;
  }
}

/**
 * Store a challenge with automatic capacity management.
 */
function setChallenge(key: string, entry: ChallengeEntry): void {
  pruneExpiredChallenges();
  challengeStore.set(key, entry);
  evictOldestChallenges();
}

/**
 * Retrieve and validate a challenge (returns undefined if expired or missing).
 */
function getChallenge(key: string): ChallengeEntry | undefined {
  const entry = challengeStore.get(key);
  if (!entry) return undefined;

  if (entry.expiresAt < Date.now()) {
    challengeStore.delete(key);
    return undefined;
  }

  return entry;
}

// Periodic cleanup as safety net (in addition to per-access pruning)
setInterval(() => {
  pruneExpiredChallenges();
}, 60000);

// Schemas
const PasskeyRegisterOptionsRequest = z.object({
  email: z.string().email().optional(),
});

const PasskeyRegisterVerifyRequest = z.object({
  email: z.string().email().optional(),
  credential: z.any(), // RegistrationResponseJSON
});

const PasskeyLoginOptionsRequest = z.object({
  email: z.string().email().optional(),
});

const PasskeyLoginVerifyRequest = z.object({
  credential: z.any(), // AuthenticationResponseJSON
});

const PasskeyCheckRequest = z.object({
  email: z.string().email(),
});

export const passkeyRouter = new Hono()
  // Get registration options (start passkey signup)
  .post(
    "/register/options",
    zValidator("json", PasskeyRegisterOptionsRequest),
    async (c) => {
      const { email: rawEmail } = c.req.valid("json");
      const email = rawEmail ? rawEmail.toLowerCase().trim() : undefined;

      // Check if email already registered
      if (email) {
        const existing = getUserByEmail(email);
        if (existing) {
          throw new ApiException(errors.email_already_exists as ApiError, 409);
        }
      }

      // Generate a temporary user ID for registration
      const tempUserId = crypto.randomUUID();

      // Get RP config from request origin
      const { rpId } = getRpConfigFromRequest(c);

      const options = await generateRegistrationOptions({
        rpName: env.RP_NAME,
        rpID: rpId,
        userName: email ?? tempUserId,
        userDisplayName: email ?? "Anonymous User",
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
          // No authenticatorAttachment = allow both platform (TouchID) AND cross-platform (Proton Pass, security keys)
        },
        timeout: 60000,
      });

      // Store challenge for verification - use challenge itself as key
      // This works because the challenge is returned to client and sent back in verify
      setChallenge(options.challenge, {
        challenge: options.challenge,
        email: email ?? undefined,
        expiresAt: Date.now() + 120000, // 2 min expiry
      });

      return c.json(options);
    },
  )

  // Verify registration (complete passkey signup)
  .post(
    "/register/verify",
    zValidator("json", PasskeyRegisterVerifyRequest),
    async (c) => {
      const { email: rawEmail, credential } = c.req.valid("json");
      const email = rawEmail ? rawEmail.toLowerCase().trim() : undefined;
      const response = credential as RegistrationResponseJSON;

      // Decode clientDataJSON to extract challenge
      const clientDataJSON = JSON.parse(
        Buffer.from(response.response.clientDataJSON, "base64url").toString("utf-8")
      );
      const challenge = clientDataJSON.challenge;

      // Get stored challenge data
      const stored = getChallenge(challenge);
      
      if (!stored) {
        throw new ApiException(errors.invalid_credentials as ApiError, 401);
      }

      // Use email from request or from stored challenge data
      const userEmail = email ?? stored.email;

      // Check for existing user with email
      if (userEmail) {
        const existing = getUserByEmail(userEmail);
        if (existing) {
          throw new ApiException(errors.email_already_exists as ApiError, 409);
        }
      }

      // Get RP config from request origin
      const { rpId, rpOrigin } = getRpConfigFromRequest(c);

      try {
        const verification = await verifyRegistrationResponse({
          response,
          expectedChallenge: stored.challenge,
          expectedOrigin: rpOrigin,
          expectedRPID: rpId,
        });

        if (!verification.verified || !verification.registrationInfo) {
          throw new ApiException(errors.invalid_credentials as ApiError, 401);
        }

        const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

        // Create user
        const user = createUser({ email: userEmail ?? undefined, passwordHash: undefined });

        // Store passkey
        createPasskey({
          userId: user.id,
          credentialId: credentialID,
          publicKey: Buffer.from(credentialPublicKey).toString("base64"),
          counter,
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          transports: response.response.transports as AuthenticatorTransportFuture[] | undefined,
        });

        // Create session
        const token = await createToken({ userId: user.uid, email: userEmail ?? undefined });
        const tokenHash = hashToken(token);
        const expiresAt = Math.floor(Date.now() / 1000) + env.JWT_EXPIRY;
        createSession({ userId: user.id, tokenHash, expiresAt });

        // Clean up challenge
        challengeStore.delete(challenge);

        // NOTE: Recovery key no longer returned - use ZKCredentials for E2EE
        return c.json({
          user: {
            id: user.uid,
            email: user.email,
            createdAt: user.createdAt,
          },
          token,
        });
      } catch (error) {
        if (error instanceof ApiException) throw error;
        logAuthEvent({
          timestamp: new Date().toISOString(),
          level: "warn",
          event: "passkey_register_fail",
          ...extractRequestMeta(c),
          details: { reason: String(error) },
        });
        throw new ApiException(errors.invalid_credentials as ApiError, 401);
      }
    },
  )

  // Get authentication options (start passkey login)
  .post(
    "/login/options",
    zValidator("json", PasskeyLoginOptionsRequest),
    async (c) => {
      const { email: rawEmail } = c.req.valid("json");
      const email = rawEmail ? rawEmail.toLowerCase().trim() : undefined;

      // If email provided, get user's passkeys for allowCredentials
      let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] | undefined;
      
      if (email) {
        const user = getUserByEmail(email);
        if (user) {
          const passkeys = getPasskeysByUserId(user.id);
          allowCredentials = passkeys.map((p) => ({
            id: p.credentialId,
            transports: p.transports?.split(",") as AuthenticatorTransportFuture[] | undefined,
          }));
        }
      }

      // Get RP config from request origin
      const { rpId } = getRpConfigFromRequest(c);

      const options = await generateAuthenticationOptions({
        rpID: rpId,
        allowCredentials,
        userVerification: "preferred",
        timeout: 60000,
      });

      // Store challenge
      const challengeKey = `auth:${options.challenge}`;
      setChallenge(challengeKey, {
        challenge: options.challenge,
        expiresAt: Date.now() + 120000,
      });

      return c.json(options);
    },
  )

  // Verify authentication (complete passkey login)
  .post(
    "/login/verify",
    zValidator("json", PasskeyLoginVerifyRequest),
    async (c) => {
      const { credential } = c.req.valid("json");
      const response = credential as AuthenticationResponseJSON;

      // Find passkey by credential ID
      const passkey = getPasskeyByCredentialId(response.id);
      if (!passkey) {
        throw new ApiException(errors.passkey_not_found as ApiError, 401);
      }

      // Extract challenge from the authenticator response
      const clientDataJSON = JSON.parse(
        Buffer.from(response.response.clientDataJSON, "base64url").toString("utf-8")
      );
      const challengeFromResponse = clientDataJSON.challenge;
      const challengeKey = `auth:${challengeFromResponse}`;

      const storedChallengeData = getChallenge(challengeKey);
      if (!storedChallengeData) {
        throw new ApiException(errors.invalid_credentials as ApiError, 401);
      }
      const storedChallenge = storedChallengeData.challenge;

      // Get RP config from request origin
      const { rpId, rpOrigin } = getRpConfigFromRequest(c);

      try {
        const verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: storedChallenge,
          expectedOrigin: rpOrigin,
          expectedRPID: rpId,
          authenticator: {
            credentialID: passkey.credentialId,
            credentialPublicKey: Buffer.from(passkey.publicKey, "base64"),
            counter: passkey.counter,
            transports: passkey.transports?.split(",") as AuthenticatorTransportFuture[] | undefined,
          },
        });

        if (!verification.verified) {
          throw new ApiException(errors.invalid_credentials as ApiError, 401);
        }

        // Verify counter to detect cloned authenticators
        const newCounter = verification.authenticationInfo.newCounter;
        if (newCounter > 0 && newCounter <= passkey.counter) {
          console.warn(
            `[SECURITY] Possible cloned authenticator detected! ` +
            `credentialId=${passkey.credentialId}, ` +
            `storedCounter=${passkey.counter}, newCounter=${newCounter}, ` +
            `userId=${passkey.user.uid}`,
          );
          throw new ApiException(
            {
              code: "invalid_credentials" as const,
              message: "Authentication rejected: authenticator counter regression detected (possible cloned authenticator)",
            },
            401,
          );
        }

        // Update counter
        updatePasskeyCounter(passkey.credentialId, newCounter);

        // Create session
        const token = await createToken({
          userId: passkey.user.uid,
          email: passkey.user.email ?? undefined,
        });
        const tokenHash = hashToken(token);
        const expiresAt = Math.floor(Date.now() / 1000) + env.JWT_EXPIRY;
        createSession({ userId: passkey.user.id, tokenHash, expiresAt });

        // Clean up challenge
        challengeStore.delete(challengeKey);

        return c.json({
          user: {
            id: passkey.user.uid,
            email: passkey.user.email,
            createdAt: passkey.user.createdAt,
          },
          token,
        });
      } catch (error) {
        if (error instanceof ApiException) throw error;
        logAuthEvent({
          timestamp: new Date().toISOString(),
          level: "warn",
          event: "passkey_login_fail",
          ...extractRequestMeta(c),
          details: { credentialId: response.id, reason: String(error) },
        });
        throw new ApiException(errors.invalid_credentials as ApiError, 401);
      }
    },
  )

  // Check if user has passkey
  .post(
    "/check",
    zValidator("json", PasskeyCheckRequest),
    (c) => {
      const { email: rawEmail } = c.req.valid("json");
      const email = rawEmail.toLowerCase().trim();
      const user = getUserByEmail(email);
      
      if (!user) {
        return c.json({ hasPasskey: false });
      }

      const passkeys = getPasskeysByUserId(user.id);
      return c.json({ hasPasskey: passkeys.length > 0 });
    },
  );
