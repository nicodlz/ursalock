# Audit de sécurité - ursalock

**Date**: 2026-02-21  
**Auditeur**: Security Audit Agent  
**Périmètre**: Gestionnaire de mots de passe zero-knowledge (packages: crypto, server, zustand)

---

## 📋 Résumé exécutif

**Vulnérabilités critiques**: 5  
**Vulnérabilités hautes**: 6  
**Vulnérabilités moyennes**: 7  
**Recommandations**: 8

**Verdict global**: Le projet présente plusieurs vulnérabilités critiques qui doivent être corrigées avant toute mise en production. L'architecture cryptographique est globalement saine mais l'implémentation serveur présente des lacunes importantes en matière de protection contre les attaques.

---

## 🔴 CRITICAL - Vulnérabilités critiques

### C-01: Rate limiting manquant (serveur inopérable)

**Fichier**: `packages/server/src/app.ts:46`  
**Description**: Le middleware `rateLimit` est importé depuis `#features/auth/rate-limit.js` mais ce fichier n'existe pas.

```typescript
// app.ts ligne 46
app.use("/auth/*", rateLimit({ max: 10, windowMs: 60000 }));
```

**Impact**: 
- Le serveur plante au démarrage avec une erreur de module non trouvé
- Aucune protection contre le bruteforce sur les endpoints d'authentification
- Vulnérable aux attaques par déni de service (DoS)

**Remediation**:
```typescript
// Créer packages/server/src/features/auth/rate-limit.ts
import { createMiddleware } from "hono/factory";

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(options: { max: number; windowMs: number }) {
  return createMiddleware(async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") ?? 
               c.req.header("x-forwarded-for")?.split(",")[0] ?? 
               "unknown";
    
    const now = Date.now();
    const record = requestCounts.get(ip);
    
    if (record && record.resetAt > now) {
      if (record.count >= options.max) {
        return c.json({ error: "Too many requests" }, 429);
      }
      record.count++;
    } else {
      requestCounts.set(ip, { count: 1, resetAt: now + options.windowMs });
    }
    
    // Cleanup old entries
    if (Math.random() < 0.01) {
      for (const [key, val] of requestCounts) {
        if (val.resetAt < now) requestCounts.delete(key);
      }
    }
    
    return next();
  });
}
```

**Priorité**: IMMÉDIATE - bloque le démarrage du serveur

---

### C-02: JWT_SECRET peut être vide en environnement de test

**Fichier**: `packages/server/src/env.ts:41-51`  
**Description**: La validation de l'environnement est désactivée en mode test, permettant l'utilisation d'un JWT_SECRET vide.

```typescript
const skipEnvValidation = process.env["NODE_ENV"] === "test";

export const env: Env = (() => {
  if (skipEnvValidation) {
    return Object.fromEntries(
      Object.entries(envSchema).map(([key, schema]) => {
        const result = schema.safeParse(process.env[key]);
        return [key, result.success ? result.data : undefined];
      }),
    ) as Env;
  }
```

**Impact**:
- JWT signés avec une clé vide ou faible en environnement de test
- Si un environnement de test est exposé (staging, pre-prod), les tokens sont forgeable
- Violation du principe "test comme en prod"

**Remediation**:
```typescript
// env.ts
const envSchema = {
  // ...
  JWT_SECRET: z.string().min(32).refine(
    (val) => {
      // Même en test, exiger une vraie clé (générable)
      if (process.env.NODE_ENV === "test" && !val) {
        return "test-secret-key-minimum-32-chars-long-for-security";
      }
      return val;
    },
    { message: "JWT_SECRET must be at least 32 characters" }
  ),
};

// Ou forcer une valeur de test sécurisée
const TEST_JWT_SECRET = "test-jwt-secret-DO-NOT-USE-IN-PRODUCTION-32chars-minimum";

// Dans jwt.ts
function getSecretKey(): Uint8Array {
  const secret = env.JWT_SECRET || 
    (env.NODE_ENV === "test" ? TEST_JWT_SECRET : "");
  
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}
```

---

### C-03: Challenge store en mémoire sans nettoyage fiable

**Fichier**: `packages/server/src/api/auth/passkey.ts:32-39`  
**Description**: Les challenges WebAuthn sont stockés en mémoire avec un cleanup périodique (setInterval) qui n'est pas garanti de s'exécuter.

```typescript
const challengeStore = new Map<string, { challenge: string; ... }>();

// Cleanup expired challenges periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of challengeStore) {
    if (value.expiresAt < now) {
      challengeStore.delete(key);
    }
  }
}, 60000);
```

