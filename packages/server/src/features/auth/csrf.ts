/**
 * CSRF protection middleware (double-submit cookie pattern)
 * Pattern: Darika style - typed middleware with Hono createMiddleware
 */

import { createMiddleware } from "hono/factory";
import { getCookie, setCookie } from "hono/cookie";
import { ApiException } from "#errors.js";

/** Cookie name for the CSRF token */
const CSRF_COOKIE_NAME = "__csrf";

/** Header the client must send back with the cookie value */
const CSRF_HEADER_NAME = "x-csrf-token";

/** Token byte length (32 bytes → 64 hex chars) */
const TOKEN_BYTES = 32;

/** HTTP methods that are exempt from CSRF validation */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Generate a cryptographically random CSRF token.
 */
function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * CSRF protection middleware using the double-submit cookie pattern.
 *
 * For safe methods (GET/HEAD/OPTIONS): sets a CSRF cookie if not already present.
 * For mutating methods: validates that the `X-CSRF-Token` header matches the cookie.
 */
export const csrfProtection = createMiddleware(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    // Ensure a token cookie exists so the client can read it for subsequent requests
    const existing = getCookie(c, CSRF_COOKIE_NAME);
    if (!existing) {
      setCookie(c, CSRF_COOKIE_NAME, generateToken(), {
        path: "/",
        httpOnly: false, // Client JS must read this value
        sameSite: "Strict",
        secure: true,
      });
    }
    return next();
  }

  // Mutating request: validate token
  const cookieToken = getCookie(c, CSRF_COOKIE_NAME);
  const headerToken = c.req.header(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new ApiException(
      { code: "invalid_request", message: "Invalid or missing CSRF token" },
      403,
    );
  }

  // Rotate token after successful validation
  setCookie(c, CSRF_COOKIE_NAME, generateToken(), {
    path: "/",
    httpOnly: false,
    sameSite: "Strict",
    secure: true,
  });

  await next();
});
