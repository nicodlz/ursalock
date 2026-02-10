/**
 * Auth provider interfaces
 * Follows Open/Closed Principle - easy to add new auth methods
 * Follows Dependency Inversion - VaultClient depends on abstractions
 */

import type { User, AuthResult, ZKCredential } from "../types.js";

/**
 * Extended auth result that includes optional ZK credential
 * Used by providers that support zero-knowledge encryption (like passkey)
 */
export interface ZKAuthResult extends AuthResult {
  /** ZK credential with encryption keys (optional) */
  credential?: ZKCredential;
}

/**
 * Base auth provider interface
 * All auth methods must implement this interface
 */
export interface IAuthProvider {
  /**
   * Sign up a new user
   * @param options Provider-specific signup options
   * @returns Auth result with user and token
   */
  signUp(options: unknown): Promise<ZKAuthResult>;

  /**
   * Sign in an existing user
   * @param options Provider-specific signin options
   * @returns Auth result with user and token
   */
  signIn(options: unknown): Promise<ZKAuthResult>;

  /**
   * Check if this auth method is supported in the current environment
   */
  isSupported(): boolean;

  /**
   * Get the provider name/type
   */
  getName(): string;
}

/**
 * Passkey-specific signup options
 */
export interface PasskeySignUpOptions {
  displayName?: string;
}

/**
 * Email-specific signup options
 */
export interface EmailSignUpOptions {
  email: string;
  password: string;
}

/**
 * Email-specific signin options
 */
export interface EmailSignInOptions {
  email: string;
  password: string;
}