**Impact**:
- Fuite mémoire si le cleanup ne s'exécute pas (serveur sous charge)
- Challenges expirés restent valides indéfiniment
- Impossible de scaler horizontalement (challenges non partagés entre instances)
- En cas de redémarrage serveur, tous les challenges en cours sont perdus

**Remediation**:
```typescript
// Option 1: Utiliser Redis (recommandé en production)
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL);

async function storeChallenge(challenge: string, data: ChallengeData) {
  await redis.setex(
    `challenge:${challenge}`, 
    120, // TTL 2 minutes
    JSON.stringify(data)
  );
}

async function getChallenge(challenge: string): Promise<ChallengeData | null> {
  const data = await redis.get(`challenge:${challenge}`);
  return data ? JSON.parse(data) : null;
}

// Option 2: SQLite avec auto-cleanup (fallback)
// Ajouter une table challenges avec expiresAt
// SELECT ... WHERE expiresAt > unixepoch() pour auto-filter
```

**Priorité**: CRITIQUE - empêche le scaling et introduit des failles de sécurité

---

### C-04: Pas de protection CSRF sur les endpoints critiques

**Fichier**: `packages/server/src/app.ts` (absence de middleware CSRF)  
**Description**: Aucune protection CSRF n'est implémentée alors que l'API utilise des cookies de session JWT.

**Impact**:
- Un attaquant peut forger des requêtes depuis un site malveillant
- Vol de session via des attaques CSRF si les tokens JWT sont stockés en cookies
- Exécution d'actions non autorisées (création de vault, modification de données)

**Remediation**:
```typescript
// packages/server/src/features/auth/csrf.ts
import { createMiddleware } from "hono/factory";
import { getCookie, setCookie } from "hono/cookie";
import crypto from "node:crypto";

export const csrfProtection = createMiddleware(async (c, next) => {
  const method = c.req.method;
  
  // Skip CSRF pour GET, HEAD, OPTIONS
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return next();
  }
  
  const cookieToken = getCookie(c, "csrf-token");
  const headerToken = c.req.header("X-CSRF-Token");
  
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return c.json({ error: { code: "csrf_invalid", message: "CSRF token invalid" } }, 403);
  }
  
  return next();
});

export const csrfTokenGenerator = createMiddleware(async (c, next) => {
  let token = getCookie(c, "csrf-token");
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    setCookie(c, "csrf-token", token, {
      httpOnly: false, // Must be readable by JS
      secure: env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 86400, // 24h
    });
  }
  c.set("csrfToken", token);
  return next();
});

// app.ts
app.use("*", csrfTokenGenerator);
app.use("*", csrfProtection);
```

**Note**: Si les tokens JWT sont passés uniquement en header `Authorization: Bearer`, le risque CSRF est réduit mais pas éliminé (certaines attaques peuvent toujours fonctionner).

---

### C-05: Pas de validation de l'origine sur l'authentification ZKC

**Fichier**: `packages/server/src/api/auth/zkc.ts`  
**Description**: Les endpoints ZKCredentials (`/zkc/register`, `/zkc/authenticate`) n'utilisent pas `getRpConfigFromRequest()` pour valider l'origine, contrairement aux endpoints passkey.

```typescript
// zkc.ts - AUCUNE validation d'origine
.post("/register", zValidator("json", ZkcRegisterRequest), async (c) => {
  const { opaqueId, displayName } = c.req.valid("json");
  // ... pas de vérification d'origine
})

// Comparé à passkey.ts qui valide l'origine
.post("/register/options", async (c) => {
  const { rpId } = getRpConfigFromRequest(c); // ✓ Validation présente
})
```

**Impact**:
- N'importe quel domaine peut enregistrer/authentifier des utilisateurs sur votre serveur
- Attaque par phishing: un site malveillant peut créer des comptes sur votre instance
- Pollution de la base de données avec des comptes frauduleux

**Remediation**:
```typescript
// zkc.ts
import { getRpConfigFromRequest } from "#features/auth/origin.js";

.post("/register", zValidator("json", ZkcRegisterRequest), async (c) => {
  // Valider l'origine AVANT de traiter la requête
  getRpConfigFromRequest(c); // Lève une exception si origine invalide
  
  const { opaqueId, displayName } = c.req.valid("json");
  // ...
})

.post("/authenticate", zValidator("json", ZkcAuthenticateRequest), async (c) => {
  getRpConfigFromRequest(c); // Idem
  // ...
})
```

---

## 🟠 HIGH - Vulnérabilités hautes

### H-01: Timing attack potentiel sur la validation de recovery key

**Fichier**: `packages/crypto/src/recovery.ts:42-55`  
**Description**: La fonction `validateRecoveryKey()` utilise une boucle standard qui peut être vulnérable à des timing attacks.

