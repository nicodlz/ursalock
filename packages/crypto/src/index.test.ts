/**
 * Crypto module tests
 */

import { describe, it, expect } from 'vitest'
import {
  deriveKey,
  encrypt,
  decrypt,
  generateRecoveryKey,
  validateRecoveryKey,
  recoveryKeyToBytes,
  bytesToRecoveryKey,
  randomBytes,
  constantTimeEqual,
} from './index.js'

describe('randomBytes', () => {
  it('generates bytes of correct length', () => {
    const bytes = randomBytes(32)
    expect(bytes.length).toBe(32)
  })

  it('generates different bytes each time', () => {
    const a = randomBytes(32)
    const b = randomBytes(32)
    expect(constantTimeEqual(a, b)).toBe(false)
  })
})

describe('constantTimeEqual', () => {
  it('returns true for equal arrays', () => {
    const a = new Uint8Array([1, 2, 3, 4])
    const b = new Uint8Array([1, 2, 3, 4])
    expect(constantTimeEqual(a, b)).toBe(true)
  })

  it('returns false for different arrays', () => {
    const a = new Uint8Array([1, 2, 3, 4])
    const b = new Uint8Array([1, 2, 3, 5])
    expect(constantTimeEqual(a, b)).toBe(false)
  })

  it('returns false for different lengths', () => {
    const a = new Uint8Array([1, 2, 3])
    const b = new Uint8Array([1, 2, 3, 4])
    expect(constantTimeEqual(a, b)).toBe(false)
  })
})

describe('Recovery Key', () => {
  it('generates a valid recovery key', () => {
    const recovery = generateRecoveryKey()
    
    expect(recovery.bytes.length).toBe(32)
    expect(recovery.raw.length).toBe(52)
    expect(recovery.formatted).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){12}$/)
    expect(validateRecoveryKey(recovery.formatted)).toBe(true)
  })

  it('generates unique keys', () => {
    const a = generateRecoveryKey()
    const b = generateRecoveryKey()
    expect(a.raw).not.toBe(b.raw)
  })

  it('validates correct recovery key format', () => {
    const recovery = generateRecoveryKey()
    expect(validateRecoveryKey(recovery.formatted)).toBe(true)
    expect(validateRecoveryKey(recovery.raw)).toBe(true)
  })

  it('rejects invalid recovery key format', () => {
    expect(validateRecoveryKey('invalid')).toBe(false)
    expect(validateRecoveryKey('AAAA-BBBB')).toBe(false)
    expect(validateRecoveryKey('0000-0000-0000-0000-0000-0000-0000-0000-0000-0000-0000-0000-0')).toBe(false)
  })

  it('converts between bytes and string', () => {
    const recovery = generateRecoveryKey()
    const decoded = recoveryKeyToBytes(recovery.formatted)
    expect(constantTimeEqual(decoded, recovery.bytes)).toBe(true)
    
    const encoded = bytesToRecoveryKey(recovery.bytes)
    expect(encoded).toBe(recovery.raw)
  })
})

describe('Key Derivation (Argon2id)', () => {
  it('derives a 32-byte key', async () => {
    const password = new TextEncoder().encode('test-password')
    const { key, salt } = await deriveKey({ password })
    
    expect(key.length).toBe(32)
    expect(salt.length).toBe(32)
  })

  it('produces different keys for different passwords', async () => {
    const salt = randomBytes(32)
    const { key: key1 } = await deriveKey({
      password: new TextEncoder().encode('password1'),
      salt,
    })
    const { key: key2 } = await deriveKey({
      password: new TextEncoder().encode('password2'),
      salt,
    })
    
    expect(constantTimeEqual(key1, key2)).toBe(false)
  })

  it('produces different keys for different salts', async () => {
    const password = new TextEncoder().encode('same-password')
    const { key: key1 } = await deriveKey({ password, salt: randomBytes(32) })
    const { key: key2 } = await deriveKey({ password, salt: randomBytes(32) })
    
    expect(constantTimeEqual(key1, key2)).toBe(false)
  })

  it('produces same key for same inputs', async () => {
    const password = new TextEncoder().encode('test-password')
    const salt = randomBytes(32)
    
    const { key: key1 } = await deriveKey({ password, salt })
    const { key: key2 } = await deriveKey({ password, salt })
    
    expect(constantTimeEqual(key1, key2)).toBe(true)
  })

  it('works with recovery key bytes', async () => {
    const recovery = generateRecoveryKey()
    const { key } = await deriveKey({ password: recovery.bytes })
    
    expect(key.length).toBe(32)
  })
})

describe('AES-256-GCM Encryption', () => {
  it('encrypts and decrypts data', async () => {
    const key = randomBytes(32)
    const plaintext = new TextEncoder().encode('Hello, World!')
    
    const encrypted = await encrypt(plaintext, key)
    const decrypted = await decrypt(encrypted.combined, key)
    
    expect(new TextDecoder().decode(decrypted)).toBe('Hello, World!')
  })

  it('produces different ciphertext for same plaintext (random IV)', async () => {
    const key = randomBytes(32)
    const plaintext = new TextEncoder().encode('Same message')
    
    const encrypted1 = await encrypt(plaintext, key)
    const encrypted2 = await encrypt(plaintext, key)
    
    expect(constantTimeEqual(encrypted1.ciphertext, encrypted2.ciphertext)).toBe(false)
  })

  it('fails decryption with wrong key', async () => {
    const key1 = randomBytes(32)
    const key2 = randomBytes(32)
    const plaintext = new TextEncoder().encode('Secret')
    
    const encrypted = await encrypt(plaintext, key1)
    
    await expect(decrypt(encrypted.combined, key2)).rejects.toThrow('Decryption failed')
  })

  it('fails with invalid key length', async () => {
    const key = randomBytes(16) // Wrong length
    const plaintext = new TextEncoder().encode('Test')
    
    await expect(encrypt(plaintext, key)).rejects.toThrow('Invalid key length')
  })

  it('encrypts large payloads', async () => {
    const key = randomBytes(32)
    const plaintext = randomBytes(1024 * 1024) // 1 MB
    
    const encrypted = await encrypt(plaintext, key)
    const decrypted = await decrypt(encrypted.combined, key)
    
    expect(constantTimeEqual(decrypted, plaintext)).toBe(true)
  })

  it('handles empty plaintext', async () => {
    const key = randomBytes(32)
    const plaintext = new Uint8Array(0)
    
    const encrypted = await encrypt(plaintext, key)
    const decrypted = await decrypt(encrypted.combined, key)
    
    expect(decrypted.length).toBe(0)
  })
})

describe('Full E2EE Flow', () => {
  it('encrypts with recovery key and decrypts', async () => {
    // 1. Generate recovery key
    const recovery = generateRecoveryKey()
    
    // 2. Derive encryption key
    const { key, salt } = await deriveKey({ password: recovery.bytes })
    
    // 3. Encrypt data
    const data = { secret: 'my-data', count: 42 }
    const plaintext = new TextEncoder().encode(JSON.stringify(data))
    const encrypted = await encrypt(plaintext, key)
    
    // 4. Later: Re-derive key with same recovery key and salt
    const { key: key2 } = await deriveKey({ password: recovery.bytes, salt })
    
    // 5. Decrypt
    const decrypted = await decrypt(encrypted.combined, key2)
    const result = JSON.parse(new TextDecoder().decode(decrypted))
    
    expect(result).toEqual(data)
  })
})
