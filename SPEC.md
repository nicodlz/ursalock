# zod-vault

> End-to-end encrypted sync for Zod schemas. Drop-in E2EE for any store.

---

## Vision

**Le problème :** Tu as une app avec un store (Zustand, Redux, vanilla) et des schemas Zod. Tu veux ajouter du sync cloud sécurisé sans tout réécrire.

**La solution :** `zod-vault` — une lib qui wrap ton store existant et ajoute :
- Chiffrement E2EE automatique
- Sync multi-device
- Auth par passkey
- Clé de récupération
- Backend minimal self-hostable

```typescript
// Avant : store local
const useStore = create<AppState>()(
  persist(storeConfig, { name: 'my-app' })
);

// Après : store local + sync E2EE
const useStore = create<AppState>()(
  vault(storeConfig, { 
    schema: appStateSchema,  // Zod schema
    endpoint: 'https://vault.example.com',
  })
);
```

---

## Principes de design

### 1. Non-invasif
- Pas de refactor massif
- Ton schema Zod existant fonctionne
- Ton store existant reste compatible

### 2. Secure by default
- E2EE obligatoire (pas d'option "en clair")
- Clés jamais envoyées au serveur
- Zero-knowledge architecture

### 3. Progressive enhancement
- Fonctionne offline-first
- Sync est optionnel (mode local-only possible)
- Dégradation gracieuse si serveur down

### 4. Minimal server
- Le serveur est un "dumb blob store"
- Pas de logique métier côté serveur
- Self-hostable en 1 commande Docker

### 5. Standards only
- Web Crypto API (pas de lib crypto custom)
- WebAuthn (passkeys standard)
- HTTP simple (pas de WebSocket obligatoire)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐ │
│  │ Your App   │──▶│ zod-vault  │──▶│  Crypto    │──▶│  Sync      │ │
│  │ Store      │   │  Middleware│   │  Layer     │   │  Client    │ │
│  └────────────┘   └────────────┘   └────────────┘   └────────────┘ │
│        │                │                │                │         │
│        ▼                ▼                ▼                ▼         │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐ │
│  │ Zod Schema │   │ Local      │   │ Web Crypto │   │ Fetch API  │ │
│  │ (yours)    │   │ Storage    │   │ API        │   │            │ │
│  └────────────┘   └────────────┘   └────────────┘   └────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS (encrypted blobs only)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                              SERVER                                  │
│                         @zod-vault/server                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐                  │
│  │ Hono API   │──▶│ PostgreSQL │   │ WebAuthn   │                  │
│  │ /v1/*      │   │ (blobs)    │   │ Verifier   │                  │
│  └────────────┘   └────────────┘   └────────────┘                  │
│                                                                      │
│  Stocke UNIQUEMENT :                                                │
│  - Blobs chiffrés (opaques)                                        │
│  - Credentials WebAuthn                                             │
│  - Metadata (timestamps, versions)                                  │
│                                                                      │
│  NE PEUT PAS :                                                      │
│  - Lire les données                                                 │
│  - Déchiffrer quoi que ce soit                                     │
│  - Récupérer les données sans la clé utilisateur                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Packages

```
@zod-vault/core       # Crypto, types, protocol
@zod-vault/client     # Middleware store-agnostic + React hooks
@zod-vault/zustand    # Middleware Zustand
@zod-vault/server     # Backend Hono
@zod-vault/cli        # CLI pour self-hosting
```

### Dépendances

**Client (browser) :**
- `zod` (peer dependency, ta version)
- 0 autres dépendances runtime (Web Crypto API natif)

**Server :**
- `hono`
- `@simplewebauthn/server`
- `postgres` ou `better-sqlite3`

---

## API Client

### Installation

```bash
npm install @zod-vault/client @zod-vault/zustand
```

### Configuration minimale

```typescript
import { create } from 'zustand';
import { vault } from '@zod-vault/zustand';
import { z } from 'zod';

// 1. Ton schema Zod (tu l'as déjà)
const appStateSchema = z.object({
  user: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  items: z.array(z.object({
    id: z.string(),
    title: z.string(),
    done: z.boolean(),
  })),
  settings: z.object({
    theme: z.enum(['light', 'dark']),
    language: z.string(),
  }),
});

type AppState = z.infer<typeof appStateSchema>;

// 2. Ton store avec vault middleware
const useStore = create<AppState>()(
  vault(
    (set, get) => ({
      user: { name: '', email: '' },
      items: [],
      settings: { theme: 'dark', language: 'en' },
      
      // Tes actions normales
      addItem: (item) => set((s) => ({ 
        items: [...s.items, item] 
      })),
    }),
    {
      // Config vault
      schema: appStateSchema,
      name: 'my-app',                              // Clé localStorage
      endpoint: 'https://vault.example.com',       // Ton serveur
      
      // Options
      syncDebounceMs: 1000,                        // Debounce sync
      conflictResolution: 'last-write-wins',       // Stratégie conflits
    }
  )
);
```

### Hook d'authentification

```typescript
import { useVault } from '@zod-vault/client';

function AuthButton() {
  const { 
    status,           // 'anonymous' | 'authenticated' | 'syncing'
    register,         // Créer un compte (passkey)
    login,            // Se connecter (passkey)
    logout,           // Se déconnecter
    recover,          // Récupérer avec clé
    recoveryKey,      // Clé de récupération (après register)
    lastSyncAt,       // Dernière sync
    error,            // Erreur éventuelle
  } = useVault();

  if (status === 'anonymous') {
    return (
      <div>
        <button onClick={register}>Create Account</button>
        <button onClick={login}>Sign In</button>
        <button onClick={() => recover(prompt('Recovery key?'))}>
          Recover
        </button>
      </div>
    );
  }

  return (
    <div>
      <span>Synced {lastSyncAt}</span>
      <button onClick={logout}>Sign Out</button>
    </div>
  );
}
```

### Affichage de la clé de récupération

```typescript
function RecoveryKeyModal() {
  const { recoveryKey, acknowledgeRecoveryKey } = useVault();
  
  if (!recoveryKey) return null;
  
  return (
    <Modal onClose={acknowledgeRecoveryKey}>
      <h2>Save Your Recovery Key</h2>
      <p>If you lose your passkey, you'll need this to recover your data.</p>
      
      <code className="recovery-key">
        {recoveryKey}  {/* ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6789 */}
      </code>
      
      <button onClick={() => navigator.clipboard.writeText(recoveryKey)}>
        Copy
      </button>
      <button onClick={() => downloadAsFile(recoveryKey)}>
        Download
      </button>
      
      <label>
        <input type="checkbox" required />
        I have saved my recovery key
      </label>
      
      <button onClick={acknowledgeRecoveryKey}>Continue</button>
    </Modal>
  );
}
```

### Export/Import (compatibilité)

```typescript
import { useVault } from '@zod-vault/client';

