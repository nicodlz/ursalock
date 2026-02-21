/**
 * Sync engine for vault middleware
 * Handles bidirectional sync with server + offline queue
 * 
 * Refactored to follow SOLID principles:
 * - IHttpClient interface (Dependency Inversion)
 * - Separated offline queue logic (Single Responsibility)
 * - Injectable HTTP client for testing
 */

import type { IHttpClient } from "./interfaces/http.js";
import { FetchHttpClient } from "./providers/fetch-http.js";
import { computeHmac, verifyHmac } from "@ursalock/crypto";

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

export interface SyncState {
  /** Last successful sync timestamp */
  lastSyncAt: number | null;
  /** Current sync status */
  status: SyncStatus;
  /** Pending changes waiting to be synced */
  pendingChanges: boolean;
  /** Last error message */
  error: string | null;
}

export interface ServerVault {
  uid: string;
  name: string;
  data: string;
  salt: string;
  version: number;
  updatedAt: number;
  /** HMAC-SHA256 of the data field (hex). Present on vaults written with integrity enabled. */
  hmac?: string;
}

export interface SyncOptions {
  /** Server base URL */
  serverUrl: string;
  /** Vault name */
  name: string;
  /** Auth token getter */
  getToken: () => string | null;
  /** Called when server has newer data */
  onServerData: (data: string, salt: string, updatedAt: number) => void;
  /** Get current local data */
  getLocalData: () => { data: string; salt: string; updatedAt: number };
  /** Called on sync status change */
  onStatusChange?: (status: SyncStatus) => void;
  /** HTTP client for making requests (default: FetchHttpClient) */
  httpClient?: IHttpClient;
  /** Storage provider for offline queue (default: localStorage) */
  storageProvider?: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  /**
   * HMAC key for sync integrity verification (Encrypt-then-MAC).
   * When provided, every push includes an HMAC-SHA256 tag over the
   * ciphertext; every pull verifies it before passing data to the
   * decryption layer. This detects server-side tampering.
   * 
   * Should be derived from the user's master key via a separate
   * derivation path (key separation principle).
   */
  hmacKey?: Uint8Array;
}

/** Offline queue stored in localStorage */
interface OfflineQueue {
  pending: Array<{
    data: string;
    salt: string;
    timestamp: number;
  }>;
}

const QUEUE_KEY = "ursalock:offline-queue";

/**
 * Create a sync engine instance
 * Uses dependency injection for HTTP client (Dependency Inversion Principle)
 */
