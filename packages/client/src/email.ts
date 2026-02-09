/**
 * Email/Password Authentication (fallback)
 */

import type { AuthResult, User } from './types.js'

export interface EmailCredentials {
  email: string
  password: string
}

export interface EmailAuthOptions {
  /** Server URL for auth endpoints */
  serverUrl: string
}

/**
 * Email/password authentication (fallback for non-passkey browsers)
 */
export class EmailAuth {
  private options: Required<EmailAuthOptions>

  constructor(options: EmailAuthOptions) {
    this.options = {
      serverUrl: options.serverUrl.replace(/\/$/, ''),
    }
  }

  /**
   * Register a new account with email/password
   */
  async register(credentials: EmailCredentials): Promise<AuthResult> {
    const { email, password } = credentials

    // Validate inputs
    if (!email || !this.isValidEmail(email)) {
      return { success: false, error: 'Invalid email address' }
    }
    if (!password || password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' }
    }

    try {
      const res = await fetch(`${this.options.serverUrl}/auth/email/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const err = await res.json()
        return { 
          success: false, 
          error: err.message ?? 'Registration failed' 
        }
      }

      const result = await res.json()
      
      return {
        success: true,
        user: result.user as User,
        token: result.token,
        recoveryKey: result.recoveryKey,
      }
    } catch (error) {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Sign in with email/password
   */
  async signIn(credentials: EmailCredentials): Promise<AuthResult> {
    const { email, password } = credentials

    if (!email || !password) {
      return { success: false, error: 'Email and password required' }
    }

    try {
      const res = await fetch(`${this.options.serverUrl}/auth/email/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const err = await res.json()
        if (res.status === 401) {
          return { success: false, error: 'Invalid email or password' }
        }
        return { success: false, error: err.message ?? 'Login failed' }
      }

      const result = await res.json()
      
      return {
        success: true,
        user: result.user as User,
        token: result.token,
      }
    } catch (error) {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Request password reset email
   */
  async forgotPassword(email: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isValidEmail(email)) {
      return { success: false, error: 'Invalid email address' }
    }

    try {
      const res = await fetch(`${this.options.serverUrl}/auth/email/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      // Always return success to prevent email enumeration
      return { success: true }
    } catch {
      return { success: true }
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' }
    }

    try {
      const res = await fetch(`${this.options.serverUrl}/auth/email/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: newPassword }),
      })

      if (!res.ok) {
        const err = await res.json()
        return { success: false, error: err.message ?? 'Reset failed' }
      }

      return { success: true }
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Change password (when logged in)
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
    authToken: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters' }
    }

    try {
      const res = await fetch(`${this.options.serverUrl}/auth/email/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      if (!res.ok) {
        const err = await res.json()
        return { success: false, error: err.message ?? 'Change failed' }
      }

      return { success: true }
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }
}