function DataManagement() {
  const { 
    exportData,     // Export JSON (clair ou chiffré)
    importData,     // Import JSON (auto-détection format)
  } = useVault();

  const handleExport = async () => {
    // Option 1: Export en clair (comme avant, compat legacy)
    const clearData = await exportData({ encrypted: false });
    download(clearData, 'backup.json');
    
    // Option 2: Export chiffré (portable, sécurisé)
    const encryptedData = await exportData({ encrypted: true });
    download(encryptedData, 'backup.encrypted.json');
  };

  const handleImport = async (file: File) => {
    const content = await file.text();
    const data = JSON.parse(content);
    
    // Auto-détecte le format (clair ou chiffré)
    const result = await importData(data);
    
    if (!result.success) {
      if (result.needsRecoveryKey) {
        const key = prompt('Enter recovery key:');
        await importData(data, { recoveryKey: key });
      } else {
        alert(result.error);
      }
    }
  };

  return (
    <div>
      <button onClick={handleExport}>Export Data</button>
      <input type="file" onChange={(e) => handleImport(e.target.files[0])} />
    </div>
  );
}
```

---

## API Server

### Installation & Démarrage

```bash
# Option 1: Docker (recommandé)
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL=postgres://... \
  -e VAULT_RP_ID=vault.example.com \
  -e VAULT_RP_NAME="My App" \
  ghcr.io/zod-vault/server:latest

# Option 2: npm
npm install @zod-vault/server
npx zod-vault serve --port 3000
```

### Configuration

```typescript
// server.ts (si tu veux customiser)
import { createVaultServer } from '@zod-vault/server';