export function createSyncEngine(options: SyncOptions) {
  const { 
    serverUrl, 
    name, 
    getToken, 
    onServerData, 
    getLocalData, 
    onStatusChange,
    httpClient = new FetchHttpClient(),
    storageProvider,
    hmacKey,
  } = options;

  const textEncoder = new TextEncoder();
  
  // Use provided storage or fall back to localStorage
  const queueStorage = storageProvider ?? (typeof localStorage !== "undefined" ? localStorage : null);
  
  let status: SyncStatus = "idle";
  let lastSyncAt: number | null = null;
  let error: string | null = null;
  /** Last known server version for optimistic locking */
  let knownServerVersion: number | null = null;

  const setStatus = (newStatus: SyncStatus, newError?: string) => {
    status = newStatus;
    error = newError ?? null;
    onStatusChange?.(newStatus);
  };

  /**
   * Load offline queue from localStorage
   */
  const loadQueue = (): OfflineQueue => {
    if (!queueStorage) return { pending: [] };
    try {
      const stored = queueStorage.getItem(`${QUEUE_KEY}:${name}`);
      return stored ? JSON.parse(stored) : { pending: [] };
    } catch {
      return { pending: [] };
    }
  };

  /**
   * Save offline queue to storage
   */
  const saveQueue = (queue: OfflineQueue): void => {
    if (!queueStorage) return;
    try {
      queueStorage.setItem(`${QUEUE_KEY}:${name}`, JSON.stringify(queue));
    } catch {
      // Storage full or unavailable
    }
  };

  /**
   * Add to offline queue
   */
  const enqueue = (data: string, salt: string): void => {
    const queue = loadQueue();
    queue.pending.push({ data, salt, timestamp: Date.now() });
    // Keep only last 10 pending changes
    if (queue.pending.length > 10) {
      queue.pending = queue.pending.slice(-10);
    }
    saveQueue(queue);
  };

  /**
   * Clear offline queue
   */
  const clearQueue = (): void => {
    saveQueue({ pending: [] });
  };

  /**
   * Check if online
   */
  const isOnline = (): boolean => {
    return typeof navigator === "undefined" || navigator.onLine;
  };

  /**
   * Fetch vault from server
   * Uses injected HTTP client (Dependency Inversion)
   */
  const fetchServer = async (): Promise<ServerVault | null> => {
    const token = getToken();
    if (!token) {
      console.warn("[ursalock] fetchServer: no auth token available, skipping");
      return null;
    }

    const res = await httpClient.request({
      url: `${serverUrl}/vault/by-name/${encodeURIComponent(name)}`,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    const vault = await res.json() as ServerVault;
    // Track server version for optimistic locking
    knownServerVersion = vault.version;
    return vault;
  };

  /**
   * Compute HMAC tag for outgoing data (if hmacKey is configured).
   */
  const computeTag = async (data: string): Promise<string | undefined> => {
    if (!hmacKey) return undefined;
    return computeHmac(textEncoder.encode(data), hmacKey);
  };

  /**
   * Verify HMAC integrity of incoming server data.
   * - Missing HMAC on server data: warn and allow (backward compat with older vaults)
   * - Invalid HMAC: reject with a clear error
   */
  const verifyTag = async (vault: ServerVault): Promise<void> => {
    if (!hmacKey) return;
    if (!vault.hmac) {
      console.warn(
        "[ursalock] Server vault has no HMAC tag. " +
        "This is expected for vaults created before integrity verification was enabled. " +
        "The vault will be re-signed on next push."
      );
      return;
    }
    const valid = await verifyHmac(
      textEncoder.encode(vault.data),
      hmacKey,
      vault.hmac,
    );
    if (!valid) {
      throw new Error(
        "[ursalock] HMAC verification failed: server data has been tampered with or the integrity key is wrong"
      );
    }
  };

  /**
   * Push vault to server (handles race conditions with retry on 409)
   *
   * Sends the last known server version for optimistic locking. If the server
   * detects a version mismatch it returns 409 and we force a pull + re-merge
   * before retrying the push once.
   */
  const pushServer = async (data: string, salt: string): Promise<ServerVault> => {
    const token = getToken();
    if (!token) throw new Error("Not authenticated");

    // Compute HMAC tag over ciphertext before sending (Encrypt-then-MAC)
    const hmac = await computeTag(data);

    // Try to get existing vault first
    let existing: ServerVault | null = null;
    try {
      existing = await fetchServer();
    } catch {
      // Ignore fetch errors, try to create
    }
    
    if (existing) {
      // Build body with version for optimistic locking
      const body: Record<string, unknown> = { data, salt, ...(hmac != null && { hmac }) };
      if (knownServerVersion != null) {
        body.version = knownServerVersion;
      }

      // Update existing vault
      const res = await httpClient.request({
        url: `${serverUrl}/vault/${existing.uid}`,
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      // Handle version conflict: pull latest, re-merge, retry once
      if (res.status === 409) {
        const latest = await fetchServer();
        if (latest) {
          await verifyTag(latest);
          onServerData(latest.data, latest.salt, latest.updatedAt);
          // Retry with fresh local data and updated version
          const retryLocal = getLocalData();
          const retryHmac = await computeTag(retryLocal.data);
          const retryBody: Record<string, unknown> = {
            data: retryLocal.data,
            salt: retryLocal.salt,
            ...(retryHmac != null && { hmac: retryHmac }),
          };
          if (knownServerVersion != null) {
            retryBody.version = knownServerVersion;
          }
          const retryRes = await httpClient.request({
            url: `${serverUrl}/vault/${existing.uid}`,
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(retryBody),
          });
          if (!retryRes.ok) {
            const errorText = await retryRes.text().catch(() => "");
            throw new Error(`Server error: ${retryRes.status} ${errorText}`);
          }
          const result = await retryRes.json() as ServerVault;
          knownServerVersion = result.version;
          return result;
        }
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Server error: ${res.status} ${errorText}`);
      }
      const result = await res.json() as ServerVault;
      knownServerVersion = result.version;
      return result;
    }

    // Try to create new vault
    const createRes = await httpClient.request({
      url: `${serverUrl}/vault`,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, data, salt, ...(hmac != null && { hmac }) }),
    });

    // Handle race condition: vault was created between our check and POST
    if (createRes.status === 409) {
      // Fetch the existing vault and update it instead
      const nowExisting = await fetchServer();
      if (!nowExisting) {
        throw new Error("Vault conflict but not found on retry");
      }
      
      const retryBody: Record<string, unknown> = { data, salt, ...(hmac != null && { hmac }) };
      if (knownServerVersion != null) {
        retryBody.version = knownServerVersion;
      }

      const retryRes = await httpClient.request({
        url: `${serverUrl}/vault/${nowExisting.uid}`,
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(retryBody),
      });

      if (!retryRes.ok) {
        const errorText = await retryRes.text().catch(() => "");
        throw new Error(`Server error: ${retryRes.status} ${errorText}`);
      }
      const result = await retryRes.json() as ServerVault;
      knownServerVersion = result.version;
      return result;
    }

    if (!createRes.ok) {
      const errorText = await createRes.text().catch(() => "");
      throw new Error(`Server error: ${createRes.status} ${errorText}`);
    }
    const result = await createRes.json() as ServerVault;
    knownServerVersion = result.version;
    return result;
  };

  /**
   * Sync with server (bidirectional)
   */
  const sync = async (): Promise<void> => {
    if (!isOnline()) {
      setStatus("offline");
      return;
    }

    setStatus("syncing");

    try {
      // Process offline queue first
      const queue = loadQueue();
      if (queue.pending.length > 0) {
        // Push most recent pending change
        const latest = queue.pending[queue.pending.length - 1];
        if (latest) {
          await pushServer(latest.data, latest.salt);
          clearQueue();
        }
      }

      // Get local and server state
      const local = getLocalData();
      const server = await fetchServer();

      if (!server) {
        // No server data, push local
        if (local.data) {
          await pushServer(local.data, local.salt);
        }
      } else if (server.updatedAt > local.updatedAt) {
        // Server is newer — verify integrity before accepting
        await verifyTag(server);
        onServerData(server.data, server.salt, server.updatedAt);
      } else if (local.updatedAt > server.updatedAt) {
        // Local is newer, push
        await pushServer(local.data, local.salt);
      }
      // If equal, nothing to do

      lastSyncAt = Date.now();
      setStatus("synced");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      console.error("[ursalock] Sync error:", message);
      setStatus("error", message);
      
      // Queue for later if push failed
      if (message.includes("Server error")) {
        const local = getLocalData();
        enqueue(local.data, local.salt);
      }
    }
  };

  /**
   * Push local changes to server (with offline support)
   */
  const push = async (): Promise<void> => {
    if (!isOnline()) {
      const local = getLocalData();
      enqueue(local.data, local.salt);
      setStatus("offline");
      return;
    }

    setStatus("syncing");

    try {
      const local = getLocalData();
      await pushServer(local.data, local.salt);
      lastSyncAt = Date.now();
      setStatus("synced");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Push failed";
      console.error("[ursalock] Push error:", message);
      
      // Queue for retry
      const local = getLocalData();
      enqueue(local.data, local.salt);
      setStatus("error", message);
    }
  };

  /**
   * Pull latest from server
   */
  const pull = async (): Promise<boolean> => {
    if (!isOnline()) {
      setStatus("offline");
      return false;
    }

    setStatus("syncing");

    try {
      const server = await fetchServer();
      
      if (server) {
        const local = getLocalData();
        if (server.updatedAt > local.updatedAt) {
          await verifyTag(server);
          onServerData(server.data, server.salt, server.updatedAt);
          lastSyncAt = Date.now();
          setStatus("synced");
          return true;
        }
      }

      setStatus("synced");
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Pull failed";
      console.error("[ursalock] Pull error:", message);
      setStatus("error", message);
      return false;
    }
  };

  /**
   * Get current sync state
   */
  const getState = (): SyncState => ({
    lastSyncAt,
    status,
    pendingChanges: loadQueue().pending.length > 0,
    error,
  });

  return {
    sync,
    push,
    pull,
    getState,
    clearQueue,
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
