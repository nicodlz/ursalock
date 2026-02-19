/**
 * API request/response schemas
 * Pattern: Zod as source of truth for types
 */

import { z } from "zod";

// ===================
// Common schemas
// ===================

export const UserResponse = z.object({
  id: z.string(),
  email: z.string().email().nullable(),
  createdAt: z.number(),
});
export type UserResponse = z.infer<typeof UserResponse>;

// ===================
// Auth schemas
// ===================

/** Email/password registration request */
export const EmailRegisterRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type EmailRegisterRequest = z.infer<typeof EmailRegisterRequest>;

/** Email/password login request */
export const EmailLoginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type EmailLoginRequest = z.infer<typeof EmailLoginRequest>;

/** Successful auth response */
export const AuthResponse = z.object({
  user: UserResponse,
  token: z.string(),
  recoveryKey: z.string().optional(),
});
export type AuthResponse = z.infer<typeof AuthResponse>;

/** Token refresh response */
export const RefreshResponse = z.object({
  token: z.string(),
  expiresIn: z.number(),
});
export type RefreshResponse = z.infer<typeof RefreshResponse>;

/** Current user response */
export const MeResponse = z.object({
  user: UserResponse,
});
export type MeResponse = z.infer<typeof MeResponse>;

// ===================
// Passkey schemas
// ===================

/** Passkey registration options request */
export const PasskeyRegisterOptionsRequest = z.object({
  email: z.string().email().optional(),
});
export type PasskeyRegisterOptionsRequest = z.infer<typeof PasskeyRegisterOptionsRequest>;

/** Passkey registration verify request */
export const PasskeyRegisterVerifyRequest = z.object({
  email: z.string().email().optional(),
  credential: z.record(z.unknown()),
});
export type PasskeyRegisterVerifyRequest = z.infer<typeof PasskeyRegisterVerifyRequest>;

/** Passkey login options request */
export const PasskeyLoginOptionsRequest = z.object({
  email: z.string().email().optional(),
});
export type PasskeyLoginOptionsRequest = z.infer<typeof PasskeyLoginOptionsRequest>;

/** Passkey login verify request */
export const PasskeyLoginVerifyRequest = z.object({
  credential: z.record(z.unknown()),
});
export type PasskeyLoginVerifyRequest = z.infer<typeof PasskeyLoginVerifyRequest>;

// ===================
// Vault schemas
// ===================

/** Create vault request */
export const CreateVaultRequest = z.object({
  name: z.string().min(1).max(255),
  data: z.string().max(10 * 1024 * 1024), // Encrypted blob (base64), 10MB limit
  salt: z.string().max(1024), // Salt (base64)
});
export type CreateVaultRequest = z.infer<typeof CreateVaultRequest>;

/** Update vault request */
export const UpdateVaultRequest = z.object({
  data: z.string().max(10 * 1024 * 1024),
  salt: z.string().max(1024),
  version: z.number().optional(),
});
export type UpdateVaultRequest = z.infer<typeof UpdateVaultRequest>;

/** Vault response */
export const VaultResponse = z.object({
  uid: z.string(),
  name: z.string(),
  data: z.string(),
  salt: z.string(),
  version: z.number(),
  updatedAt: z.number(),
});
export type VaultResponse = z.infer<typeof VaultResponse>;

/** List vaults response */
export const VaultsListResponse = z.object({
  vaults: z.array(VaultResponse),
});
export type VaultsListResponse = z.infer<typeof VaultsListResponse>;
