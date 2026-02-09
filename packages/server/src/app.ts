/**
 * Main Hono application
 * Pattern: Darika style - centralized error handling, typed routes
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { ErrorHandler } from "hono";
import { ZodError } from "zod";

import { authRouter } from "#api/auth/router.js";
import { vaultRouter } from "#api/vault/router.js";
import { ApiException, errors, type ApiError } from "#errors.js";

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
  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: "*", // Configure for production
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      exposeHeaders: ["X-Request-Id"],
    }),
  );

  // Health check
  app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

  // API routes
  app.route("/auth", authRouter);
  app.route("/vault", vaultRouter);

  // Error handling
  app.onError(errorHandler);

  // 404 handler
  app.notFound((c) => {
    return c.json(
      { error: { code: "not_found", message: "Endpoint not found" } },
      404,
    );
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
