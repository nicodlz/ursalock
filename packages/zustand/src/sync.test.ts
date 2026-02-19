/**
 * Sync engine tests
 * Uses mock IHttpClient instead of stubbing global fetch
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSyncEngine, type SyncStatus } from './sync.js'
import type { IHttpClient, IHttpRequest, IHttpResponse } from './interfaces/http.js'

class MockHttpClient implements IHttpClient {
  private responses: Array<Partial<IHttpResponse>> = []
  readonly requests: IHttpRequest[] = []

  enqueue(res: Partial<IHttpResponse>): void {
    this.responses.push(res)
  }

  async request(req: IHttpRequest): Promise<IHttpResponse> {
    this.requests.push(req)
    const res = this.responses.shift()
    if (!res) throw new Error(`MockHttpClient: no response queued for ${req.method} ${req.url}`)
    return {
      ok: res.ok ?? true,
      status: res.status ?? 200,
      json: res.json ?? (async () => ({})),
      text: res.text ?? (async () => ''),
    }
  }

  reset(): void {
    this.responses = []
    this.requests.length = 0
  }
}

function createMockStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  }
}

vi.stubGlobal('navigator', { onLine: true })

describe('createSyncEngine', () => {
  let httpClient: MockHttpClient
  let storage: ReturnType<typeof createMockStorage>
  let onServerData: ReturnType<typeof vi.fn>
  let getLocalData: ReturnType<typeof vi.fn>
  let onStatusChange: ReturnType<typeof vi.fn>

  beforeEach(() => {
    httpClient = new MockHttpClient()
    storage = createMockStorage()
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
    httpClient,
    storageProvider: storage,
  })

  describe('sync()', () => {
    it('pulls when server is newer', async () => {
      httpClient.enqueue({
        ok: true, status: 200,
        json: async () => ({ uid: 'vault-123', name: 'test-vault', data: '{"count":5}', salt: 'salt456', version: 1, updatedAt: 2000 }),
      })
      const engine = createEngine()
      await engine.sync()
      expect(onServerData).toHaveBeenCalledWith('{"count":5}', 'salt456', 2000)
      expect(engine.getState().status).toBe('synced')
    })

    it('pushes when local is newer', async () => {
      const sv = { uid: 'vault-123', name: 'test-vault', data: '{"count":0}', salt: 'salt', version: 1, updatedAt: 500 }
      httpClient.enqueue({ ok: true, status: 200, json: async () => sv })
      httpClient.enqueue({ ok: true, status: 200, json: async () => sv })
      httpClient.enqueue({ ok: true, status: 200, json: async () => ({ ...sv, data: '{"count":1}', salt: 'salt123', version: 2, updatedAt: 1000 }) })
      const engine = createEngine()
      await engine.sync()
      expect(onServerData).not.toHaveBeenCalled()
      expect(httpClient.requests).toHaveLength(3)
      expect(engine.getState().status).toBe('synced')
    })

    it('creates vault if none exists on server', async () => {
      httpClient.enqueue({ ok: false, status: 404 })
      httpClient.enqueue({ ok: false, status: 404 })
      httpClient.enqueue({ ok: true, status: 201, json: async () => ({ uid: 'new-vault', name: 'test-vault', data: '{"count":1}', salt: 'salt123', version: 1, updatedAt: 1000 }) })
      const engine = createEngine()
      await engine.sync()
      expect(httpClient.requests).toHaveLength(3)
      expect(engine.getState().status).toBe('synced')
    })

    it('handles offline gracefully', async () => {
      vi.stubGlobal('navigator', { onLine: false })
      const engine = createEngine()
      await engine.sync()
      expect(httpClient.requests).toHaveLength(0)
      expect(engine.getState().status).toBe('offline')
      vi.stubGlobal('navigator', { onLine: true })
    })
  })

  describe('push()', () => {
    it('pushes local data to server', async () => {
      httpClient.enqueue({ ok: true, status: 200, json: async () => ({ uid: 'vault-123', name: 'test-vault', data: '{}', salt: '', version: 1, updatedAt: 0 }) })
      httpClient.enqueue({ ok: true, status: 200, json: async () => ({ uid: 'vault-123', name: 'test-vault', data: '{"count":1}', salt: 'salt123', version: 2, updatedAt: 1000 }) })
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
      httpClient.enqueue({ ok: true, status: 200, json: async () => ({ uid: 'vault-123', name: 'test-vault', data: '{"count":10}', salt: 'salt', version: 1, updatedAt: 2000 }) })
      const engine = createEngine()
      const updated = await engine.pull()
      expect(updated).toBe(true)
      expect(onServerData).toHaveBeenCalled()
    })

    it('returns false when local is up to date', async () => {
      httpClient.enqueue({ ok: true, status: 200, json: async () => ({ uid: 'vault-123', name: 'test-vault', data: '{"count":1}', salt: 'salt', version: 1, updatedAt: 500 }) })
      const engine = createEngine()
      const updated = await engine.pull()
      expect(updated).toBe(false)
      expect(onServerData).not.toHaveBeenCalled()
    })
  })

  describe('offline queue', () => {
    it('processes queue on next sync', async () => {
      vi.stubGlobal('navigator', { onLine: false })
      const engine = createEngine()
      await engine.push()
      expect(engine.getState().pendingChanges).toBe(true)

      vi.stubGlobal('navigator', { onLine: true })
      httpClient.enqueue({ ok: false, status: 404 })
      httpClient.enqueue({ ok: true, status: 201, json: async () => ({ uid: 'new', name: 'test-vault', data: '{}', salt: '', version: 1, updatedAt: 1000 }) })
      httpClient.enqueue({ ok: true, status: 200, json: async () => ({ uid: 'new', name: 'test-vault', data: '{}', salt: '', version: 1, updatedAt: 1000 }) })

      await engine.sync()
      expect(engine.getState().pendingChanges).toBe(false)
    })
  })
})