const app = createVaultServer({
  // Requis
  database: process.env.DATABASE_URL,
  
  // WebAuthn
  rpId: 'vault.example.com',
  rpName: 'My App',
  rpOrigin: 'https://myapp.example.com',
  
  // Optionnel
  maxBlobSizeBytes: 10 * 1024 * 1024,  // 10MB max
  rateLimitPerMinute: 60,
  corsOrigins: ['https://myapp.example.com'],
  
  // Hooks (optionnel)
  onRegister: async (userId) => {
    console.log('New user:', userId);
  },
  onSync: async (userId, blobSize) => {
    console.log('Sync:', userId, blobSize);
  },
});

export default app;
```

### Endpoints

```
POST   /v1/auth/register/options    # Initier création passkey
POST   /v1/auth/register/verify     # Finaliser création + stocker recovery key chiffrée
POST   /v1/auth/login/options       # Initier login passkey
POST   /v1/auth/login/verify        # Finaliser login
POST   /v1/auth/logout              # Invalider session
POST   /v1/auth/recover             # Récupérer avec recovery key

GET    /v1/sync/blob                # Récupérer blob chiffré
PUT    /v1/sync/blob                # Upload nouveau blob
DELETE /v1/sync/blob                # Supprimer toutes les données (GDPR)

GET    /v1/account/passkeys         # Lister les passkeys
POST   /v1/account/passkeys         # Ajouter un passkey
DELETE /v1/account/passkeys/:id     # Supprimer un passkey
GET    /v1/account/sessions         # Lister les sessions actives
DELETE /v1/account/sessions/:id     # Révoquer une session

GET    /v1/health                   # Health check
```

---

## Modèle de données (serveur)

```sql
-- Utilisateurs
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recovery_key_hash TEXT NOT NULL,              -- Pour lookup lors de recovery
  recovery_key_encrypted BYTEA NOT NULL,        -- Clé chiffrée par passkey
  
  UNIQUE(recovery_key_hash)
);

-- Passkeys WebAuthn
CREATE TABLE passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  credential_id BYTEA NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  counter INT NOT NULL DEFAULT 0,
  
  device_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  
  -- Pour re-wrapper la recovery key quand on ajoute un nouveau passkey
  wrapped_recovery_key BYTEA
);

-- Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  
  device_name TEXT,
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Blobs chiffrés
CREATE TABLE blobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  ciphertext BYTEA NOT NULL,
  iv BYTEA NOT NULL,                            -- 12 bytes
  salt BYTEA NOT NULL,                          -- 16 bytes
  
  version BIGINT NOT NULL,                      -- Timestamp ms, pour conflict detection
  schema_version INT NOT NULL DEFAULT 1,        -- Version du schema client
  
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Un seul blob "current" par user
  UNIQUE(user_id) WHERE is_current = TRUE
);

-- Index pour perfs
CREATE INDEX idx_blobs_user_current ON blobs(user_id) WHERE is_current = TRUE;
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_passkeys_user ON passkeys(user_id);
CREATE INDEX idx_passkeys_credential ON passkeys(credential_id);
CREATE INDEX idx_users_recovery ON users(recovery_key_hash);
```

---

## Cryptographie

### Constantes

```typescript
// @zod-vault/core/crypto.ts

export const CRYPTO_CONFIG = {
  // Dérivation de clé
  KDF_ALGORITHM: 'PBKDF2',
  KDF_HASH: 'SHA-256',
  KDF_ITERATIONS: 600_000,        // OWASP 2023
  
  // Chiffrement
  CIPHER_ALGORITHM: 'AES-GCM',
  KEY_LENGTH: 256,                // bits
  IV_LENGTH: 12,                  // bytes
  SALT_LENGTH: 16,                // bytes
  
  // Recovery key
  RECOVERY_KEY_BYTES: 20,         // 160 bits
  RECOVERY_KEY_ALPHABET: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
} as const;
```

### Fonctions

```typescript
// @zod-vault/core/crypto.ts

/**
 * Génère une clé de récupération lisible par un humain.
 * Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 */
export function generateRecoveryKey(): {
  bytes: Uint8Array;
  display: string;
} {
  const bytes = crypto.getRandomValues(
    new Uint8Array(CRYPTO_CONFIG.RECOVERY_KEY_BYTES)
  );
  
  // Encode en base32 custom (sans caractères ambigus)
  const display = encodeBase32(bytes, CRYPTO_CONFIG.RECOVERY_KEY_ALPHABET);
  
  // Format avec tirets tous les 4 caractères
  const formatted = display.match(/.{1,4}/g)!.join('-');
  
  return { bytes, display: formatted };
}

