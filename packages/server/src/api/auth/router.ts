/**
 * Auth router - email/password + passkey authentication
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import bcrypt from "bcryptjs";
import {
  createUser,
  getUserByEmail,
  createSession,
  deleteSession,
} from "#db/client.js";
import { createToken, hashToken } from "#features/auth/jwt.js";
import { requireAuthMiddleware, type SessionContext } from "#features/auth/middleware.js";
import { errors, ApiException } from "#errors.js";
import { env } from "#env.js";
import {
  EmailRegisterRequest,
  EmailLoginRequest,
  type AuthResponse,
  type MeResponse,
  type RefreshResponse,
} from "#api/schemas.js";
import { passkeyRouter } from "./passkey.js";
import { zkcRouter } from "./zkc.js";

export const authRouter = new Hono<{
  Variables: { session: SessionContext };
}>()
  // Email registration
  .post(
    "/email/register",
    zValidator("json", EmailRegisterRequest),
    async (c) => {
      const { email, password } = c.req.valid("json");

      // Check if email already exists
      const existing = getUserByEmail(email);
      if (existing) {
        throw new ApiException(errors.email_already_exists, 409);
      }

      // Hash password before transaction (avoid holding transaction during async work)
      const passwordHash = await bcrypt.hash(password, 12);

      // Pre-generate token material (async work done before transaction)
      // We create user in transaction, but need uid for JWT — so we do a two-phase approach:
      // Phase 1: create user to get uid
      // Phase 2: generate token + create session atomically
      const user = createUser({ email, passwordHash });
      const token = await createToken({ userId: user.uid, email });
      const tokenHash = hashToken(token);
      const expiresAt = Math.floor(Date.now() / 1000) + env.JWT_EXPIRY;
      createSession({ userId: user.id, tokenHash, expiresAt });

      return c.json({
        user: {
          id: user.uid,
          email: user.email,
          createdAt: user.createdAt,
        },
        token,
      } satisfies AuthResponse);
    },
  )

  // Email login
  .post(
    "/email/login",
    zValidator("json", EmailLoginRequest),
    async (c) => {
      const { email, password } = c.req.valid("json");

      const user = getUserByEmail(email);
      if (!user || !user.passwordHash) {
        throw new ApiException(errors.invalid_credentials, 401);
      }

      // Verify password with bcrypt
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        throw new ApiException(errors.invalid_credentials, 401);
      }

      // Create session
      const token = await createToken({ userId: user.uid, email: user.email ?? undefined });
      const tokenHash = hashToken(token);
      const expiresAt = Math.floor(Date.now() / 1000) + env.JWT_EXPIRY;
      createSession({ userId: user.id, tokenHash, expiresAt });

      return c.json({
        user: {
          id: user.uid,
          email: user.email,
          createdAt: user.createdAt,
        },
        token,
      } satisfies AuthResponse);
    },
  )

  // Get current user
  .get(
    "/me",
    requireAuthMiddleware,
    (c) => {
      const session = c.get("session");
      return c.json({
        user: {
          id: session.user.uid,
          email: session.user.email,
          createdAt: session.user.createdAt,
        },
      } satisfies MeResponse);
    },
  )

  // Refresh token
  .post(
    "/refresh",
    requireAuthMiddleware,
    async (c) => {
      const session = c.get("session");

      // Create new token
      const token = await createToken({
        userId: session.user.uid,
        email: session.user.email ?? undefined,
      });
      const tokenHash = hashToken(token);
      const expiresAt = Math.floor(Date.now() / 1000) + env.JWT_EXPIRY;

      // Delete old session, create new
      const oldToken = c.req.header("Authorization")?.slice(7);
      if (oldToken) {
        deleteSession(hashToken(oldToken));
      }
      createSession({ userId: session.user.id, tokenHash, expiresAt });

      return c.json({
        token,
        expiresIn: env.JWT_EXPIRY,
      } satisfies RefreshResponse);
    },
  )

  // Logout
  .post(
    "/logout",
    requireAuthMiddleware,
    (c) => {
      const token = c.req.header("Authorization")?.slice(7);
      if (token) {
        deleteSession(hashToken(token));
      }
      return c.json({ success: true });
    },
  )
  // Mount passkey routes under /auth/passkey/* (legacy)
  .route("/passkey", passkeyRouter)
  // Mount ZKC routes under /auth/zkc/* (new - passkey with PRF)
  .route("/zkc", zkcRouter);