```typescript
export function validateRecoveryKey(key: string): boolean {
  const clean = key.replace(/[-\s]/g, '').toUpperCase();
  
  if (clean.length !== 52) return false;
  
  // Timing attack possible ici
  for (const char of clean) {
    if (!BASE32_ALPHABET.includes(char)) return false; // Early return
  }
  
  return true;
}
```

**Impact**:
- Un attaquant peut mesurer le temps de réponse pour deviner des caractères de la recovery key
- Risque faible mais réel pour un gestionnaire de mots de passe

**Remediation**:
```typescript
export function validateRecoveryKey(key: string): boolean {
  const clean = key.replace(/[-\s]/g, '').toUpperCase();
  
  let isValid = clean.length === 52;
  
  // Constant-time validation: parcourir TOUS les caractères
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i] ?? '';
    if (!BASE32_ALPHABET.includes(char)) {
      isValid = false;
      // Ne PAS return early - continuer la boucle
    }
  }
  
  return isValid;
}
```

---

### H-02: Pas de headers HSTS configurés explicitement

**Fichier**: `packages/server/src/app.ts:49`  
**Description**: Le middleware `secureHeaders()` de Hono est utilisé, mais sans configuration explicite pour HSTS (HTTP Strict Transport Security).

```typescript
app.use("*", secureHeaders());
```

**Impact**:
- Les utilisateurs peuvent être vulnérables aux attaques man-in-the-middle lors de la première visite
- Pas de garantie que les connexions futures seront en HTTPS
- Downgrade attacks possibles

**Remediation**:
```typescript
app.use("*", secureHeaders({
  strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"], // Pour les styles inline
    connectSrc: ["'self'"],
    imgSrc: ["'self'", "data:", "https:"],
  },
  xFrameOptions: "DENY",
  xContentTypeOptions: "nosniff",
  referrerPolicy: "strict-origin-when-cross-origin",
}));
```

**Note**: Soumettre le domaine à la liste HSTS preload de Chrome pour une protection maximale.

---

### H-03: Pas de limite sur le nombre de sessions par utilisateur

**Fichier**: `packages/server/src/db/client.ts:173-180`  
**Description**: La fonction `createSession()` ne vérifie pas le nombre de sessions existantes pour un utilisateur.

```typescript
export function createSession(input: CreateSessionInput): Session {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
    ...
  `);
  return stmt.get(input.userId, input.tokenHash, input.expiresAt) as Session;
}
```

**Impact**:
- Un attaquant peut créer un nombre illimité de sessions pour un utilisateur
- Fuite mémoire / pollution de la base de données
- Potentiel DoS en créant des millions de sessions

**Remediation**:
```typescript
const MAX_SESSIONS_PER_USER = 10;

export function createSession(input: CreateSessionInput): Session {
  const db = getDb();
  
  // Compter les sessions actives
  const countStmt = db.prepare(`
    SELECT COUNT(*) as count 
    FROM sessions 
    WHERE user_id = ? AND expires_at > unixepoch()
  `);
  const { count } = countStmt.get(input.userId) as { count: number };
  
  if (count >= MAX_SESSIONS_PER_USER) {
    // Supprimer la plus ancienne session
    db.prepare(`
      DELETE FROM sessions 
      WHERE id = (
        SELECT id FROM sessions 
        WHERE user_id = ? AND expires_at > unixepoch()
        ORDER BY created_at ASC 
        LIMIT 1
      )
    `).run(input.userId);
  }
  
  // Créer la nouvelle session
  const stmt = db.prepare(`...`);
  return stmt.get(input.userId, input.tokenHash, input.expiresAt) as Session;
}
```

---

### H-04: Passkey counter peut ne pas être vérifié correctement (replay attack)

**Fichier**: `packages/server/src/api/auth/passkey.ts:268-281`  
**Description**: Le counter WebAuthn est mis à jour mais pas strictement vérifié contre les replays.

```typescript
if (!verification.verified) {
  throw new ApiException(errors.invalid_credentials as ApiError, 401);
}

// Update counter
updatePasskeyCounter(passkey.credentialId, verification.authenticationInfo.newCounter);
```

**Impact**:
- Si le nouveau counter est inférieur à l'ancien, c'est un signe de clonage/replay
- L'implémentation actuelle ne détecte pas ce cas
- Attaque possible: capturer une authentification et la rejouer

**Remediation**:
```typescript
// Dans passkey.ts après la vérification
const { newCounter } = verification.authenticationInfo;

// Vérifier que le nouveau counter est strictement supérieur
if (newCounter <= passkey.counter) {
  console.error(`[SECURITY] Passkey counter anomaly detected for user ${passkey.userId}. 
    Current: ${passkey.counter}, Received: ${newCounter}. Possible cloned authenticator.`);
  
  // Option stricte: rejeter l'authentification
  throw new ApiException({
    code: "passkey_counter_invalid",
    message: "Authenticator counter validation failed. Possible security issue detected."
  } as ApiError, 401);
  
  // Option souple: loguer et alerter l'utilisateur
  // await notifyUserOfSuspiciousActivity(passkey.userId);
}

