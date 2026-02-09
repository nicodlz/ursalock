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
  "passkey_not_found",
  "session_expired",
  
  // Vault errors
  "vault_not_found",
  "vault_already_exists",
  "invalid_vault_data",
  
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

/** Error factories - static objects or functions */
type ErrorFactory = ApiError | ((...args: string[]) => ApiError);

type ErrorFactoryMap = {
  [K in ErrorCode]: ErrorFactory;
};

export const errors: ErrorFactoryMap = {
  // Auth errors
  unauthorized: { code: "unauthorized", message: "Unauthorized" },
  invalid_credentials: { code: "invalid_credentials", message: "Invalid email or password" },
  email_already_exists: { code: "email_already_exists", message: "Email already registered" },
  passkey_not_found: { code: "passkey_not_found", message: "Passkey not found" },
  session_expired: { code: "session_expired", message: "Session expired" },
  
  // Vault errors
  vault_not_found: { code: "vault_not_found", message: "Vault not found" },
  vault_already_exists: (name: string) => ({
    code: "vault_already_exists",
    message: `Vault "${name}" already exists`,
  }),
  invalid_vault_data: { code: "invalid_vault_data", message: "Invalid vault data" },
  
  // Validation errors
  validation_error: (details: string) => ({
    code: "validation_error",
    message: details,
  }),
  invalid_request: { code: "invalid_request", message: "Invalid request" },
  
  // Server errors
  internal_error: { code: "internal_error", message: "Internal server error" },
};

/** Helper to get error object from factory */
export function getError(code: ErrorCode, ...args: string[]): ApiError {
  const factory = errors[code];
  if (typeof factory === "function") {
    return factory(...args);
  }
  return factory;
}
