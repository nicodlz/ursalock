/**
 * Sync engine for vault middleware
 * Handles bidirectional sync with server + offline queue
 */

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
}

/** Offline queue stored in localStorage */
interface OfflineQueue {
  pending: Array<{
    data: string;
    salt: string;
    timestamp: number;
  }>;
}

const QUEUE_KEY = "zod-vault:offline-queue";

/**
 * Create a sync engine instance
 */
export function createSyncEngine(options: SyncOptions) {
  const { serverUrl, name, getToken, onServerData, getLocalData, onStatusChange } = options;
  
  let status: SyncStatus = "idle";
  let lastSyncAt: number | null = null;
  let error: string | null = null;

  const setStatus = (newStatus: SyncStatus, newError?: string) => {
    status = newStatus;
    error = newError ?? null;
    onStatusChange?.(newStatus);
  };

  /**
   * Load offline queue from localStorage
   */
  const loadQueue = (): OfflineQueue => {
    if (typeof localStorage === "undefined") return { pending: [] };
    try {
      const stored = localStorage.getItem(`${QUEUE_KEY}:${name}`);
      return stored ? JSON.parse(stored) : { pending: [] };
    } catch {
      return { pending: [] };
    }
  };

  /**
   * Save offline queue to localStorage
   */
  const saveQueue = (queue: OfflineQueue): void => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(`${QUEUE_KEY}:${name}`, JSON.stringify(queue));
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
   */
  const fetchServer = async (): Promise<ServerVault | null> => {
    const token = getToken();
    if (!token) return null;

    const res = await fetch(`${serverUrl}/vault/by-name/${encodeURIComponent(name)}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    return res.json();
  };

  /**
   * Push vault to server (handles race conditions with retry on 409)
   */
  const pushServer = async (data: string, salt: string): Promise<ServerVault> => {
    const token = getToken();
    if (!token) throw new Error("Not authenticated");

    // Try to get existing vault first
    const existing = await fetchServer();
    
    if (existing) {
      // Update existing vault
      const res = await fetch(`${serverUrl}/vault/${existing.uid}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data, salt }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      return res.json();
    }

    // Try to create new vault
    const createRes = await fetch(`${serverUrl}/vault`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, data, salt }),
    });

    // Handle race condition: vault was created between our check and POST
    if (createRes.status === 409) {
      // Fetch the existing vault and update it instead
      const nowExisting = await fetchServer();
      if (!nowExisting) {
        throw new Error("Vault conflict but not found on retry");
      }
      
      const retryRes = await fetch(`${serverUrl}/vault/${nowExisting.uid}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data, salt }),
      });

      if (!retryRes.ok) throw new Error(`Server error: ${retryRes.status}`);
      return retryRes.json();
    }

    if (!createRes.ok) throw new Error(`Server error: ${createRes.status}`);
    return createRes.json();
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
        // Server is newer, pull
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
      console.error("[zod-vault] Sync error:", message);
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
      console.error("[zod-vault] Push error:", message);
      
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
      console.error("[zod-vault] Pull error:", message);
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