/**
 * Parse une recovery key affichée vers bytes.
 */
export function parseRecoveryKey(display: string): Uint8Array {
  const cleaned = display.replace(/-/g, '').toUpperCase();
  return decodeBase32(cleaned, CRYPTO_CONFIG.RECOVERY_KEY_ALPHABET);
}

/**
 * Dérive une clé AES-256 à partir d'un secret.
 */
export async function deriveKey(
  secret: Uint8Array,
  salt: Uint8Array
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    secret,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: CRYPTO_CONFIG.KDF_ALGORITHM,
      salt,
      iterations: CRYPTO_CONFIG.KDF_ITERATIONS,
      hash: CRYPTO_CONFIG.KDF_HASH,
    },
    keyMaterial,
    { name: CRYPTO_CONFIG.CIPHER_ALGORITHM, length: CRYPTO_CONFIG.KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Chiffre des données JSON.
 */
export async function encrypt<T>(
  data: T,
  recoveryKey: Uint8Array
): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(
    new Uint8Array(CRYPTO_CONFIG.SALT_LENGTH)
  );
  const iv = crypto.getRandomValues(
    new Uint8Array(CRYPTO_CONFIG.IV_LENGTH)
  );
  
  const key = await deriveKey(recoveryKey, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: CRYPTO_CONFIG.CIPHER_ALGORITHM, iv },
    key,
    plaintext
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv,
    salt,
    version: Date.now(),
  };
}

/**
 * Déchiffre un blob.
 */
export async function decrypt<T>(
  blob: EncryptedBlob,
  recoveryKey: Uint8Array
): Promise<T> {
  const key = await deriveKey(recoveryKey, blob.salt);
  
  const plaintext = await crypto.subtle.decrypt(
    { name: CRYPTO_CONFIG.CIPHER_ALGORITHM, iv: blob.iv },
    key,
    blob.ciphertext
  );

  const json = new TextDecoder().decode(plaintext);
  return JSON.parse(json) as T;
}

/**
 * Hash la recovery key pour lookup côté serveur.
 * Utilise SHA-256 avec un préfixe pour éviter les rainbow tables.
 */
export async function hashRecoveryKeyForLookup(
  recoveryKey: Uint8Array
): Promise<string> {
  const prefixed = new Uint8Array([
    ...new TextEncoder().encode('zod-vault-lookup:'),
    ...recoveryKey,
  ]);
  
  const hash = await crypto.subtle.digest('SHA-256', prefixed);
  return bufferToHex(new Uint8Array(hash));
}
```

---

## Protocole de sync

### Flux d'enregistrement

```
┌────────┐                    ┌────────┐                    ┌────────┐
│ Client │                    │ Server │                    │Passkey │
└───┬────┘                    └───┬────┘                    └───┬────┘
    │                             │                             │
    │ 1. generateRecoveryKey()    │                             │
    │◄────────────────────────────│                             │
    │                             │                             │
    │ 2. POST /register/options   │                             │
    │────────────────────────────►│                             │
    │                             │                             │
    │         challenge           │                             │
    │◄────────────────────────────│                             │
    │                             │                             │
    │ 3. navigator.credentials.create()                         │
    │──────────────────────────────────────────────────────────►│
    │                             │                             │
    │                             │        credential           │
    │◄──────────────────────────────────────────────────────────│
    │                             │                             │
    │ 4. wrapRecoveryKey(credential, recoveryKey)               │
    │                             │                             │
    │ 5. POST /register/verify    │                             │
    │    { credential,            │                             │
    │      wrappedRecoveryKey,    │                             │
    │      recoveryKeyHash }      │                             │
    │────────────────────────────►│                             │
    │                             │                             │
    │                             │ 6. Store passkey +          │
    │                             │    wrappedRecoveryKey +     │
    │                             │    recoveryKeyHash          │
    │                             │                             │
    │         session token       │                             │
    │◄────────────────────────────│                             │
    │                             │                             │
    │ 7. Show recovery key to user                              │
    │    (MUST save it!)          │                             │
    │                             │                             │
