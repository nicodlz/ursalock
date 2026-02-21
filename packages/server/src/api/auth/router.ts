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
  CreateApiKeyRequest,
  type AuthResponse,
  type MeResponse,
  type RefreshResponse,
  type ApiKeyCreatedResponse,
  type ApiKeysListResponse,
} from "#api/schemas.js";
import { generateApiKey, getKeyPrefix } from "#features/auth/key-gen.js";
import { createApiKey, listApiKeysByUserId, revokeApiKey } from "#db/client.js";
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
      const { email: rawEmail, password } = c.req.valid("json");
      const email = rawEmail.toLowerCase().trim();

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
      const { email: rawEmail, password } = c.req.valid("json");
      const email = rawEmail.toLowerCase().trim();

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

  // API key management routes (JWT auth required)
  // Create API key (returns raw key ONCE)
  .post(
    "/api-keys",
    requireAuthMiddleware,
    zValidator("json", CreateApiKeyRequest),
    async (c) => {
      const session = c.get("session");
      
      // API keys cannot create API keys - must be JWT auth
      if (session.apiKey) {
        throw new ApiException(errors.insufficient_permissions, 403);
      }

      const input = c.req.valid("json");

      // Generate API key
      const key = generateApiKey();
      const keyPrefix = getKeyPrefix(key);
      const keyHash = hashToken(key);

      // Create in DB
      const apiKey = createApiKey({
        userId: session.user.id,
        name: input.name,
        keyHash,
        keyPrefix,
        permissions: input.permissions,
        vaultUids: input.vaultUids,
        collections: input.collections,
        expiresAt: input.expiresAt,
      });

      // Parse JSON fields for response
      const permissions = JSON.parse(apiKey.permissions) as string[];
      const vaultUids = apiKey.vaultUids ? (JSON.parse(apiKey.vaultUids) as string[]) : null;
      const collections = apiKey.collections ? (JSON.parse(apiKey.collections) as string[]) : null;

      return c.json({
        uid: apiKey.uid,
        name: apiKey.name,
        key, // Only returned on creation!
        keyPrefix: apiKey.keyPrefix,
        permissions,
        vaultUids,
        collections,
        expiresAt: apiKey.expiresAt,
        lastUsedAt: apiKey.lastUsedAt,
        createdAt: apiKey.createdAt,
        revokedAt: apiKey.revokedAt,
      } satisfies ApiKeyCreatedResponse);
    },
  )

  // List API keys (metadata only, no secrets)
  .get(
    "/api-keys",
    requireAuthMiddleware,
    (c) => {
      const session = c.get("session");
      
      // API keys cannot list API keys - must be JWT auth
      if (session.apiKey) {
        throw new ApiException(errors.insufficient_permissions, 403);
      }

      const apiKeys = listApiKeysByUserId(session.user.id);

      return c.json({
        apiKeys: apiKeys.map((key) => ({
          uid: key.uid,
          name: key.name,
          keyPrefix: key.keyPrefix,
          permissions: JSON.parse(key.permissions) as string[],
          vaultUids: key.vaultUids ? (JSON.parse(key.vaultUids) as string[]) : null,
          collections: key.collections ? (JSON.parse(key.collections) as string[]) : null,
          expiresAt: key.expiresAt,
          lastUsedAt: key.lastUsedAt,
          createdAt: key.createdAt,
          revokedAt: key.revokedAt,
        })),
      } satisfies ApiKeysListResponse);
    },
  )

  // Revoke API key
  .delete(
    "/api-keys/:uid",
    requireAuthMiddleware,
    (c) => {
      const session = c.get("session");
      
      // API keys cannot revoke API keys - must be JWT auth
      if (session.apiKey) {
        throw new ApiException(errors.insufficient_permissions, 403);
      }

      const uid = c.req.param("uid");
      const revoked = revokeApiKey(uid, session.user.id);

      if (!revoked) {
        throw new ApiException(errors.api_key_not_found, 404);
      }

      return c.json({ success: true });
    },
  )
  
  // Mount passkey routes under /auth/passkey/* (legacy)
  .route("/passkey", passkeyRouter)
  // Mount ZKC routes under /auth/zkc/* (new - passkey with PRF)
  .route("/zkc", zkcRouter);
