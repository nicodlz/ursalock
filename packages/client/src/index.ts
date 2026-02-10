/**
 * @ursalock/client
 * Auth and API client for ursalock
 * 
 * Refactored to follow SOLID principles:
 * - IAuthProvider interface for pluggable auth (Open/Closed + Dependency Inversion)
 * - IHttpClient interface for testable HTTP (Dependency Inversion)
 * - Provider pattern throughout
 */

// Core client
export { VaultClient, type VaultClientOptions } from "./client.js";

// Auth providers
export {
  PasskeyAuth,
  type PasskeyAuthOptions,
  type ZKCredential,
} from "./passkey.js";
export {
  EmailAuth,
  type EmailAuthOptions,
  type EmailCredentials,
} from "./email.js";

// Token management
export {
  TokenManager,
  type Token,
  type TokenManagerOptions,
} from "./token.js";

// Interfaces (Dependency Inversion)
export type {
  IAuthProvider,
  ZKAuthResult,
  PasskeySignUpOptions,
  EmailSignUpOptions,
  EmailSignInOptions,
} from "./interfaces/auth-provider.js";
export type { IHttpClient } from "./interfaces/http-client.js";
export { FetchHttpClient } from "./interfaces/http-client.js";

// Legacy types (backward compatibility)
export {
  type AuthProvider,
  type AuthState,
  type AuthResult,
  type User,
} from "./types.js";

// React hooks (tree-shakeable)
export {
  useAuth,
  useSignUp,
  useSignIn,
  useSignOut,
  useUser,
  useCredential,
  usePasskeySupport,
} from "./hooks.js";