updatePasskeyCounter(passkey.credentialId, newCounter);
```

---

### H-05: Pas de rotation des secrets JWT

**Fichier**: `packages/server/src/env.ts` (absence de mécanisme de rotation)  
**Description**: Le JWT_SECRET est fixe et ne peut pas être rotationné sans invalider toutes les sessions existantes.

**Impact**:
- Si le secret est compromis, tous les tokens passés et futurs sont vulnérables
- Pas de moyen de révoquer de manière granulaire
- Violation de la bonne pratique de rotation des secrets

**Remediation**:
```typescript
// Utiliser une liste de secrets avec rotation
// packages/server/src/features/auth/jwt.ts

interface SecretConfig {
  current: string;
  previous?: string[];
}

function getSecretKeys(): SecretConfig {
  const secrets = env.JWT_SECRET.split(",").map(s => s.trim());
  return {
    current: secrets[0]!,
    previous: secrets.slice(1),
  };
}

function getCurrentSecretKey(): Uint8Array {
  const { current } = getSecretKeys();
  return new TextEncoder().encode(current);
}

export async function verifyToken(token: string): Promise<AuthTokenPayload | null> {
  const { current, previous = [] } = getSecretKeys();
  
  // Essayer avec la clé actuelle
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(current));
    if (payload.sub) return payload as AuthTokenPayload;
  } catch {
    // Essayer avec les anciennes clés (période de transition)
    for (const oldSecret of previous) {
      try {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(oldSecret));
        if (payload.sub) {
          console.warn("[JWT] Token signed with old secret, should be refreshed");
          return payload as AuthTokenPayload;
        }
      } catch {
        continue;
      }
    }
  }
  
  return null;
}

// .env
// JWT_SECRET=new-secret-2026,old-secret-2025
```

---

### H-06: Argon2id parameters pourraient être insuffisants pour haute sécurité

**Fichier**: `packages/crypto/src/derive.ts:8-11`  
**Description**: Les paramètres Argon2 suivent OWASP 2023, mais sont à la limite basse pour un gestionnaire de mots de passe.

```typescript
// Parameters based on OWASP 2026 recommendations:
// - Memory: 64 MiB
// - Iterations: 3
// - Parallelism: 4
const DEFAULT_ARGON2_PARAMS = {
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
  // ...
}
```

**Impact**:
- Paramètres corrects mais conservateurs
- Un attaquant avec GPU modernes peut tenter ~10K-100K hash/s
- Pour un gestionnaire de mots de passe, on peut augmenter

**Remediation**:
```typescript
// Option 1: Augmenter les valeurs par défaut
const DEFAULT_ARGON2_PARAMS = {
  memoryCost: 131072, // 128 MiB (au lieu de 64)
  timeCost: 4,        // 4 iterations (au lieu de 3)
  parallelism: 4,
  keyLength: 32,
  saltLength: 32,
} as const;

// Option 2: Paramètres adaptatifs selon le device
export async function deriveKeyAdaptive(options: DeriveKeyOptions) {
  // Détecter la capacité du device
  const isMobile = /Mobile|Android|iPhone/i.test(navigator.userAgent);
  
  const params = {
    memoryCost: isMobile ? 65536 : 131072,  // 64 MiB mobile, 128 MiB desktop
    timeCost: isMobile ? 3 : 5,
    parallelism: 4,
    ...options,
  };
  
  return deriveKey(params);
}

// Option 3: Benchmark au premier démarrage
// Calibrer les paramètres pour cibler ~500ms-1s de temps de dérivation
```

**Note**: OWASP recommande 64 MiB minimum, 128 MiB pour haute sécurité. Le choix actuel est valide mais peut être amélioré.

---

## 🟡 MEDIUM - Vulnérabilités moyennes

### M-01: IV peut être fourni en paramètre (risque de réutilisation)

**Fichier**: `packages/crypto/src/providers/web-crypto.ts:21-26`  
**Description**: La fonction `encrypt()` accepte un paramètre `iv` optionnel, permettant la réutilisation d'IV.

```typescript
async encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv?: Uint8Array  // ⚠️ IV optionnel
): Promise<IEncryptedPayload> {
  const actualIv = iv ?? randomBytes(IV_LENGTH);
  // ...
}
```

**Impact**:
- Si un développeur réutilise le même IV avec la même clé, la sécurité AES-GCM est compromise
- Attaques possibles: récupération de plaintext, forgerie de tags d'authentification

**Remediation**:
```typescript
// Option 1: Supprimer le paramètre iv (recommandé)
async encrypt(
  plaintext: Uint8Array,
  key: Uint8Array
): Promise<IEncryptedPayload> {
  const iv = randomBytes(IV_LENGTH); // Toujours aléatoire
  // ...
}

