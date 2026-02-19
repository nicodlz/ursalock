/**
 * Common types for auth
 */

import type { ZKCredential } from "@z-base/zero-knowledge-credentials";

/** User object returned by auth */
export interface User {
  id: string;
  email?: string;
  createdAt: number;
}

/** Current authentication state */
export interface AuthState {
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Current user (if authenticated) */
  user: User | null;
  /** Whether auth is still loading */
  isLoading: boolean;
  /** Auth error (if any) */
  error: Error | null;
  /** ZK Credential with derived keys (if authenticated with passkey) */
  credential: ZKCredential | null;
}

/** Auth provider interface */
export interface AuthProvider {
  /** Sign up a new user */
  signUp(options: SignUpOptions): Promise<ZKAuthResult>;
  /** Sign in an existing user */
  signIn(options: SignInOptions): Promise<ZKAuthResult>;
  /** Sign out the current user */
  signOut(): Promise<void>;
  /** Get current auth state */
  getState(): AuthState;
  /** Subscribe to auth state changes */
  subscribe(callback: (state: AuthState) => void): () => void;
}

/** Sign up options */
export interface SignUpOptions {
  email?: string;
  password?: string;
  /** Use passkey instead of email/password */
  usePasskey?: boolean;
}

/** Sign in options */
export interface SignInOptions {
  email?: string;
  password?: string;
  /** Use passkey instead of email/password */
  usePasskey?: boolean;
}

/** Result of auth operations (legacy, for email/password) */
export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

// ZKAuthResult is defined in interfaces/auth-provider.ts, re-exported here for convenience
export type { ZKAuthResult } from "./interfaces/auth-provider.js";

/** API error response */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Re-export ZKCredential for convenience
export type { ZKCredential };
