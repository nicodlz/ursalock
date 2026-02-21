/**
 * HKDF key derivation tests
 */

import { describe, it, expect } from 'vitest'
import { hkdf, deriveVaultKeys } from './hkdf.js'
import { encrypt, decrypt } from './aes.js'
import { computeHmac, verifyHmac } from './hmac.js'
import { randomBytes, constantTimeEqual } from './utils.js'

describe('hkdf', () => {
  it('produces 32 bytes by default', async () => {
    const ikm = randomBytes(32)
    const derived = await hkdf(ikm, 'test-context')
    
    expect(derived.length).toBe(32)
  })

  it('produces correct length when specified (16 bytes)', async () => {
    const ikm = randomBytes(32)
    const derived = await hkdf(ikm, 'test-context', undefined, 16)
    
    expect(derived.length).toBe(16)
  })

  it('produces correct length when specified (48 bytes)', async () => {
    const ikm = randomBytes(32)
    const derived = await hkdf(ikm, 'test-context', undefined, 48)
    
    expect(derived.length).toBe(48)
  })

  it('produces correct length when specified (64 bytes)', async () => {
    const ikm = randomBytes(32)
    const derived = await hkdf(ikm, 'test-context', undefined, 64)
    
    expect(derived.length).toBe(64)
  })

  it('is deterministic (same inputs → same output)', async () => {
    const ikm = randomBytes(32)
    const info = 'test-context'
    const salt = randomBytes(16)
    
    const derived1 = await hkdf(ikm, info, salt)
    const derived2 = await hkdf(ikm, info, salt)
    
    expect(constantTimeEqual(derived1, derived2)).toBe(true)
  })

  it('produces different keys for different info strings', async () => {
    const ikm = randomBytes(32)
    const salt = randomBytes(16)
    
    const key1 = await hkdf(ikm, 'context-1', salt)
    const key2 = await hkdf(ikm, 'context-2', salt)
    
    expect(constantTimeEqual(key1, key2)).toBe(false)
  })

  it('produces different keys for different salts', async () => {
    const ikm = randomBytes(32)
    const info = 'same-context'
    
    const key1 = await hkdf(ikm, info, randomBytes(16))
    const key2 = await hkdf(ikm, info, randomBytes(16))
    
    expect(constantTimeEqual(key1, key2)).toBe(false)
  })

  it('produces different keys for different IKM', async () => {
    const info = 'same-context'
    const salt = randomBytes(16)
    
    const key1 = await hkdf(randomBytes(32), info, salt)
    const key2 = await hkdf(randomBytes(32), info, salt)
    
    expect(constantTimeEqual(key1, key2)).toBe(false)
  })

  it('accepts info as Uint8Array', async () => {
    const ikm = randomBytes(32)
    const info = new TextEncoder().encode('test-context')
    
    const derived = await hkdf(ikm, info)
    
    expect(derived.length).toBe(32)
  })

  it('handles empty salt (default behavior)', async () => {
    const ikm = randomBytes(32)
    
    const derived1 = await hkdf(ikm, 'test')
    const derived2 = await hkdf(ikm, 'test', undefined)
    const derived3 = await hkdf(ikm, 'test', new Uint8Array(0))
    
    expect(constantTimeEqual(derived1, derived2)).toBe(true)
    expect(constantTimeEqual(derived1, derived3)).toBe(true)
  })

  it('matches RFC 5869 test vector A.1 (basic test case)', async () => {
    // RFC 5869 Appendix A.1: HKDF-SHA256 test case
    // https://tools.ietf.org/html/rfc5869#appendix-A.1
    
    const ikm = hexToBytes('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b')
    const salt = hexToBytes('000102030405060708090a0b0c')
    const info = hexToBytes('f0f1f2f3f4f5f6f7f8f9')
    const L = 42
    
    const expectedOKM = hexToBytes(
      '3cb25f25faacd57a90434f64d0362f2a' +
      '2d2d0a90cf1a5a4c5db02d56ecc4c5bf' +
      '34007208d5b887185865'
    )
    
    const okm = await hkdf(ikm, info, salt, L)
    
    expect(constantTimeEqual(okm, expectedOKM)).toBe(true)
  })

  it('matches RFC 5869 test vector A.2 (longer inputs)', async () => {
    // RFC 5869 Appendix A.2: test with longer inputs/outputs
    
    const ikm = hexToBytes(
      '000102030405060708090a0b0c0d0e0f' +
      '101112131415161718191a1b1c1d1e1f' +
      '202122232425262728292a2b2c2d2e2f' +
      '303132333435363738393a3b3c3d3e3f' +
      '404142434445464748494a4b4c4d4e4f'
    )
    const salt = hexToBytes(
      '606162636465666768696a6b6c6d6e6f' +
      '707172737475767778797a7b7c7d7e7f' +
      '808182838485868788898a8b8c8d8e8f' +
      '909192939495969798999a9b9c9d9e9f' +
      'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf'
    )
    const info = hexToBytes(
      'b0b1b2b3b4b5b6b7b8b9babbbcbdbebf' +
      'c0c1c2c3c4c5c6c7c8c9cacbcccdcecf' +
      'd0d1d2d3d4d5d6d7d8d9dadbdcdddedf' +
      'e0e1e2e3e4e5e6e7e8e9eaebecedeeef' +
      'f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff'
    )
    const L = 82
    
    const expectedOKM = hexToBytes(
      'b11e398dc80327a1c8e7f78c596a4934' +
      '4f012eda2d4efad8a050cc4c19afa97c' +
      '59045a99cac7827271cb41c65e590e09' +
      'da3275600c2f09b8367793a9aca3db71' +
      'cc30c58179ec3e87c14c01d5c1f3434f' +
      '1d87'
    )
    
    const okm = await hkdf(ikm, info, salt, L)
    
    expect(constantTimeEqual(okm, expectedOKM)).toBe(true)
  })

  it('matches RFC 5869 test vector A.3 (empty salt)', async () => {
    // RFC 5869 Appendix A.3: test with empty salt
    
    const ikm = hexToBytes('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b')
    const salt = new Uint8Array(0) // Empty salt
    const info = new Uint8Array(0) // Empty info
    const L = 42
    
    const expectedOKM = hexToBytes(
      '8da4e775a563c18f715f802a063c5a31' +
      'b8a11f5c5ee1879ec3454e5f3c738d2d' +
      '9d201395faa4b61a96c8'
    )
    
    const okm = await hkdf(ikm, info, salt, L)
    
    expect(constantTimeEqual(okm, expectedOKM)).toBe(true)
  })
})

