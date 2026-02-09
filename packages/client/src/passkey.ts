/**
 * Passkey (WebAuthn) Authentication
 */

import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser'
import type { AuthResult, User } from './types.js'

export interface PasskeyCredential {
  id: string
  publicKey: string
  counter: number
  deviceType: string
  backedUp: boolean
  transports?: string[]
}

export interface PasskeyAuthOptions {
  /** Server URL for WebAuthn endpoints */
  serverUrl: string
  /** RP (Relying Party) name shown to user */
  rpName?: string
}

/**
 * Passkey authentication using WebAuthn
 */
export class PasskeyAuth {
  private options: Required<PasskeyAuthOptions>

  constructor(options: PasskeyAuthOptions) {
    this.options = {
      serverUrl: options.serverUrl.replace(/\/$/, ''),
      rpName: options.rpName ?? 'zod-vault',
    }
  }

  /**
   * Check if passkeys are supported in this browser
   */
  static isSupported(): boolean {
    return browserSupportsWebAuthn()
  }

  /**
   * Register a new passkey for signup
   */
  async register(email?: string): Promise<AuthResult> {
    if (!PasskeyAuth.isSupported()) {
      return { success: false, error: 'Passkeys not supported in this browser' }
    }

    try {
      // 1. Get registration options from server
      const optionsRes = await fetch(`${this.options.serverUrl}/auth/passkey/register/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!optionsRes.ok) {
        const err = await optionsRes.json()
        return { success: false, error: err.message ?? 'Failed to get registration options' }
      }

      const registrationOptions = await optionsRes.json()

      // 2. Create credential using WebAuthn
      const credential = await startRegistration(registrationOptions)

      // 3. Verify with server
      const verifyRes = await fetch(`${this.options.serverUrl}/auth/passkey/register/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          credential,
        }),
      })

      if (!verifyRes.ok) {
        const err = await verifyRes.json()
        return { success: false, error: err.message ?? 'Failed to verify registration' }
      }

      const result = await verifyRes.json()
      
      return {
        success: true,
        user: result.user as User,
        token: result.token,
        recoveryKey: result.recoveryKey,
      }
    } catch (error) {
      // User cancelled or WebAuthn error
      if (error instanceof Error && error.name === 'NotAllowedError') {
        return { success: false, error: 'Registration cancelled' }
      }
      return { success: false, error: String(error) }
    }
  }

  /**
   * Authenticate with an existing passkey
   */
  async authenticate(email?: string): Promise<AuthResult> {
    if (!PasskeyAuth.isSupported()) {
      return { success: false, error: 'Passkeys not supported in this browser' }
    }

    try {
      // 1. Get authentication options from server
      const optionsRes = await fetch(`${this.options.serverUrl}/auth/passkey/login/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!optionsRes.ok) {
        const err = await optionsRes.json()
        return { success: false, error: err.message ?? 'Failed to get authentication options' }
      }

      const authOptions = await optionsRes.json()

      // 2. Get credential from authenticator
      const credential = await startAuthentication(authOptions)

      // 3. Verify with server
      const verifyRes = await fetch(`${this.options.serverUrl}/auth/passkey/login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      })

      if (!verifyRes.ok) {
        const err = await verifyRes.json()
        return { success: false, error: err.message ?? 'Authentication failed' }
      }

      const result = await verifyRes.json()
      
      return {
        success: true,
        user: result.user as User,
        token: result.token,
      }
    } catch (error) {
      // User cancelled or WebAuthn error
      if (error instanceof Error && error.name === 'NotAllowedError') {
        return { success: false, error: 'Authentication cancelled' }
      }
      return { success: false, error: String(error) }
    }
  }

  /**
   * Check if user has any registered passkeys
   */
  async hasPasskey(email: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.options.serverUrl}/auth/passkey/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      
      if (!res.ok) return false
      
      const data = await res.json()
      return data.hasPasskey === true
    } catch {
      return false
    }
  }
}
