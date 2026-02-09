/**
 * Origin validation and RP_ID derivation for multi-tenant WebAuthn
 */

import { env } from "#env.js";
import { errors, ApiException, type ApiError } from "#errors.js";

/** Parsed allowed origins from env */
let allowedOrigins: string[] | null = null;

function getAllowedOrigins(): string[] {
  if (!allowedOrigins) {
    allowedOrigins = env.RP_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  }
  return allowedOrigins;
}

/**
 * Validate origin against allowed origins and return RP config
 * @throws ApiException if origin is not allowed
 */
export function validateOrigin(origin: string | undefined): { rpId: string; rpOrigin: string } {
  if (!origin) {
    throw new ApiException(errors.invalid_origin as ApiError, 403);
  }

  const allowed = getAllowedOrigins();
  
  if (!allowed.includes(origin)) {
    console.warn(`[auth] Rejected origin: ${origin}. Allowed: ${allowed.join(", ")}`);
    throw new ApiException(errors.invalid_origin as ApiError, 403);
  }

  // Derive RP_ID from origin hostname
  const url = new URL(origin);
  const rpId = url.hostname;

  return { rpId, rpOrigin: origin };
}

/**
 * Get RP config from request Origin header
 */
export function getRpConfigFromRequest(c: { req: { header: (name: string) => string | undefined } }): { rpId: string; rpOrigin: string } {
  const origin = c.req.header("origin");
  return validateOrigin(origin);
}