// Option 2: Ajouter une assertion stricte
async encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv?: Uint8Array
): Promise<IEncryptedPayload> {
  if (iv) {
    console.warn("[SECURITY] Providing custom IV is dangerous. Use auto-generated IV.");
    // En mode strict, rejeter
    if (env.NODE_ENV === "production") {
      throw new Error("Custom IV not allowed in production");
    }
  }
  const actualIv = iv ?? randomBytes(IV_LENGTH);
  // ...
}
```

---

### M-02: Pas de logging des tentatives d'authentification échouées

**Fichier**: `packages/server/src/api/auth/*` (absence de logs)  
**Description**: Aucun log structuré des échecs d'authentification pour détecter les tentatives de bruteforce.

**Impact**:
- Impossible de détecter des attaques en cours
- Pas de données pour améliorer la sécurité
- Non-conformité avec certaines réglementations (RGPD, PCI-DSS)

**Remediation**:
```typescript
// packages/server/src/features/auth/audit-log.ts
interface AuthAuditEvent {
  timestamp: number;
  event: "login_success" | "login_failed" | "register" | "passkey_verify_failed";
  userId?: string;
  ip: string;
  userAgent: string;
  details?: Record<string, unknown>;
}

function logAuthEvent(event: AuthAuditEvent): void {
  // Option 1: Log structuré JSON (pour parsing par ELK, Splunk, etc.)
  console.log(JSON.stringify({
    type: "auth_audit",
    ...event,
  }));
  
  // Option 2: Stocker en DB pour consultation
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_log (event, user_id, ip, user_agent, details, created_at)
    VALUES (?, ?, ?, ?, ?, unixepoch())
  `).run(event.event, event.userId, event.ip, event.userAgent, JSON.stringify(event.details));
}

// Dans passkey.ts
} catch (error) {
  logAuthEvent({
    timestamp: Date.now(),
    event: "passkey_verify_failed",
    ip: c.req.header("cf-connecting-ip") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
    details: { credentialId: response.id },
  });
  throw new ApiException(errors.invalid_credentials as ApiError, 401);
}
```

---

### M-03: Pas d'option 2FA/MFA

**Fichier**: Architecture globale  
**Description**: Le système repose uniquement sur passkey ou email/password, sans couche de sécurité supplémentaire.

**Impact**:
- Si la passkey est compromise (phishing sophistiqué, malware), le compte est perdu
- Pas de défense en profondeur

**Remediation**:
```typescript
// Ajouter un système de 2FA optionnel
// packages/server/src/features/auth/totp.ts

import * as OTPAuth from "otpauth";

export function generateTotpSecret(userId: string): { secret: string; qrCode: string } {
  const totp = new OTPAuth.TOTP({
    issuer: "ursalock",
    label: userId,
    algorithm: "SHA256",
    digits: 6,
    period: 30,
  });
  
  return {
    secret: totp.secret.base32,
    qrCode: totp.toString(), // otpauth://totp/...
  };
}

export function verifyTotp(secret: string, token: string): boolean {
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

// Ajouter en DB: users.totp_secret, users.totp_enabled
// Forcer TOTP après authentification passkey si activé
```

---

### M-04: Pas de validation stricte des inputs JSON

**Fichier**: `packages/server/src/api/schemas.ts` (paramètres max lenient)  
**Description**: Certaines validations Zod pourraient être plus strictes.

```typescript
export const CreateVaultRequest = z.object({
  name: z.string().min(1).max(255),
  data: z.string().max(10 * 1024 * 1024), // 10MB - très large
  salt: z.string().max(1024), // 1KB pour un salt de 32 bytes ?
});
```

**Impact**:
- Un utilisateur malveillant peut uploader des blobs de 10MB qui ne contiennent que du bruit
- Salt de 1KB alors que 44 bytes (32 bytes en base64) suffisent
- Pas de validation du format base64

**Remediation**:
```typescript
const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;

export const CreateVaultRequest = z.object({
  name: z.string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9_-]+$/, "Name must be alphanumeric"),
  
  data: z.string()
    .max(5 * 1024 * 1024) // Réduire à 5MB
    .regex(base64Regex, "Data must be valid base64"),
  
  salt: z.string()
    .min(1)
    .max(64) // 32 bytes base64 = 44 chars + padding
    .regex(base64Regex, "Salt must be valid base64"),
});

// Ajouter validation de taille décodée
.refine((data) => {
  try {
    const decoded = atob(data);
    return decoded.length <= 4 * 1024 * 1024; // 4MB max après décodage
  } catch {
    return false;
  }
}, "Decoded data exceeds size limit")
```

---

### M-05: Pas de mécanisme de backup/export des clés

**Fichier**: Architecture globale  
**Description**: Aucun mécanisme de backup chiffré des recovery keys ou des vault data.

**Impact**:
- Si l'utilisateur perd sa recovery key ET son passkey, ses données sont perdues à jamais
- Pas de plan de disaster recovery

**Remediation**:
```typescript
// packages/crypto/src/backup.ts

/**
 * Créer un backup chiffré avec une phrase de passe séparée
 */
