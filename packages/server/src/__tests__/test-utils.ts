/**
 * Shared test utilities for server integration tests.
 * DRY — avoids duplicating CSRF helpers across test files.
 */

import type { Hono } from "hono";

/** CSRF cookie name (must match csrf.ts) */
const CSRF_COOKIE_NAME = "__csrf";

/**
 * Extract a CSRF token from a safe request (GET /health).
 */
export async function getCsrfToken(app: Hono): Promise<string> {
  const res = await app.request("/health");
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(new RegExp(`${CSRF_COOKIE_NAME}=([^;]+)`));
  return match?.[1] ?? "";
}

/**
 * Build headers for a mutating request (POST/PUT/DELETE) that passes CSRF.
 */
export async function csrfHeaders(app: Hono): Promise<Record<string, string>> {
  const csrf = await getCsrfToken(app);
  return { Cookie: `${CSRF_COOKIE_NAME}=${csrf}`, "X-CSRF-Token": csrf };
}