```

### Flux de login

```
┌────────┐                    ┌────────┐                    ┌────────┐
│ Client │                    │ Server │                    │Passkey │
└───┬────┘                    └───┬────┘                    └───┬────┘
    │                             │                             │
    │ 1. POST /login/options      │                             │
    │────────────────────────────►│                             │
    │                             │                             │
    │         challenge           │                             │
    │◄────────────────────────────│                             │
    │                             │                             │
    │ 2. navigator.credentials.get()                            │
    │──────────────────────────────────────────────────────────►│
    │                             │                             │
    │                             │        assertion            │
    │◄──────────────────────────────────────────────────────────│
    │                             │                             │
    │ 3. POST /login/verify       │                             │
    │    { assertion }            │                             │
    │────────────────────────────►│                             │
    │                             │                             │
    │                             │ 4. Verify assertion         │
    │                             │    Lookup passkey           │
    │                             │    Update counter           │
    │                             │                             │
    │    { token,                 │                             │
    │      wrappedRecoveryKey }   │                             │
    │◄────────────────────────────│                             │
    │                             │                             │
    │ 5. unwrapRecoveryKey(credential, wrappedRecoveryKey)      │
    │    → recoveryKey en mémoire │                             │
    │                             │                             │
    │ 6. GET /sync/blob           │                             │
    │────────────────────────────►│                             │
    │                             │                             │
    │    encrypted blob           │                             │
    │◄────────────────────────────│                             │
    │                             │                             │
    │ 7. decrypt(blob, recoveryKey)                             │
    │    → state hydraté          │                             │
    │                             │                             │
```

### Flux de sync (après login)

```
┌────────┐                    ┌────────┐
│ Client │                    │ Server │
└───┬────┘                    └───┬────┘
    │                             │
    │ User modifie le state       │
    │                             │
    │ 1. debounce(1000ms)         │
    │                             │
    │ 2. encrypt(state, recoveryKey)
    │                             │
    │ 3. PUT /sync/blob           │
    │    { ciphertext, iv, salt,  │
    │      version, expectedVersion }
    │────────────────────────────►│
    │                             │
    │                             │ 4. Check version (conflict?)
    │                             │    Store new blob
    │                             │    Mark old as not current
    │                             │
    │    { ok, version }          │
    │◄────────────────────────────│
    │                             │
    │ 5. Update local version     │
    │                             │
```

### Flux de récupération

```
┌────────┐                    ┌────────┐
│ Client │                    │ Server │
└───┬────┘                    └───┬────┘
    │                             │
    │ User entre recovery key     │
    │ "ABCD-EFGH-..."             │
    │                             │
    │ 1. parseRecoveryKey()       │
    │    hashRecoveryKeyForLookup()
    │                             │
    │ 2. POST /recover            │
    │    { recoveryKeyHash }      │
    │────────────────────────────►│
    │                             │
    │                             │ 3. Lookup user by hash
    │                             │    Get encrypted blob
    │                             │
    │    { blob, userId }         │
    │◄────────────────────────────│
    │                             │
    │ 4. decrypt(blob, recoveryKey)
    │    → Vérifie que ça déchiffre
    │                             │
    │ 5. Prompt: Create new passkey
    │                             │
    │ 6. [Registration flow]      │
    │                             │
```

---

## Gestion des conflits

### Détection

Chaque blob a une `version` (timestamp ms). Lors d'un PUT :

```typescript
// Client
await api.putBlob({
  ...encryptedBlob,
  expectedVersion: lastKnownRemoteVersion,
});

// Server
if (currentBlob.version !== expectedVersion) {
  return { error: 'CONFLICT', serverVersion: currentBlob.version };
}
```

### Résolution

**Stratégie 1 : Last-Write-Wins (défaut)**

```typescript
// Config
vault(store, {
  conflictResolution: 'last-write-wins',
});

// Comportement
// 1. Fetch remote
// 2. Si remote.version > local.version → override local
// 3. Sinon → push local
```

**Stratégie 2 : Prompt utilisateur**

```typescript
vault(store, {
  conflictResolution: 'prompt',
  onConflict: async (local, remote) => {
    const choice = await showConflictModal(local, remote);
    return choice; // 'local' | 'remote' | 'merge'
  },
});
```

**Stratégie 3 : Custom merge**

```typescript
vault(store, {
  conflictResolution: 'custom',
  merge: (local, remote) => {
    // Ton algo de merge
    return {
      ...remote,
      items: mergeArraysById(local.items, remote.items),
    };
  },
});
```

---

## Types

```typescript
// @zod-vault/core/types.ts

