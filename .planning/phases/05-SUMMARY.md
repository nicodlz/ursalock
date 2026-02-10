# Phase 5 Summary: Sync Engine

## Deliverables
- `createSyncEngine()` - Standalone sync engine
- Bidirectional sync (push + pull)
- Offline queue with localStorage
- LWW conflict resolution

## Architecture

```
User changes state
       ↓
vault middleware
       ↓
┌──────────────────────┐
│  Local Storage       │  (immediate, encrypted)
│  (E2E encrypted)     │
└──────────────────────┘
       ↓
┌──────────────────────┐
│  Sync Engine         │
│  - Check online      │
│  - Compare timestamps│
│  - Push or queue     │
└──────────────────────┘
       ↓
┌──────────────────────┐
│  Server              │
│  (SQLite)            │
└──────────────────────┘
```

## Sync Flow

```typescript
// On app open
await store.vault.pull()  // Get latest from server

// On state change (automatic)
persistState()  // Save local immediately
store.vault.push()  // Push to server (debounced)

// Full sync (manual)
await store.vault.sync()  // Bidirectional
```

## Conflict Resolution (LWW)

```
Local:  { data: "A", updatedAt: 1000 }
Server: { data: "B", updatedAt: 2000 }

→ Server wins (2000 > 1000)
→ Local updated with server data
```

## Offline Support

```
1. User makes change while offline
2. Change saved to localStorage (encrypted)
3. Change added to offline queue
4. When online:
   - Process queue (push latest)
   - Clear queue
   - Continue normal sync
```

## API Surface

### Vault Methods
```typescript
// Full bidirectional sync
await store.vault.sync()

// Push local → server (queues if offline)
await store.vault.push()

// Pull server → local (returns true if updated)
const updated = await store.vault.pull()

// Check offline queue
const pending = store.vault.hasPendingChanges()

// Get sync status
const status = store.vault.getSyncStatus()
// 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
```

### React Hooks
```typescript
const status = useSyncStatus(useStore)
const hasOfflineChanges = usePendingChanges(useStore)
```

### Sync Engine (Advanced)
```typescript
import { createSyncEngine } from '@ursalock/zustand'

const engine = createSyncEngine({
  serverUrl: 'https://api.example.com',
  name: 'my-vault',
  getToken: () => authToken,
  onServerData: (data, salt, updatedAt) => { ... },
  getLocalData: () => ({ data, salt, updatedAt }),
})

await engine.sync()
await engine.push()
await engine.pull()
engine.getState() // { status, lastSyncAt, pendingChanges, error }
```

## Test Coverage
| Suite | Tests | Status |
|-------|-------|--------|
| sync() | 3 | ✅ |
| push() | 2 | ✅ |
| pull() | 2 | ✅ |
| offline queue | 2 | ✅ |
| **Total** | **9** | ✅ |

## VaultOptions Update
```typescript
vault(
  (set) => ({ ... }),
  {
    name: 'my-store',
    recoveryKey: '...',
    server: 'https://api.example.com',  // Enable sync
    getToken: () => authToken,          // Auth for sync
  }
)
```

## Bundle Size Impact
- Before: 5.80 KB
- After: 11.90 KB (+6.1 KB for sync engine)

## Commits
- `a373861`: Sync engine with offline support

## Duration
~20 minutes

## Next Phase
Phase 6: Polish & Documentation
- README.md
- Examples (React, Next.js)
- npm publish prep