export async function createEncryptedBackup(
  vaultData: unknown,
  backupPassphrase: string
): Promise<{ encrypted: string; salt: string }> {
  const passphraseBytes = new TextEncoder().encode(backupPassphrase);
  
  // Dériver une clé avec des paramètres TRÈS élevés
  const { key, salt } = await deriveKey({
    password: passphraseBytes,
    memoryCost: 262144, // 256 MiB
    timeCost: 10,
  });
  
  const plaintext = new TextEncoder().encode(JSON.stringify(vaultData));
  const encrypted = await encrypt(plaintext, key);
  
  return {
    encrypted: bytesToBase64(encrypted.combined),
    salt: bytesToBase64(salt),
  };
}

// API endpoint pour download backup
// GET /vault/:uid/backup?passphrase=xxx
// Retourner un fichier .ursalock chiffré téléchargeable
```

---

### M-06: CORS origins depuis variable d'env sans validation stricte

**Fichier**: `packages/server/src/app.ts:52-58`  
**Description**: Les origines CORS sont lues depuis `RP_ORIGINS` sans validation de format.

```typescript
cors({
  origin: env.RP_ORIGINS.split(",").map(s => s.trim()),
  // ...
})
```

**Impact**:
- Une erreur de configuration peut ouvrir le CORS à `*` par accident
- Pas de vérification que les URLs sont valides
- Risque de typo (http au lieu de https)

**Remediation**:
```typescript
// env.ts
RP_ORIGINS: z.string()
  .default("http://localhost:5173")
  .refine((val) => {
    const origins = val.split(",").map(s => s.trim());
    return origins.every(origin => {
      try {
        const url = new URL(origin);
        // Forcer HTTPS en production
        if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    });
  }, "RP_ORIGINS must be valid URLs (HTTPS in production)"),

// app.ts
const allowedOrigins = env.RP_ORIGINS.split(",").map(s => s.trim());

// Validation dynamique dans CORS
cors({
  origin: (origin) => {
    if (!origin) return false; // Pas d'origine = requête non-browser (postman, etc.)
    return allowedOrigins.includes(origin);
  },
  // ...
})
```

---

### M-07: Sync engine ne vérifie pas l'intégrité des données serveur

**Fichier**: `packages/zustand/src/sync.ts:143-154`  
**Description**: Lors du pull de données depuis le serveur, aucune vérification d'intégrité (HMAC, signature) n'est effectuée.

```typescript
onServerData: (data, _salt, updatedAt) => {
  try {
    const parsed = JSON.parse(data) as unknown;
    const merged = merge(parsed, get());
    set(merged, true);
    // ...
  } catch (err) {
    console.error("[ursalock] Failed to parse server data:", err);
  }
},
```

**Impact**:
- Un serveur compromis peut injecter des données malveillantes
- Pas de détection de corruption ou altération des données
- Vulnérable à une attaque man-in-the-middle si HTTPS est compromis (rare mais possible)

**Remediation**:
```typescript
// Ajouter un HMAC lors du chiffrement
// packages/crypto/src/aes.ts

export async function encryptWithHmac(
  plaintext: Uint8Array,
  key: Uint8Array
): Promise<EncryptedPayload & { hmac: string }> {
  // Encrypt
  const encrypted = await encrypt(plaintext, key);
  
  // Dériver une clé HMAC séparée
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  // Signer le ciphertext
  const signature = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    encrypted.combined
  );
  
  return {
    ...encrypted,
    hmac: bytesToBase64(new Uint8Array(signature)),
  };
}

