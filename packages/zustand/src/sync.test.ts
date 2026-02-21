/**
 * Sync engine tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSyncEngine, type SyncStatus } from './sync.js'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock localStorage
const mockStorage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockStorage.set(key, value),
  removeItem: (key: string) => mockStorage.delete(key),
})

// Mock navigator.onLine
vi.stubGlobal('navigator', { onLine: true })

describe('createSyncEngine', () => {
  let onServerData: ReturnType<typeof vi.fn>
  let getLocalData: ReturnType<typeof vi.fn>
  let onStatusChange: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch.mockReset()
    mockStorage.clear()
    onServerData = vi.fn()
    onStatusChange = vi.fn()
    getLocalData = vi.fn(() => ({
      data: '{"count":1}',
      salt: 'salt123',
      updatedAt: 1000,
    }))
  })

  const createEngine = () => createSyncEngine({
    serverUrl: 'http://test.com',
    name: 'test-vault',
    getToken: () => 'test-token',
    onServerData,
    getLocalData,
    onStatusChange,
  })

  describe('sync()', () => {
    it('pulls when server is newer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          uid: 'vault-123',
          name: 'test-vault',
          data: '{"count":5}',
          salt: 'salt456',
          version: 1,
          updatedAt: 2000, // Newer than local (1000)
        }),
      })

      const engine = createEngine()
      await engine.sync()

      expect(onServerData).toHaveBeenCalledWith('{"count":5}', 'salt456', 2000)
      expect(engine.getState().status).toBe('synced')
    })

    it('pushes when local is newer', async () => {
      const serverVault = {
        uid: 'vault-123',
        name: 'test-vault',
        data: '{"count":0}',
        salt: 'salt',
        version: 1,
        updatedAt: 500, // Older than local (1000)
      }

      // 1. First fetch in sync() to get server state
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => serverVault,
      })

      // 2. Second fetch in pushServer() to check if vault exists
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => serverVault,
      })

      // 3. Third fetch for the PUT
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ...serverVault,
          data: '{"count":1}',
          salt: 'salt123',
          version: 2,
          updatedAt: 1000,
        }),
      })

      const engine = createEngine()
      await engine.sync()

      expect(onServerData).not.toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalledTimes(3)
      expect(engine.getState().status).toBe('synced')
    })

    it('creates vault if none exists on server', async () => {
      // 1. First fetch in sync() returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      // 2. Second fetch in pushServer() also returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      // 3. Third fetch: POST to create
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          uid: 'new-vault',
          name: 'test-vault',
          data: '{"count":1}',
          salt: 'salt123',
          version: 1,
          updatedAt: 1000,
        }),
      })

      const engine = createEngine()
      await engine.sync()

      expect(mockFetch).toHaveBeenCalledTimes(3)
      expect(engine.getState().status).toBe('synced')
    })

    it('handles offline gracefully', async () => {
      vi.stubGlobal('navigator', { onLine: false })

      const engine = createEngine()
      await engine.sync()

      expect(mockFetch).not.toHaveBeenCalled()
      expect(engine.getState().status).toBe('offline')

      vi.stubGlobal('navigator', { onLine: true })
    })
  })

  describe('push()', () => {
    it('pushes local data to server', async () => {
      // GET existing vault
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          uid: 'vault-123',
          name: 'test-vault',
          data: '{}',
          salt: '',
          version: 1,
          updatedAt: 0,
        }),
      })

      // PUT update
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          uid: 'vault-123',
          name: 'test-vault',
          data: '{"count":1}',
          salt: 'salt123',
          version: 2,
          updatedAt: 1000,
        }),
      })

      const engine = createEngine()
      await engine.push()

      expect(engine.getState().status).toBe('synced')
    })

    it('queues when offline', async () => {
      vi.stubGlobal('navigator', { onLine: false })

      const engine = createEngine()
      await engine.push()

      expect(engine.getState().status).toBe('offline')
      expect(engine.getState().pendingChanges).toBe(true)

      vi.stubGlobal('navigator', { onLine: true })
    })
  })

  describe('pull()', () => {
    it('returns true when server has newer data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          uid: 'vault-123',
          name: 'test-vault',
          data: '{"count":10}',
          salt: 'salt',
          version: 1,
          updatedAt: 2000,
        }),
      })

      const engine = createEngine()
      const updated = await engine.pull()

      expect(updated).toBe(true)
      expect(onServerData).toHaveBeenCalled()
    })

    it('returns false when local is up to date', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          uid: 'vault-123',
          name: 'test-vault',
          data: '{"count":1}',
          salt: 'salt',
          version: 1,
          updatedAt: 500, // Older than local
        }),
      })

      const engine = createEngine()
      const updated = await engine.pull()

      expect(updated).toBe(false)
      expect(onServerData).not.toHaveBeenCalled()
    })
  })

  describe('version conflict (409)', () => {
    it('handles 409 by pulling latest and retrying push', async () => {
      const serverVault = {
        uid: 'vault-123',
        name: 'test-vault',
        data: '{"count":0}',
        salt: 'salt',
        version: 2,
        updatedAt: 500,
      }

      // 1. fetchServer in pushServer → returns existing vault (version 2)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => serverVault,
      })

      // 2. PUT returns 409 (version mismatch)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () => 'Version conflict',
      })

      // 3. fetchServer for conflict resolution → returns updated vault (version 3)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ...serverVault,
          data: '{"count":99}',
          version: 3,
          updatedAt: 2000,
        }),
      })

      // 4. Retry PUT succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ...serverVault,
          data: '{"count":1}',
          version: 4,
          updatedAt: 2001,
        }),
      })

      const engine = createEngine()
      await engine.push()

      // Server data callback should have been called with the conflicting version
      expect(onServerData).toHaveBeenCalledWith('{"count":99}', 'salt', 2000)
      expect(engine.getState().status).toBe('synced')
    })
  })

  describe('offline queue', () => {
    it('processes queue on next sync', async () => {
      // First, go offline and push
      vi.stubGlobal('navigator', { onLine: false })

      const engine = createEngine()
      await engine.push()

      expect(engine.getState().pendingChanges).toBe(true)

      // Come back online
      vi.stubGlobal('navigator', { onLine: true })

      // Mock server responses for sync
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ uid: 'new', name: 'test-vault', data: '{}', salt: '', version: 1, updatedAt: 1000 }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ uid: 'new', name: 'test-vault', data: '{}', salt: '', version: 1, updatedAt: 1000 }),
      })

      await engine.sync()

      expect(engine.getState().pendingChanges).toBe(false)
    })
  })
})
