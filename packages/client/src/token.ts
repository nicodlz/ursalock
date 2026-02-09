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
  /** Server URL for token refresh */
  serverUrl?: string
  /** Callback when token expires (and refresh fails) */
  onExpire?: () => void
  /** Refresh token before expiry (ms before expiry, default: 5min) */
  refreshBuffer?: number
  /** Enable auto-refresh (default: true if serverUrl provided) */
  autoRefresh?: boolean
}

/**
 * Manages JWT tokens with automatic refresh
 */
export class TokenManager {
  private token: Token | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private options: Required<Omit<TokenManagerOptions, 'serverUrl'>> & { serverUrl?: string }
  private listeners: Set<(token: Token | null) => void> = new Set()
  private isRefreshing = false

  constructor(options: TokenManagerOptions = {}) {
    this.options = {
      storageKey: options.storageKey ?? 'zod-vault:token',
      serverUrl: options.serverUrl,
      onExpire: options.onExpire ?? (() => {}),
      refreshBuffer: options.refreshBuffer ?? 5 * 60 * 1000, // 5 minutes
      autoRefresh: options.autoRefresh ?? !!options.serverUrl,
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
   * Manually refresh the token
   * Returns true if refresh succeeded
   */
  async refresh(): Promise<boolean> {
    if (!this.options.serverUrl || !this.token) return false
    if (this.isRefreshing) return false

    this.isRefreshing = true

    try {
      const res = await fetch(`${this.options.serverUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token.accessToken}`,
        },
        body: this.token.refreshToken 
          ? JSON.stringify({ refreshToken: this.token.refreshToken })
          : undefined,
      })

      if (!res.ok) {
        this.isRefreshing = false
        return false
      }

      const data = await res.json() as { token: string; expiresIn?: number }
      
      // Parse new token expiry
      const payload = TokenManager.parseToken(data.token)
      const expiresAt = payload?.exp 
        ? (payload.exp as number) * 1000 
        : Date.now() + (data.expiresIn ?? 3600) * 1000

      this.setToken({
        accessToken: data.token,
        expiresAt,
        refreshToken: this.token.refreshToken,
      })

      this.isRefreshing = false
      return true
    } catch {
      this.isRefreshing = false
      return false
    }
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
    
    this.refreshTimer = setTimeout(async () => {
      // Try to refresh if autoRefresh is enabled
      if (this.options.autoRefresh && this.options.serverUrl) {
        const success = await this.refresh()
        if (success) return // Token refreshed, new timer scheduled
      }
      // Refresh failed or not enabled, call onExpire
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