export async function decryptWithHmac(
  encrypted: EncryptedPayload & { hmac: string },
  key: Uint8Array
): Promise<Uint8Array> {
  // Vérifier HMAC AVANT de déchiffrer
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  
  const isValid = await crypto.subtle.verify(
    "HMAC",
    hmacKey,
    base64ToBytes(encrypted.hmac),
    encrypted.combined
  );
  
  if (!isValid) {
    throw new Error("HMAC verification failed - data may be corrupted or tampered");
  }
  
  return decrypt(encrypted, key);
}
```

**Note**: AES-GCM inclut déjà un tag d'authentification, donc HMAC est redondant pour détecter la corruption. Cette mesure est plutôt pour détecter une substitution malveillante de ciphertext par le serveur.

---

## ℹ️ LOW/INFO - Recommandations

### L-01: Ajouter un audit trail des accès aux vaults

**Description**: Loguer chaque accès (GET, PUT, DELETE) aux vaults pour traçabilité.

**Remediation**:
```typescript
// packages/server/src/api/vault/router.ts

.get("/:uid", (c) => {
  const session = c.get("session");
  const { uid } = c.req.param();
  
  // Log de l'accès
  auditLog({
    event: "vault_accessed",
    userId: session.user.uid,
    vaultUid: uid,
    ip: c.req.header("cf-connecting-ip"),
  });
  
  return c.json(vaultService.getVaultByUid(uid, session.user.id));
})
```

---

### L-02: Notifier l'utilisateur lors d'un nouveau device/session

**Description**: Envoyer une notification (email/push) quand une nouvelle session est créée.

**Remediation**:
```typescript
// packages/server/src/api/auth/passkey.ts

const session = createSession({ userId: user.id, tokenHash, expiresAt });

// Détecter si c'est un nouveau device
const isNewDevice = await detectNewDevice(user.id, c.req.header("user-agent"));

if (isNewDevice) {
  await sendEmail({
    to: user.email,
    subject: "New device logged in to your ursalock account",
    body: `A new device logged in to your account. If this wasn't you, please secure your account immediately.`,
  });
}
```

---

### L-03: Implémenter un cleanup automatique des sessions expirées

**Description**: Le cleanup existe (`deleteExpiredSessions()`) mais n'est jamais appelé automatiquement.

**Remediation**:
```typescript
// packages/server/src/server.ts

function startSessionCleanup() {
  // Cleanup toutes les heures
  setInterval(() => {
    const deleted = deleteExpiredSessions();
    if (deleted > 0) {
      console.log(`[cleanup] Deleted ${deleted} expired sessions`);
    }
  }, 3600_000); // 1 heure
}

// Appeler au démarrage
startSessionCleanup();
```

---

### L-04: Ajouter une page /security pour l'utilisateur

**Description**: Dashboard de sécurité montrant les sessions actives, dernières connexions, etc.

**Remediation**:
```typescript
// GET /auth/sessions - Liste toutes les sessions actives
.get("/sessions", requireAuthMiddleware, (c) => {
  const session = c.get("session");
  const sessions = getSessionsByUserId(session.user.id);
  
  return c.json({
    sessions: sessions.map(s => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: s.id === session.sessionId,
    })),
  });
});

// DELETE /auth/sessions/:id - Révoquer une session
.delete("/sessions/:id", requireAuthMiddleware, (c) => {
  const session = c.get("session");
  const { id } = c.req.param();
  
  // Vérifier que la session appartient bien à l'utilisateur
  revokeSession(parseInt(id), session.user.id);
  
  return c.json({ success: true });
});
```

---

### L-05: Rate limiting par utilisateur et non par IP

**Description**: Le rate limiting par IP peut bloquer des utilisateurs légitimes derrière un NAT.

**Remediation**:
```typescript
// Combiner IP + user ID pour le rate limiting
export function rateLimit(options: { max: number; windowMs: number }) {
  return createMiddleware(async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    const userId = c.get("session")?.user?.id ?? "anonymous";
    
    const key = `${ip}:${userId}`;
    
    // ... reste du code avec key au lieu de ip
  });
}
```

---

### L-06: Implémenter un mécanisme de "passkey compromise" report

**Description**: Permettre à l'utilisateur de signaler une passkey compromise pour la révoquer.

**Remediation**:
```typescript
// POST /auth/passkey/:id/revoke
.post("/passkey/:id/revoke", requireAuthMiddleware, (c) => {
  const session = c.get("session");
  const { id } = c.req.param();
  
  // Vérifier ownership
  const passkey = getPasskeyById(parseInt(id));
  if (!passkey || passkey.userId !== session.user.id) {
    throw new ApiException(errors.passkey_not_found, 404);
  }
  
  // Soft delete (garder pour forensics)
  markPasskeyAsRevoked(parseInt(id));
  
  // Notifier l'utilisateur
  sendEmail({
    to: session.user.email,
    subject: "Passkey revoked",
    body: "Your passkey has been revoked. You can register a new one anytime.",
  });
  
  return c.json({ success: true });
});
```

---

### L-07: Ajouter des tests de sécurité automatisés

**Description**: Implémenter des tests pour vérifier les vulnérabilités courantes.

**Remediation**:
```typescript
// packages/server/tests/security.test.ts

