/**
 * Main Hono application
 * Pattern: Darika style - centralized error handling, typed routes
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type { ErrorHandler } from "hono";
import { ZodError } from "zod";

import { authRouter } from "#api/auth/router.js";
import { vaultRouter } from "#api/vault/router.js";
import { documentRouter } from "#api/document/router.js";
import { rateLimit } from "#features/auth/rate-limit.js";
import { deleteExpiredApiKeys } from "#db/client.js";
import { ApiException, errors, type ApiError } from "#errors.js";
import { env, getAllowedOrigins } from "#env.js";

/** Global error handler */
const errorHandler: ErrorHandler = (error, c) => {
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();

  // Handle known API errors
  if (error instanceof ApiException) {
    return c.json(
      { error: error.error, requestId },
      error.status as 400 | 401 | 403 | 404 | 409 | 500,
    );
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const message = error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ");
    return c.json(
      {
        error: {
          code: "validation_error",
          message,
          details: { errors: error.errors },
        } satisfies ApiError,
        requestId,
      },
      400,
    );
  }

  // Log unknown errors
  console.error(`[${requestId}] Unhandled error:`, error);

  return c.json(
    { error: errors.internal_error, requestId },
    500,
  );
};

/** Create the Hono app */
export function createApp() {
  const app = new Hono();

  // Middleware
  app.use("*", bodyLimit({ maxSize: 11 * 1024 * 1024 }));
  app.use(
    "*",
    secureHeaders({
      strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
      xFrameOptions: "DENY",
      xContentTypeOptions: "nosniff",
      referrerPolicy: "strict-origin-when-cross-origin",
    }),
  );
  if (env.NODE_ENV !== "production") {
    app.use("*", logger());
  }

  // Dynamic CORS origin validation
  const allowedOrigins = new Set(getAllowedOrigins());
  app.use(
    "*",
    cors({
      origin: (origin) => (allowedOrigins.has(origin) ? origin : ""),
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
      exposeHeaders: ["X-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
    }),
  );

  // Global rate limit
  app.use("*", rateLimit({ max: 100, windowMs: 60_000 }));

  // CSRF protection is intentionally NOT enabled globally.
  // This API uses Bearer token auth + strict CORS origin validation,
  // which is immune to CSRF attacks. The double-submit cookie pattern
  // is only needed for cookie-based session auth (not our case).
  // See: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#token-based-mitigation

  // Health check
  app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

  // Housekeeping: clean up expired API keys on startup (best-effort)
  try { deleteExpiredApiKeys(); } catch { /* ignore on fresh DB */ }

  // Stricter rate limit for auth endpoints
  app.use("/auth/*", rateLimit({ max: 10, windowMs: 60_000 }));

  // API routes
  app.route("/auth", authRouter);
  app.route("/vault", vaultRouter);
  app.route("/", documentRouter); // Document routes include vault UID in path

  // Error handling
  app.onError(errorHandler);

  // 404 handler
  app.notFound((c) => {
    const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
    return c.json(
      { error: { code: "not_found", message: "Endpoint not found" }, requestId },
      404,
    );
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
