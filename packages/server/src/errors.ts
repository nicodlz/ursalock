/**
 * Error codes and factories
 * Pattern: Darika style - typed error codes + factory functions
 */

import { z } from "zod";

/** All error codes in the system */
export const ErrorCode = z.enum([
  // Auth errors
  "unauthorized",
  "invalid_credentials",
  "email_already_exists",
  "opaque_id_exists",
  "passkey_not_found",
  "session_expired",
  "invalid_origin",
  "api_key_not_found",
  "api_key_revoked",
  "insufficient_permissions",
  
  // Vault errors
  "vault_not_found",
  "vault_already_exists",
  "vault_conflict",
  "invalid_vault_data",
  
  // Document errors
  "document_not_found",
  "document_conflict",
  "document_already_exists",
  
  // Validation errors
  "validation_error",
  "invalid_request",
  
  // Server errors
  "internal_error",
]);

export type ErrorCode = z.infer<typeof ErrorCode>;

/** API error response shape */
export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** Error class for throwing API errors */
export class ApiException extends Error {
  constructor(
    public readonly error: ApiError,
    public readonly status: number = 400,
  ) {
    super(error.message);
    this.name = "ApiException";
  }
}

/** Error factories - typed specifically for each error */
export const errors = {
  // Auth errors
  unauthorized: { code: "unauthorized" as const, message: "Unauthorized" },
  invalid_credentials: { code: "invalid_credentials" as const, message: "Invalid email or password" },
  email_already_exists: { code: "email_already_exists" as const, message: "Email already registered" },
  opaque_id_exists: { code: "opaque_id_exists" as const, message: "Opaque ID already registered" },
  passkey_not_found: { code: "passkey_not_found" as const, message: "Passkey not found" },
  session_expired: { code: "session_expired" as const, message: "Session expired" },
  invalid_origin: { code: "invalid_origin" as const, message: "Origin not allowed" },
  api_key_not_found: { code: "api_key_not_found" as const, message: "API key not found" },
  api_key_revoked: { code: "api_key_revoked" as const, message: "API key has been revoked" },
  insufficient_permissions: { code: "insufficient_permissions" as const, message: "Insufficient permissions" },
  
  // Vault errors
  vault_not_found: { code: "vault_not_found" as const, message: "Vault not found" },
  vault_already_exists: (name: string): ApiError => ({
    code: "vault_already_exists",
    message: `Vault "${name}" already exists`,
  }),
  vault_conflict: { code: "vault_conflict" as const, message: "Version conflict - vault has been modified. Please refresh and retry." },
  invalid_vault_data: { code: "invalid_vault_data" as const, message: "Invalid vault data" },
  
  // Document errors
  document_not_found: { code: "document_not_found" as const, message: "Document not found" },
  document_conflict: { code: "document_conflict" as const, message: "Version conflict - document has been modified. Please refresh and retry." },
  document_already_exists: { code: "document_already_exists" as const, message: "Document already exists" },
  
  // Validation errors
  validation_error: (details: string): ApiError => ({
    code: "validation_error",
    message: details,
  }),
  invalid_request: { code: "invalid_request" as const, message: "Invalid request" },
  
  // Server errors
  internal_error: { code: "internal_error" as const, message: "Internal server error" },
};

/** Helper to get error object from factory */
export function getError(code: ErrorCode, arg?: string): ApiError {
  const factory = errors[code];
  if (typeof factory === "function") {
    return factory(arg ?? "");
  }
  return factory as ApiError;
}
