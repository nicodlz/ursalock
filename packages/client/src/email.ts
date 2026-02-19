/**
 * Email/Password Authentication (fallback)
 * Note: Email auth doesn't provide PRF-derived encryption keys.
 * For E2EE, use passkey authentication instead.
 * 
 * Refactored to follow SOLID principles:
 * - Implements IAuthProvider interface (Open/Closed + Dependency Inversion)
 * - Injectable HTTP client (Dependency Inversion)
 */

import type { User } from "./types.js";
import type { 
  IAuthProvider, 
  ZKAuthResult,
  EmailSignUpOptions,
  EmailSignInOptions
} from "./interfaces/auth-provider.js";
import type { IHttpClient } from "./interfaces/http-client.js";
import { FetchHttpClient } from "./interfaces/http-client.js";

export interface EmailCredentials {
  email: string;
  password: string;
}

export interface EmailAuthOptions {
  /** Server URL for auth endpoints */
  serverUrl: string;
  /** HTTP client for making requests (default: FetchHttpClient) */
  httpClient?: IHttpClient;
}

/**
 * Email/password authentication (fallback for non-passkey browsers)
 * Note: Email auth doesn't derive encryption keys - use passkeys for E2EE
 * Implements IAuthProvider for pluggable auth (Open/Closed Principle)
 */
export class EmailAuth implements IAuthProvider {
  private options: Required<EmailAuthOptions>;
  private httpClient: IHttpClient;

  constructor(options: EmailAuthOptions) {
    this.options = {
      serverUrl: options.serverUrl.replace(/\/$/, ""),
      httpClient: options.httpClient ?? new FetchHttpClient(),
    };
    this.httpClient = this.options.httpClient;
  }

  getName(): string {
    return "email";
  }

  isSupported(): boolean {
    return true; // Email auth is always supported
  }

  /**
   * Sign up - Register a new account with email/password
   * Implements IAuthProvider.signUp
   */
  async signUp(options: unknown): Promise<ZKAuthResult> {
    const { email, password } = options as EmailSignUpOptions;

    // Validate inputs
    if (!email || !this.isValidEmail(email)) {
      return { success: false, error: "Invalid email address" };
    }
    if (!password || password.length < 8) {
      return { success: false, error: "Password must be at least 8 characters" };
    }

    try {
      const res = await this.httpClient.fetch(
        `${this.options.serverUrl}/auth/email/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        return { 
          success: false, 
          error: err.message ?? "Registration failed",
        };
      }

      const result = await res.json();
      
      return {
        success: true,
        user: result.user as User,
        token: result.token,
        // Email auth doesn't provide encryption keys
      };
    } catch {
      return { success: false, error: "Network error" };
    }
  }

  /**
   * Sign in - Authenticate with email/password
   * Implements IAuthProvider.signIn
   */
  async signIn(options: unknown): Promise<ZKAuthResult> {
    const { email, password } = options as EmailSignInOptions;

    if (!email || !password) {
      return { success: false, error: "Email and password required" };
    }

    try {
      const res = await this.httpClient.fetch(
        `${this.options.serverUrl}/auth/email/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        if (res.status === 401) {
          return { success: false, error: "Invalid email or password" };
        }
        return { success: false, error: err.message ?? "Login failed" };
      }

      const result = await res.json();
      
      return {
        success: true,
        user: result.user as User,
        token: result.token,
        // Email auth doesn't provide encryption keys
      };
    } catch {
      return { success: false, error: "Network error" };
    }
  }

  /**
   * Legacy method - kept for backward compatibility
   * @deprecated Use signUp() instead
   */
  async register(credentials: EmailCredentials): Promise<ZKAuthResult> {
    return this.signUp(credentials);
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
