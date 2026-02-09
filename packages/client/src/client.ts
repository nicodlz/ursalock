/**
 * Main Vault Client
 * Combines auth (passkey + email) with API access
 */

import { PasskeyAuth } from './passkey.js'
import { EmailAuth } from './email.js'
import { TokenManager, type Token } from './token.js'
import type { AuthState, AuthResult, User } from './types.js'

export interface VaultClientOptions {
  /** Server URL */
  serverUrl: string
  /** RP name for passkeys (default: 'zod-vault') */
  rpName?: string
  /** Prefer passkey over email (default: true) */
  preferPasskey?: boolean
  /** Storage key for auth (default: 'zod-vault:auth') */
  storageKey?: string
}

/**
 * Unified client for zod-vault auth and API
 */
export class VaultClient {
  private options: Required<VaultClientOptions>
  private passkeyAuth: PasskeyAuth
  private emailAuth: EmailAuth
  private tokenManager: TokenManager
  private state: AuthState
  private listeners: Set<(state: AuthState) => void> = new Set()

  constructor(options: VaultClientOptions) {
    this.options = {
      serverUrl: options.serverUrl.replace(/\/$/, ''),
      rpName: options.rpName ?? 'zod-vault',
      preferPasskey: options.preferPasskey ?? true,
      storageKey: options.storageKey ?? 'zod-vault:auth',
    }

    this.passkeyAuth = new PasskeyAuth({
      serverUrl: this.options.serverUrl,
      rpName: this.options.rpName,
    })

    this.emailAuth = new EmailAuth({
      serverUrl: this.options.serverUrl,
    })

    this.tokenManager = new TokenManager({
      storageKey: `${this.options.storageKey}:token`,
      onExpire: () => this.handleTokenExpire(),
    })

    // Initial state
    this.state = {
      isAuthenticated: false,
      user: null,
      isLoading: true,
      error: null,
    }

    // Check existing auth
    this.initialize()
  }

  // ==================
  // Public Auth Methods
  // ==================

  /**
   * Sign up a new user
   */
  async signUp(options: {
    email?: string
    password?: string
    usePasskey?: boolean
  } = {}): Promise<AuthResult> {
    const usePasskey = options.usePasskey ?? 
      (this.options.preferPasskey && PasskeyAuth.isSupported() && !options.password)

    let result: AuthResult

    if (usePasskey) {
      result = await this.passkeyAuth.register(options.email)
    } else {
      if (!options.email || !options.password) {
        return { success: false, error: 'Email and password required' }
      }
      result = await this.emailAuth.register({
        email: options.email,
        password: options.password,
      })
    }

    if (result.success && result.token) {
      this.handleAuthSuccess(result)
    }

    return result
  }

  /**
   * Sign in an existing user
   */
  async signIn(options: {
    email?: string
    password?: string
    usePasskey?: boolean
  } = {}): Promise<AuthResult> {
    const usePasskey = options.usePasskey ??
      (this.options.preferPasskey && PasskeyAuth.isSupported() && !options.password)

    let result: AuthResult

    if (usePasskey) {
      result = await this.passkeyAuth.authenticate(options.email)
    } else {
      if (!options.email || !options.password) {
        return { success: false, error: 'Email and password required' }
      }
      result = await this.emailAuth.signIn({
        email: options.email,
        password: options.password,
      })
    }

    if (result.success && result.token) {
      this.handleAuthSuccess(result)
    }

    return result
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    // Call server logout endpoint
    const token = this.tokenManager.getAccessToken()
    if (token) {
      try {
        await fetch(`${this.options.serverUrl}/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        })
      } catch {
        // Ignore errors, still clear local state
      }
    }

    // Clear local state
    this.tokenManager.clearToken()
    this.clearUserFromStorage()
    this.updateState({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      error: null,
    })
  }

  /**
   * Check if passkeys are supported
   */
  supportsPasskey(): boolean {
    return PasskeyAuth.isSupported()
  }

  // ==================
  // State Management
  // ==================

  /**
   * Get current auth state
   * Returns the same reference unless state changes (required for useSyncExternalStore)
   */
  getState(): AuthState {
    return this.state
  }

  /**
   * Get current user
   */
  getUser(): User | null {
    return this.state.user
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.state.isAuthenticated
  }

  /**
   * Subscribe to auth state changes
   */
  subscribe(callback: (state: AuthState) => void): () => void {
    this.listeners.add(callback)
    // Immediately call with current state
    callback(this.state)
    return () => this.listeners.delete(callback)
  }

  // ==================
  // API Methods
  // ==================

  /**
   * Get authorization header
   */
  getAuthHeader(): Record<string, string> {
    const token = this.tokenManager.getAccessToken()
    return token ? { 'Authorization': `Bearer ${token}` } : {}
  }

  /**
   * Make authenticated API request
   */
  async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = path.startsWith('http') ? path : `${this.options.serverUrl}${path}`
    
    return fetch(url, {
      ...options,
      headers: {
        ...this.getAuthHeader(),
        ...options.headers,
      },
    })
  }

  // ==================
  // Private Methods
  // ==================

  private async initialize(): Promise<void> {
    // Check for existing token
    if (this.tokenManager.isValid()) {
      // Validate token with server
      try {
        const res = await this.fetch('/auth/me')
        if (res.ok) {
          const data = await res.json()
          this.updateState({
            isAuthenticated: true,
            user: data.user,
            isLoading: false,
            error: null,
          })
          return
        }
      } catch {
        // Token invalid, clear it
      }
    }

    // Try loading user from storage
    const user = this.loadUserFromStorage()
    if (user && this.tokenManager.isValid()) {
      this.updateState({
        isAuthenticated: true,
        user,
        isLoading: false,
        error: null,
      })
      return
    }

    // Not authenticated
    this.updateState({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      error: null,
    })
  }

  private handleAuthSuccess(result: AuthResult): void {
    if (!result.token || !result.user) return

    // Parse token to get expiry
    const payload = TokenManager.parseToken(result.token)
    const expiresAt = payload?.exp 
      ? (payload.exp as number) * 1000 
      : Date.now() + 7 * 24 * 60 * 60 * 1000 // Default 7 days

    this.tokenManager.setToken({
      accessToken: result.token,
      expiresAt,
    })

    this.saveUserToStorage(result.user)

    this.updateState({
      isAuthenticated: true,
      user: result.user,
      isLoading: false,
      error: null,
    })
  }

  private handleTokenExpire(): void {
    // Token expired, try to refresh or sign out
    this.updateState({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      error: new Error('Session expired'),
    })
  }

  private updateState(newState: AuthState): void {
    this.state = newState
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }

  private saveUserToStorage(user: User): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(`${this.options.storageKey}:user`, JSON.stringify(user))
    } catch {}
  }

  private loadUserFromStorage(): User | null {
    if (typeof window === 'undefined') return null
    try {
      const stored = localStorage.getItem(`${this.options.storageKey}:user`)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  }

  private clearUserFromStorage(): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(`${this.options.storageKey}:user`)
    } catch {}
  }
}