import type { z } from 'zod';

// ============= Crypto =============

export interface EncryptedBlob {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
  version: number;
  schemaVersion?: number;
}

export interface EncryptedBlobSerialized {
  ciphertext: string;  // base64
  iv: string;          // base64
  salt: string;        // base64
  version: number;
  schemaVersion?: number;
}

// ============= Auth =============

export interface PasskeyInfo {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface SessionInfo {
  id: string;
  deviceName: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

// ============= Vault State =============

export type VaultStatus = 
  | 'initializing'      // Chargement initial
  | 'anonymous'         // Pas connecté, mode local-only
  | 'authenticated'     // Connecté, sync actif
  | 'syncing'           // Sync en cours
  | 'offline'           // Connecté mais pas de réseau
  | 'conflict'          // Conflit détecté
  | 'error';            // Erreur

export interface VaultState {
  status: VaultStatus;
  userId: string | null;
  lastSyncAt: string | null;
  localVersion: number;
  remoteVersion: number | null;
  pendingChanges: boolean;
  error: VaultError | null;
  recoveryKey: string | null;  // Seulement après register, avant ack
}

export interface VaultError {
  code: VaultErrorCode;
  message: string;
  details?: unknown;
}

export type VaultErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTH_REQUIRED'
  | 'INVALID_PASSKEY'
  | 'INVALID_RECOVERY_KEY'
  | 'DECRYPTION_FAILED'
  | 'SCHEMA_MISMATCH'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR';

// ============= Config =============

export interface VaultConfig<T extends z.ZodType> {
  /** Zod schema pour validation */
  schema: T;
  
  /** Nom pour localStorage */
  name: string;
  
  /** URL du serveur vault */
  endpoint: string;
  
  /** Debounce sync après modification (ms) */
  syncDebounceMs?: number;  // default: 1000
  
  /** Stratégie de résolution de conflits */
  conflictResolution?: 'last-write-wins' | 'prompt' | 'custom';
  
  /** Handler custom pour conflits */
  onConflict?: (
    local: z.infer<T>, 
    remote: z.infer<T>
  ) => Promise<'local' | 'remote' | z.infer<T>>;
  
  /** Merge function pour conflits custom */
  merge?: (local: z.infer<T>, remote: z.infer<T>) => z.infer<T>;
  
  /** Callback quand le status change */
  onStatusChange?: (status: VaultStatus) => void;
  
  /** Callback quand une erreur survient */
  onError?: (error: VaultError) => void;
  
  /** Activer les logs debug */
  debug?: boolean;
}

// ============= Export/Import =============

export interface ExportOptions {
  /** Chiffrer l'export (nécessite recovery key) */
  encrypted?: boolean;
  