describe('deriveVaultKeys', () => {
  it('returns 3 distinct 32-byte keys', async () => {
    const masterKey = randomBytes(32)
    const vaultUid = 'test-vault-123'
    
    const keys = await deriveVaultKeys(masterKey, vaultUid)
    
    expect(keys.encryptionKey.length).toBe(32)
    expect(keys.hmacKey.length).toBe(32)
    expect(keys.indexKey.length).toBe(32)
    
    // All keys must be different
    expect(constantTimeEqual(keys.encryptionKey, keys.hmacKey)).toBe(false)
    expect(constantTimeEqual(keys.encryptionKey, keys.indexKey)).toBe(false)
    expect(constantTimeEqual(keys.hmacKey, keys.indexKey)).toBe(false)
  })

  it('is deterministic (same inputs → same keys)', async () => {
    const masterKey = randomBytes(32)
    const vaultUid = 'test-vault-456'
    
    const keys1 = await deriveVaultKeys(masterKey, vaultUid)
    const keys2 = await deriveVaultKeys(masterKey, vaultUid)
    
    expect(constantTimeEqual(keys1.encryptionKey, keys2.encryptionKey)).toBe(true)
    expect(constantTimeEqual(keys1.hmacKey, keys2.hmacKey)).toBe(true)
    expect(constantTimeEqual(keys1.indexKey, keys2.indexKey)).toBe(true)
  })

  it('produces different keys for different vault UIDs', async () => {
    const masterKey = randomBytes(32)
    
    const keys1 = await deriveVaultKeys(masterKey, 'vault-aaa')
    const keys2 = await deriveVaultKeys(masterKey, 'vault-bbb')
    
    expect(constantTimeEqual(keys1.encryptionKey, keys2.encryptionKey)).toBe(false)
    expect(constantTimeEqual(keys1.hmacKey, keys2.hmacKey)).toBe(false)
    expect(constantTimeEqual(keys1.indexKey, keys2.indexKey)).toBe(false)
  })

  it('produces different keys for different master keys', async () => {
    const vaultUid = 'same-vault'
    
    const keys1 = await deriveVaultKeys(randomBytes(32), vaultUid)
    const keys2 = await deriveVaultKeys(randomBytes(32), vaultUid)
    
    expect(constantTimeEqual(keys1.encryptionKey, keys2.encryptionKey)).toBe(false)
    expect(constantTimeEqual(keys1.hmacKey, keys2.hmacKey)).toBe(false)
    expect(constantTimeEqual(keys1.indexKey, keys2.indexKey)).toBe(false)
  })

  it('derived encryptionKey can encrypt/decrypt data', async () => {
    const masterKey = randomBytes(32)
    const vaultUid = 'vault-crypto-test'
    
    const { encryptionKey } = await deriveVaultKeys(masterKey, vaultUid)
    
    const plaintext = new TextEncoder().encode('Secret vault data')
    const encrypted = await encrypt(plaintext, encryptionKey)
    const decrypted = await decrypt(encrypted.combined, encryptionKey)
    
    expect(new TextDecoder().decode(decrypted)).toBe('Secret vault data')
  })

  it('derived hmacKey works with computeHmac/verifyHmac', async () => {
    const masterKey = randomBytes(32)
    const vaultUid = 'vault-hmac-test'
    
    const { hmacKey } = await deriveVaultKeys(masterKey, vaultUid)
    
    const data = new TextEncoder().encode('Data to authenticate')
    const mac = await computeHmac(data, hmacKey)
    const valid = await verifyHmac(data, hmacKey, mac)
    
    expect(valid).toBe(true)
  })

  it('full integration: master key → vault keys → encrypt → HMAC', async () => {
    const masterKey = randomBytes(32)
    const vaultUid = 'integration-test-vault'
    
    // Derive vault-specific keys
    const { encryptionKey, hmacKey } = await deriveVaultKeys(masterKey, vaultUid)
    
    // Encrypt document
    const document = { title: 'Secret Doc', content: 'Top secret information' }
    const plaintext = new TextEncoder().encode(JSON.stringify(document))
    const encrypted = await encrypt(plaintext, encryptionKey)
    
    // Compute HMAC over ciphertext
    const mac = await computeHmac(encrypted.combined, hmacKey)
    
    // Verify HMAC
    expect(await verifyHmac(encrypted.combined, hmacKey, mac)).toBe(true)
    
    // Decrypt
    const decrypted = await decrypt(encrypted.combined, encryptionKey)
    const recovered = JSON.parse(new TextDecoder().decode(decrypted))
    
    expect(recovered).toEqual(document)
  })
})

// Helper function to convert hex string to bytes
function hexToBytes(hex: string): Uint8Array {
  const len = hex.length >>> 1
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
