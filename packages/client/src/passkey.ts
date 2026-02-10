/**
 * Passkey (WebAuthn PRF) Authentication
 * Uses @z-base/zero-knowledge-credentials for PRF-based key derivation
 * 
 * Refactored to follow SOLID principles:
 * - Implements IAuthProvider interface (Dependency Inversion + Open/Closed)
 * - Injectable HTTP client (Dependency Inversion)
 */

import { ZKCredentials, type ZKCredential } from "@z-base/zero-knowledge-credentials";
import type { User } from "./types.js";
import type { 
  IAuthProvider, 
  ZKAuthResult, 
  PasskeySignUpOptions 
} from "./interfaces/auth-provider.js";
import type { IHttpClient } from "./interfaces/http-client.js";
import { FetchHttpClient } from "./interfaces/http-client.js";

export interface PasskeyAuthOptions {
  /** Server URL for WebAuthn endpoints */
  serverUrl: string;
  /** RP (Relying Party) name shown to user */
  rpName?: string;
  /** HTTP client for making requests (default: FetchHttpClient) */
  httpClient?: IHttpClient;
}

/**
 * Passkey authentication using WebAuthn PRF extension
 * Derives encryption keys directly from the passkey - no recovery key needed
 * Implements IAuthProvider for pluggable auth (Open/Closed Principle)
 */
export class PasskeyAuth implements IAuthProvider {
  private options: Required<PasskeyAuthOptions>;
  private httpClient: IHttpClient;

  constructor(options: PasskeyAuthOptions) {
    this.options = {
      serverUrl: options.serverUrl.replace(/\/$/, ""),
      rpName: options.rpName ?? "zod-vault",
      httpClient: options.httpClient ?? new FetchHttpClient(),
    };
    this.httpClient = this.options.httpClient;
  }

  getName(): string {
    return "passkey";
  }

  /**
   * Check if passkeys with PRF are supported in this browser
   * Implements IAuthProvider.isSupported
   */
  isSupported(): boolean {
    return PasskeyAuth.isSupported();
  }

  /**
   * Check if passkeys with PRF are supported in this browser (static helper)
   */
  static isSupported(): boolean {
    // Check for basic WebAuthn support
    if (typeof window === "undefined") return false;
    if (!window.PublicKeyCredential) return false;
    return true;
  }

  /**
   * Sign up - Register a new passkey
   * Creates a passkey with PRF extension and derives encryption keys
   * Implements IAuthProvider.signUp
   */
  async signUp(options: unknown): Promise<ZKAuthResult> {
    const opts = options as PasskeySignUpOptions | undefined;
    const displayName = opts?.displayName ?? "User";

    if (!PasskeyAuth.isSupported()) {
      return { success: false, error: "Passkeys not supported in this browser" };
    }

    try {
      // 1. Create passkey with PRF extension
      await ZKCredentials.registerCredential(
        displayName,
        "cross-platform" // Allow platform + cross-platform authenticators
      );

      // 2. Discover the credential to get derived keys
      const credential = await ZKCredentials.discoverCredential();

      // 3. Register with server using the opaque ID
      const registerRes = await this.httpClient.fetch(
        `${this.options.serverUrl}/auth/zkc/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            opaqueId: credential.id,
            displayName,
          }),
        }
      );

      if (!registerRes.ok) {
        const err = await registerRes.json();
        return { success: false, error: err.message ?? "Failed to register" };
      }

      const result = await registerRes.json();

      return {
        success: true,
        user: result.user as User,
        token: result.token,
        credential,
      };
    } catch (error) {
      // User cancelled or WebAuthn error
      if (error instanceof Error) {
        if (error.name === "NotAllowedError" || error.message.includes("aborted")) {
          return { success: false, error: "Registration cancelled" };
        }
        return { success: false, error: error.message };
      }
      return { success: false, error: String(error) };
    }
  }

  /**
   * Legacy method - kept for backward compatibility
   * @deprecated Use signUp() instead
   */
  async register(displayName?: string): Promise<ZKAuthResult> {
    return this.signUp({ displayName });
  }

  /**
   * Sign in - Authenticate with an existing passkey
   * Uses discoverCredential to authenticate and derive keys
   * Implements IAuthProvider.signIn
   */
  async signIn(_options: unknown): Promise<ZKAuthResult> {
    if (!PasskeyAuth.isSupported()) {
      return { success: false, error: "Passkeys not supported in this browser" };
    }

    try {
      // 1. Discover credential (authenticates + derives keys)
      const credential = await ZKCredentials.discoverCredential();

      // 2. Authenticate with server using the opaque ID
      const authRes = await this.httpClient.fetch(
        `${this.options.serverUrl}/auth/zkc/authenticate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            opaqueId: credential.id,
          }),
        }
      );

      if (!authRes.ok) {
        const err = await authRes.json();
        return { success: false, error: err.message ?? "Authentication failed" };
      }

      const result = await authRes.json();

      return {
        success: true,
        user: result.user as User,
        token: result.token,
        credential,
      };
    } catch (error) {
      // User cancelled or WebAuthn error
      if (error instanceof Error) {
        if (error.name === "NotAllowedError" || error.message.includes("aborted")) {
          return { success: false, error: "Authentication cancelled" };
        }
        if (error.message.includes("no-credential")) {
          return { success: false, error: "No passkey found. Please sign up first." };
        }
        return { success: false, error: error.message };
      }
      return { success: false, error: String(error) };
    }
  }

  /**
   * Legacy method - kept for backward compatibility
   * @deprecated Use signIn() instead
   */
  async authenticate(): Promise<ZKAuthResult> {
    return this.signIn({});
  }

  /**
   * Check if user has any registered passkeys
   */
  async hasPasskey(opaqueId: string): Promise<boolean> {
    try {
      const res = await this.httpClient.fetch(
        `${this.options.serverUrl}/auth/zkc/check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opaqueId }),
        }
      );

      if (!res.ok) return false;

      const data = await res.json();
      return data.hasPasskey === true;
    } catch {
      return false;
    }
  }
}

// Re-export ZKCredential type for consumers
export type { ZKCredential };
