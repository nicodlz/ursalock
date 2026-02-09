/**
 * Passkey (WebAuthn PRF) Authentication
 * Uses @z-base/zero-knowledge-credentials for PRF-based key derivation
 */

import { ZKCredentials, type ZKCredential } from "@z-base/zero-knowledge-credentials";
import type { AuthResult, User, ZKAuthResult } from "./types.js";

export interface PasskeyAuthOptions {
  /** Server URL for WebAuthn endpoints */
  serverUrl: string;
  /** RP (Relying Party) name shown to user */
  rpName?: string;
}

/**
 * Passkey authentication using WebAuthn PRF extension
 * Derives encryption keys directly from the passkey - no recovery key needed
 */
export class PasskeyAuth {
  private options: Required<PasskeyAuthOptions>;

  constructor(options: PasskeyAuthOptions) {
    this.options = {
      serverUrl: options.serverUrl.replace(/\/$/, ""),
      rpName: options.rpName ?? "zod-vault",
    };
  }

  /**
   * Check if passkeys with PRF are supported in this browser
   */
  static isSupported(): boolean {
    // Check for basic WebAuthn support
    if (typeof window === "undefined") return false;
    if (!window.PublicKeyCredential) return false;
    return true;
  }

  /**
   * Register a new passkey for signup
   * Creates a passkey with PRF extension and derives encryption keys
   */
  async register(displayName?: string): Promise<ZKAuthResult> {
    if (!PasskeyAuth.isSupported()) {
      return { success: false, error: "Passkeys not supported in this browser" };
    }

    try {
      // 1. Create passkey with PRF extension
      await ZKCredentials.registerCredential(
        displayName ?? "User",
        "cross-platform" // Allow platform + cross-platform authenticators
      );

      // 2. Discover the credential to get derived keys
      const credential = await ZKCredentials.discoverCredential();

      // 3. Register with server using the opaque ID
      const registerRes = await fetch(`${this.options.serverUrl}/auth/zkc/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opaqueId: credential.id,
          displayName,
        }),
      });

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
   * Authenticate with an existing passkey
   * Uses discoverCredential to authenticate and derive keys
   */
  async authenticate(): Promise<ZKAuthResult> {
    if (!PasskeyAuth.isSupported()) {
      return { success: false, error: "Passkeys not supported in this browser" };
    }

    try {
      // 1. Discover credential (authenticates + derives keys)
      const credential = await ZKCredentials.discoverCredential();

      // 2. Authenticate with server using the opaque ID
      const authRes = await fetch(`${this.options.serverUrl}/auth/zkc/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opaqueId: credential.id,
        }),
      });

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
   * Check if user has any registered passkeys
   */
  async hasPasskey(opaqueId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.options.serverUrl}/auth/zkc/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opaqueId }),
      });

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