  /** Inclure les metadata */
  includeMetadata?: boolean;
}

export interface ClearExport<T> {
  format: 'zod-vault-clear-v1';
  exportedAt: string;
  schemaVersion: number;
  data: T;
}

export interface EncryptedExport {
  format: 'zod-vault-encrypted-v1';
  exportedAt: string;
  blob: EncryptedBlobSerialized;
}

export type ExportData<T> = ClearExport<T> | EncryptedExport;
```

---

## Formats d'export

### Format clair (legacy-compatible)

```json
{
  "format": "zod-vault-clear-v1",
  "exportedAt": "2026-02-09T14:00:00.000Z",
  "schemaVersion": 1,
  "data": {
    "user": { "name": "John", "email": "john@example.com" },
    "items": [
      { "id": "1", "title": "Task 1", "done": false }
    ],
    "settings": { "theme": "dark", "language": "en" }
  }
}
```

**Compatibilité :** Si ton app a déjà un format d'export, tu peux configurer un adapter :

```typescript
vault(store, {
  exportAdapter: {
    // Convertir du format legacy vers zod-vault
    fromLegacy: (legacyExport) => ({
      format: 'zod-vault-clear-v1',
      exportedAt: legacyExport.exportedAt,
      schemaVersion: 1,
      data: legacyExport.data,
    }),
    
    // Convertir de zod-vault vers format legacy
    toLegacy: (vaultExport) => ({
      version: 1,
      exportedAt: vaultExport.exportedAt,
      data: vaultExport.data,
    }),
  },
});
```

### Format chiffré

```json
{
  "format": "zod-vault-encrypted-v1",
  "exportedAt": "2026-02-09T14:00:00.000Z",
  "blob": {
    "ciphertext": "base64...",
    "iv": "base64...",
    "salt": "base64...",
    "version": 1707489600000,
    "schemaVersion": 1
  }
}
```

---

## Sécurité

### Threat Model

| Menace | Mitigation |
|--------|------------|
| Serveur compromis | E2EE - serveur n'a jamais les clés |
| Admin malveillant | Idem |
| MITM | HTTPS + intégrité GCM |
| Replay attack | IV unique + version monotone |
| Bruteforce recovery key | 160 bits entropie = infaisable |
| Passkey volé | Biométrie/PIN sur le device |
| Session hijack | Token hash, expiration |
| XSS | Recovery key jamais en DOM, CSP |

### Ce que le serveur peut voir

- ✅ User ID
- ✅ Timestamps de sync
- ✅ Taille des blobs
- ✅ Fréquence de sync
- ✅ IP addresses
- ❌ Contenu des données
- ❌ Structure des données
- ❌ Recovery key

### Recommandations d'implémentation

1. **CSP stricte** — Empêcher XSS
2. **Secure context only** — HTTPS obligatoire
3. **Recovery key en mémoire** — Jamais en localStorage
4. **Session courte** — Expiration 24h, refresh si actif
5. **Rate limiting** — Protéger contre bruteforce

---

## Roadmap

### v0.1 (MVP)

- [ ] Core crypto (encrypt/decrypt/deriveKey)
- [ ] Recovery key generation
- [ ] Basic Zustand middleware
- [ ] Minimal Hono server
- [ ] Single passkey per user
- [ ] Last-write-wins conflicts
- [ ] Clear export/import

### v0.2

- [ ] React hooks (useVault)
- [ ] Conflict detection + prompt
- [ ] Multiple passkeys per user
- [ ] Session management
- [ ] Encrypted export/import

### v0.3

- [ ] Redux middleware
- [ ] Vanilla JS adapter
- [ ] Custom merge strategies
- [ ] Offline queue
- [ ] Sync status indicator component

### v1.0

- [ ] Full test coverage
- [ ] Security audit
- [ ] Documentation site
- [ ] Docker image
- [ ] CLI tools

### Future

- [ ] Svelte/Vue adapters
- [ ] React Native support
- [ ] Selective sync (partial state)
- [ ] Sharing (encrypted for multiple keys)
- [ ] Team vaults

---

## Comparaison avec alternatives

| Feature | zod-vault | Evolu | Zero | Custom |
|---------|-----------|-------|------|--------|
| E2EE natif | ✅ | ✅ | ❌ | ✅ |
| Zod schemas | ✅ | ❌ (own) | ❌ | ✅ |
| Drop-in | ✅ | ❌ | ❌ | ❌ |
| Passkeys | ✅ | ✅ | ❌ | ❌ |
| Recovery | ✅ | ✅ | N/A | ❌ |
| Self-host | ✅ | ✅ | ✅ | ✅ |
| CRDTs | ❌ | ✅ | ❌ | ❌ |
| Realtime | ❌ | ✅ | ✅ | ❌ |
| Bundle size | ~5KB | ~50KB | ~30KB | varies |
| Effort intégration | Low | High | Medium | High |

---

## Nom alternatifs

- `zod-vault` ✅
- `zod-sync`
- `zustand-e2ee`
- `schema-vault`
- `cryptostore`
- `vaulted`
- `lockbox`

---

## Questions ouvertes

1. **WebSocket pour sync temps réel ?**
   - Ajoute de la complexité
   - Polling HTTP suffit pour v1 ?

2. **Versioning du schema ?**
   - Que faire si le schema Zod change ?
   - Migrations automatiques ?

3. **Multi-tenant ?**
   - Un serveur pour plusieurs apps ?
   - Namespace par app ?

4. **Pricing model (si commercial) ?**
   - Open source core + hosted premium ?
   - Tout open source + support payant ?

---

## Références

- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [WebAuthn Guide](https://webauthn.guide/)
- [@simplewebauthn](https://simplewebauthn.dev/)
- [Zustand Middleware](https://docs.pmnd.rs/zustand/guides/how-to-create-middleware)
- [OWASP Crypto Guidelines](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
