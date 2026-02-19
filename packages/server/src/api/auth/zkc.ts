/**
 * Zero-Knowledge Credentials (ZKC) authentication routes
 * 
 * Simplified auth using @z-base/zero-knowledge-credentials on the client.
 * Client handles WebAuthn PRF, server just tracks users by opaque ID.
 * No recovery keys - encryption keys are derived from the passkey itself.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import {
  createUser,
  getUserByOpaqueId,
  createSession,
} from "#db/client.js";
import { createToken, hashToken } from "#features/auth/jwt.js";
import { errors, ApiException, type ApiError } from "#errors.js";
import { env } from "#env.js";

// Request schemas
const ZkcRegisterRequest = z.object({
  /** Opaque identifier from ZKCredentials */
  opaqueId: z.string().min(1),
  /** Optional display name */
  displayName: z.string().optional(),
});

const ZkcAuthenticateRequest = z.object({
  /** Opaque identifier from ZKCredentials */
  opaqueId: z.string().min(1),
});

const ZkcCheckRequest = z.object({
  /** Opaque identifier to check */
  opaqueId: z.string().min(1),
});

export const zkcRouter = new Hono()
  /**
   * Register a new user with ZKCredentials opaque ID
   * Client has already created the passkey, we just store the opaque ID
   */
  .post(
    "/register",
    zValidator("json", ZkcRegisterRequest),
    async (c) => {
      const { opaqueId, displayName } = c.req.valid("json");

      // Check if opaque ID already registered
      const existing = getUserByOpaqueId(opaqueId);
      if (existing) {
        throw new ApiException(errors.opaque_id_exists as ApiError, 409);
      }

      // Create user with opaque ID (no email, no password)
      const user = createUser({
        opaqueId,
        displayName,
      });

      // Create session
      const token = await createToken({ userId: user.uid });
      const tokenHash = hashToken(token);
      const expiresAt = Math.floor(Date.now() / 1000) + env.JWT_EXPIRY;
      createSession({ userId: user.id, tokenHash, expiresAt });

      return c.json({
        user: {
          id: user.uid,
          createdAt: user.createdAt,
        },
        token,
      });
    },
  )

  /**
   * Authenticate an existing user by opaque ID
   * Client has already verified with ZKCredentials, we just issue a token
   */
  .post(
    "/authenticate",
    zValidator("json", ZkcAuthenticateRequest),
    async (c) => {
      const { opaqueId } = c.req.valid("json");

      // Find user by opaque ID
      const user = getUserByOpaqueId(opaqueId);
      if (!user) {
        throw new ApiException(errors.passkey_not_found as ApiError, 401);
      }

      // Create session
      const token = await createToken({ userId: user.uid });
      const tokenHash = hashToken(token);
      const expiresAt = Math.floor(Date.now() / 1000) + env.JWT_EXPIRY;
      createSession({ userId: user.id, tokenHash, expiresAt });

      return c.json({
        user: {
          id: user.uid,
          createdAt: user.createdAt,
        },
        token,
      });
    },
  )

  /**
   * Check if an opaque ID is registered
   */
  .post(
    "/check",
    zValidator("json", ZkcCheckRequest),
    (c) => {
      const { opaqueId } = c.req.valid("json");
      const user = getUserByOpaqueId(opaqueId);
      return c.json({ hasPasskey: user !== undefined });
    },
  );
