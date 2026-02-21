/**
 * Zustand middleware tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { vault } from './vault.js'
import { createVaultStorage, type VaultStorage } from './storage.js'
import { generateRecoveryKey } from '@ursalock/crypto'

// Mock storage for tests (localStorage doesn't exist in Node)
const mockStorageMap = new Map<string, string>()

function createMockStorage(): VaultStorage {
  return {
    async getItem(key: string): Promise<string | null> {
      return mockStorageMap.get(key) ?? null
    },
    async setItem(key: string, value: string): Promise<void> {
      mockStorageMap.set(key, value)
    },
    async removeItem(key: string): Promise<void> {
      mockStorageMap.delete(key)
    },
  }
}

describe('createVaultStorage', () => {
  const recoveryKey = generateRecoveryKey().formatted

  beforeEach(() => {
    mockStorageMap.clear()
  })

  it('encrypts and stores data', async () => {
    const storage = createVaultStorage({ 
      recoveryKey, 
      storage: createMockStorage() 
    })
    
    await storage.setItem('test', JSON.stringify({ foo: 'bar' }))
    
    // Should have stored something
    expect(mockStorageMap.has('ursalock:test')).toBe(true)
    
    // Stored value should be encrypted (not plain JSON)
    const stored = mockStorageMap.get('ursalock:test')!
    expect(stored).not.toContain('foo')
    expect(stored).not.toContain('bar')
    
    // Should be parseable as our storage format
    const parsed = JSON.parse(stored)
    expect(parsed).toHaveProperty('data')
    expect(parsed).toHaveProperty('salt')
    expect(parsed).toHaveProperty('version')
    expect(parsed).toHaveProperty('updatedAt')
  })

  it('decrypts stored data', async () => {
    const storage = createVaultStorage({ 
      recoveryKey,
      storage: createMockStorage()
    })
    
    const original = { foo: 'bar', count: 42 }
    await storage.setItem('test', JSON.stringify(original))
    
    const retrieved = await storage.getItem('test')
    expect(JSON.parse(retrieved!)).toEqual(original)
  })

  it('returns null for non-existent keys', async () => {
    const storage = createVaultStorage({ 
      recoveryKey,
      storage: createMockStorage()
    })
    
    const result = await storage.getItem('nonexistent')
    expect(result).toBeNull()
  })

  it('removes items', async () => {
    const storage = createVaultStorage({ 
      recoveryKey,
      storage: createMockStorage()
    })
    
    await storage.setItem('test', 'data')
    expect(await storage.getItem('test')).not.toBeNull()
    
    await storage.removeItem('test')
    expect(await storage.getItem('test')).toBeNull()
  })

  it('uses custom prefix', async () => {
    const storage = createVaultStorage({ 
      recoveryKey, 
      prefix: 'custom:',
      storage: createMockStorage()
    })
    
    await storage.setItem('test', 'data')
    expect(mockStorageMap.has('custom:test')).toBe(true)
    expect(mockStorageMap.has('ursalock:test')).toBe(false)
  })

  it('fails to decrypt with wrong recovery key', async () => {
    const underlyingStorage = createMockStorage()
    
    const storage1 = createVaultStorage({ 
      recoveryKey,
      storage: underlyingStorage
    })
    const storage2 = createVaultStorage({ 
      recoveryKey: generateRecoveryKey().formatted,
      storage: underlyingStorage
    })
    
    await storage1.setItem('test', JSON.stringify({ secret: 'data' }))
    
    // Different key should fail to decrypt
    const result = await storage2.getItem('test')
    expect(result).toBeNull() // Returns null on decryption failure
  })
})

describe('vault middleware', () => {
  const recoveryKey = generateRecoveryKey().formatted

  beforeEach(() => {
    mockStorageMap.clear()
  })

  interface TestState {
    count: number
    text: string
    increment: () => void
    setText: (text: string) => void
  }

  it('creates a store with vault middleware', () => {
    const store = createStore<TestState>()(
      vault(
        (set) => ({
          count: 0,
          text: '',
          increment: () => set((s) => ({ count: s.count + 1 })),
          setText: (text) => set({ text }),
        }),
        { 
          name: 'test-store', 
          recoveryKey,
          storage: createVaultStorage({ recoveryKey, storage: createMockStorage() })
        }
      )
    )

    expect(store.getState().count).toBe(0)
    store.getState().increment()
    expect(store.getState().count).toBe(1)
  })

  it('exposes vault API methods', () => {
    const store = createStore<TestState>()(
      vault(
        (set) => ({
          count: 0,
          text: '',
          increment: () => set((s) => ({ count: s.count + 1 })),
          setText: (text) => set({ text }),
        }),
        { 
          name: 'test-store', 
          recoveryKey,
          storage: createVaultStorage({ recoveryKey, storage: createMockStorage() })
        }
      )
    )

    // Vault API is exposed under store.vault (like zustand persist uses store.persist)
    const storeWithVault = store as typeof store & {
      vault: {
        sync: () => Promise<void>
        rehydrate: () => Promise<void>
        hasHydrated: () => boolean
        getSyncStatus: () => string
        clearStorage: () => Promise<void>
      }
    }

    expect(typeof storeWithVault.vault.sync).toBe('function')
    expect(typeof storeWithVault.vault.rehydrate).toBe('function')
    expect(typeof storeWithVault.vault.hasHydrated).toBe('function')
    expect(typeof storeWithVault.vault.getSyncStatus).toBe('function')
    expect(typeof storeWithVault.vault.clearStorage).toBe('function')
  })

  it('persists state changes to encrypted storage', async () => {
    const store = createStore<TestState>()(
      vault(
        (set) => ({
          count: 0,
          text: '',
          increment: () => set((s) => ({ count: s.count + 1 })),
          setText: (text) => set({ text }),
        }),
        { 
          name: 'persist-test', 
          recoveryKey, 
          skipHydration: true,
          storage: createVaultStorage({ recoveryKey, storage: createMockStorage() })
        }
      )
    )

    // Make some changes
    store.getState().increment()
    store.getState().setText('hello')

    // Wait for persistence (Argon2id with OWASP high-security params takes ~2-3s)
    const maxWait = 8000
    const start = Date.now()
    while (!mockStorageMap.has('ursalock:persist-test') && Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 250))
    }

    // Check storage was updated
    expect(mockStorageMap.has('ursalock:persist-test')).toBe(true)
  })

  it('partializes state when configured', async () => {
    interface StateWithMethods {
      count: number
      secret: string
      increment: () => void
    }

    const underlyingStorage = createMockStorage()
    const vaultStorage = createVaultStorage({ recoveryKey, storage: underlyingStorage })

    const store = createStore<StateWithMethods>()(
      vault(
        (set) => ({
          count: 0,
          secret: 'do-not-persist',
          increment: () => set((s) => ({ count: s.count + 1 })),
        }),
        {
          name: 'partial-test',
          recoveryKey,
          skipHydration: true,
          partialize: (state) => ({ count: state.count }), // Only persist count
          storage: vaultStorage,
        }
      )
    )

    store.getState().increment()

    // Wait for persistence (Argon2id with OWASP high-security params takes ~2-3s, longer on CI)
    const maxWait = 8000
    const start = Date.now()
    let stored: string | null = null
    while (!stored && Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 250))
      stored = await vaultStorage.getItem('partial-test')
    }

    expect(stored).not.toBeNull()
    
    const parsed = JSON.parse(stored!)
    expect(parsed).toHaveProperty('count')
    expect(parsed).not.toHaveProperty('secret')
    expect(parsed).not.toHaveProperty('increment')
  })
})