describe("Security Tests", () => {
  it("should reject requests without CSRF token", async () => {
    const res = await app.request("/vault", {
      method: "POST",
      headers: { "Authorization": `Bearer ${validToken}` },
      body: JSON.stringify({ name: "test" }),
    });
    expect(res.status).toBe(403);
  });
  
  it("should rate limit excessive requests", async () => {
    for (let i = 0; i < 15; i++) {
      await app.request("/auth/passkey/login/options", { method: "POST" });
    }
    const res = await app.request("/auth/passkey/login/options", { method: "POST" });
    expect(res.status).toBe(429);
  });
  
  it("should not accept weak JWT secrets", () => {
    expect(() => {
      env.JWT_SECRET = "short";
    }).toThrow();
  });
});
```

---

### L-08: Documentation de sécurité pour les développeurs

**Description**: Créer un guide `SECURITY.md` documentant les bonnes pratiques.

**Remediation**:
```markdown
# SECURITY.md

## Security Best Practices

### Never reuse IVs
Always use the auto-generated IV. Never provide a custom IV parameter.

### Key storage
- Never log or transmit keys in plaintext
- Use secure storage (Keychain, Credential Manager)
- Wipe keys from memory after use

### Recovery keys
- Display recovery keys only once during registration
- Force user to save it before proceeding
- Warn that lost recovery keys = lost data

### Reporting vulnerabilities
Email: security@ursalock.example.com
PGP key: [fingerprint]
```

---

## 📊 Statistiques par package

### packages/crypto
- ✅ Bonnes pratiques: Argon2id, AES-256-GCM, Web Crypto API
- ⚠️ Problèmes: Timing attack sur validation (H-01), IV optionnel (M-01)
- 🔧 Recommandations: Augmenter paramètres Argon2 (H-06)

### packages/server
- ❌ Critiques: Rate limiting manquant (C-01), CSRF absent (C-04), Challenge store en mémoire (C-03)
- ⚠️ Problèmes: Pas de limite sessions (H-03), Pas de logs audit (M-02)
- 🔧 Recommandations: HSTS (H-02), 2FA (M-03), Backup (M-05)

### packages/zustand
- ✅ Bonnes pratiques: Encryption transparente, Offline-first
- ⚠️ Problèmes: Pas de vérification intégrité serveur (M-07)
- 🔧 Recommandations: HMAC optionnel pour paranoia

---

## 🚀 Plan de remediation prioritaire

### Phase 1 - URGENT (blocker pour production)
1. ✅ **C-01**: Implémenter rate-limit.ts
2. ✅ **C-02**: Valider JWT_SECRET même en test
3. ✅ **C-03**: Migrer challenge store vers Redis/SQLite
4. ✅ **C-04**: Ajouter protection CSRF
5. ✅ **C-05**: Valider origine sur endpoints ZKC

**Deadline**: Avant toute mise en production

### Phase 2 - Haute priorité (1-2 semaines)
1. **H-01**: Fix timing attack sur recovery key
2. **H-02**: Configurer HSTS et CSP
3. **H-03**: Limiter sessions par utilisateur
4. **H-04**: Vérifier passkey counter strictement
5. **H-05**: Implémenter rotation JWT secrets
6. **H-06**: Augmenter paramètres Argon2

**Deadline**: Dans les 2 semaines post-lancement

### Phase 3 - Améliorations (1-3 mois)
1. **M-01 à M-07**: Corrections moyennes
2. **L-01 à L-08**: Fonctionnalités de sécurité avancées

**Deadline**: Sur 3 mois

---

## 📝 Checklist de déploiement

Avant de déployer en production, vérifier:

- [ ] Rate limiting opérationnel sur tous les endpoints auth
- [ ] JWT_SECRET > 32 caractères, aléatoire, stocké en variable d'env sécurisée
- [ ] Challenge store utilise Redis ou SQLite avec TTL automatique
- [ ] Protection CSRF activée et testée
- [ ] Validation d'origine sur TOUS les endpoints d'authentification
- [ ] HTTPS forcé (HSTS configuré)
- [ ] Logs d'audit activés et monitorés
- [ ] Tests de sécurité passent (rate limit, CSRF, JWT validation)
- [ ] Documentation SECURITY.md créée
- [ ] Plan de réponse aux incidents défini

---

## 🔗 Références

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) - Digital Identity Guidelines
- [WebAuthn Security Considerations](https://www.w3.org/TR/webauthn-2/#sctn-security-considerations)
- [OWASP JWT Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)

---

**Fin du rapport d'audit**  
**Prochaine étape**: Traiter les vulnérabilités CRITICAL avant toute mise en production.
