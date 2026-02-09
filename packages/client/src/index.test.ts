/**
 * Client tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TokenManager } from './token.js'
import { EmailAuth } from './email.js'
import { PasskeyAuth } from './passkey.js'

// Mock localStorage
const mockStorage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockStorage.set(key, value),
  removeItem: (key: string) => mockStorage.delete(key),
})

describe('TokenManager', () => {
  beforeEach(() => {
    mockStorage.clear()
  })

  it('stores and retrieves tokens', () => {
    const manager = new TokenManager()
    const token = {
      accessToken: 'test-token',
      expiresAt: Date.now() + 60000,
    }

    manager.setToken(token)
    expect(manager.getToken()).toEqual(token)
    expect(manager.getAccessToken()).toBe('test-token')
  })

  it('returns null for expired tokens', () => {
    const manager = new TokenManager()
    const token = {
      accessToken: 'expired-token',
      expiresAt: Date.now() - 1000, // Already expired
    }

    manager.setToken(token)
    expect(manager.getToken()).toBeNull()
    expect(manager.isValid()).toBe(false)
  })

  it('clears tokens', () => {
    const manager = new TokenManager()
    manager.setToken({
      accessToken: 'test-token',
      expiresAt: Date.now() + 60000,
    })

    manager.clearToken()
    expect(manager.getToken()).toBeNull()
  })

  // Note: Storage persistence tests require browser environment
  // The saveToStorage/loadFromStorage methods check for window object

  it('notifies subscribers', () => {
    const manager = new TokenManager()
    const callback = vi.fn()

    manager.subscribe(callback)
    manager.setToken({
      accessToken: 'new-token',
      expiresAt: Date.now() + 60000,
    })

    expect(callback).toHaveBeenCalled()
  })

  it('parses JWT payload', () => {
    // Create a valid JWT-like token (base64 encoded JSON)
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = btoa(JSON.stringify({ sub: '123', exp: 1234567890 }))
    const signature = 'signature'
    const token = `${header}.${payload}.${signature}`

    const parsed = TokenManager.parseToken(token)
    expect(parsed).toEqual({ sub: '123', exp: 1234567890 })
  })

  it('handles invalid JWT gracefully', () => {
    expect(TokenManager.parseToken('invalid')).toBeNull()
    expect(TokenManager.parseToken('')).toBeNull()
  })
})

describe('EmailAuth', () => {
  const mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('validates email format on register', async () => {
    const auth = new EmailAuth({ serverUrl: 'http://test.com' })
    
    const result = await auth.register({
      email: 'invalid-email',
      password: 'password123',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('email')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('validates password length on register', async () => {
    const auth = new EmailAuth({ serverUrl: 'http://test.com' })
    
    const result = await auth.register({
      email: 'test@test.com',
      password: 'short',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('8 characters')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('calls register endpoint with credentials', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: '123', email: 'test@test.com' },
        token: 'jwt-token',
        recoveryKey: 'RECOVERY-KEY',
      }),
    })

    const auth = new EmailAuth({ serverUrl: 'http://test.com' })
    const result = await auth.register({
      email: 'test@test.com',
      password: 'password123',
    })

    expect(result.success).toBe(true)
    expect(result.user?.id).toBe('123')
    expect(result.token).toBe('jwt-token')
    expect(result.recoveryKey).toBe('RECOVERY-KEY')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test.com/auth/email/register',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('test@test.com'),
      })
    )
  })

  it('handles registration errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Email already exists' }),
    })

    const auth = new EmailAuth({ serverUrl: 'http://test.com' })
    const result = await auth.register({
      email: 'test@test.com',
      password: 'password123',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Email already exists')
  })
})

describe('PasskeyAuth', () => {
  // Mock window for passkey tests
  beforeEach(() => {
    vi.stubGlobal('window', {
      PublicKeyCredential: undefined, // WebAuthn not available
    })
  })

  it('reports support status', () => {
    // In Node.js/mocked environment, WebAuthn is not supported
    expect(PasskeyAuth.isSupported()).toBe(false)
  })

  it('returns error when passkeys not supported', async () => {
    const auth = new PasskeyAuth({ serverUrl: 'http://test.com' })
    
    const result = await auth.register('test@test.com')
    expect(result.success).toBe(false)
    expect(result.error).toContain('not supported')
  })
})
