/**
 * JWT Token Manager
 * Handles token storage, refresh, and expiry
 */

export interface Token {
  /** JWT access token */
  accessToken: string
  /** Token expiry timestamp (ms) */
  expiresAt: number
  /** Refresh token (if available) */
  refreshToken?: string
}

export interface TokenManagerOptions {
  /** Storage key for token */
  storageKey?: string
  /** Callback when token expires */
  onExpire?: () => void
  /** Refresh token before expiry (ms before expiry, default: 5min) */
  refreshBuffer?: number
}

/**
 * Manages JWT tokens with automatic refresh
 */
export class TokenManager {
  private token: Token | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private options: Required<TokenManagerOptions>
  private listeners: Set<(token: Token | null) => void> = new Set()

  constructor(options: TokenManagerOptions = {}) {
    this.options = {
      storageKey: options.storageKey ?? 'zod-vault:token',
      onExpire: options.onExpire ?? (() => {}),
      refreshBuffer: options.refreshBuffer ?? 5 * 60 * 1000, // 5 minutes
    }

    // Load token from storage on init
    this.loadFromStorage()
  }

  /**
   * Set a new token
   */
  setToken(token: Token): void {
    this.token = token
    this.saveToStorage()
    this.scheduleRefresh()
    this.notifyListeners()
  }

  /**
   * Get current token
   */
  getToken(): Token | null {
    if (!this.token) return null
    
    // Check if expired
    if (Date.now() >= this.token.expiresAt) {
      this.clearToken()
      return null
    }
    
    return this.token
  }

  /**
   * Get access token string (convenience method)
   */
  getAccessToken(): string | null {
    return this.getToken()?.accessToken ?? null
  }

  /**
   * Check if token is valid
   */
  isValid(): boolean {
    const token = this.getToken()
    return token !== null && Date.now() < token.expiresAt
  }

  /**
   * Clear token
   */
  clearToken(): void {
    this.token = null
    this.clearRefreshTimer()
    this.removeFromStorage()
    this.notifyListeners()
  }

  /**
   * Subscribe to token changes
   */
  subscribe(callback: (token: Token | null) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * Parse JWT payload (without verification)
   */
  static parseToken(token: string): Record<string, unknown> | null {
    try {
      const [, payload] = token.split('.')
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
      return JSON.parse(decoded)
    } catch {
      return null
    }
  }

  // Private methods

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return
    
    try {
      const stored = localStorage.getItem(this.options.storageKey)
      if (stored) {
        const token = JSON.parse(stored) as Token
        if (Date.now() < token.expiresAt) {
          this.token = token
          this.scheduleRefresh()
        } else {
          this.removeFromStorage()
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined' || !this.token) return
    
    try {
      localStorage.setItem(this.options.storageKey, JSON.stringify(this.token))
    } catch {
      // Ignore storage errors
    }
  }

  private removeFromStorage(): void {
    if (typeof window === 'undefined') return
    
    try {
      localStorage.removeItem(this.options.storageKey)
    } catch {
      // Ignore storage errors
    }
  }

  private scheduleRefresh(): void {
    this.clearRefreshTimer()
    
    if (!this.token) return
    
    const timeUntilExpiry = this.token.expiresAt - Date.now()
    const refreshIn = Math.max(0, timeUntilExpiry - this.options.refreshBuffer)
    
    this.refreshTimer = setTimeout(() => {
      this.options.onExpire()
    }, refreshIn)
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.token)
    }
  }
}
