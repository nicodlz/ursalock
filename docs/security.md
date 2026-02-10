# Security Model

ursalock is designed with a zero-knowledge architecture. The server cannot read your data.

## Threat Model

### What ursalock protects against

- Server compromise (data is encrypted, server has no keys)
- Database leaks (only encrypted blobs stored)
- Man-in-the-middle (HTTPS + client-side encryption)
- Unauthorized access (JWT auth + user isolation)

### What ursalock does NOT protect against

- Client-side compromise (malware on user's device)
- Recovery key theft (if someone has your key, they can decrypt)
- Weak recovery keys (always use `generateRecoveryKey()`)

## Encryption

### Algorithm: AES-256-GCM

- 256-bit key size
- Authenticated encryption (integrity + confidentiality)
- NIST approved, widely audited
- Implemented via Web Crypto API (native browser/Node.js)

### Key Derivation: Argon2id

- Memory-hard function (resistant to GPU/ASIC attacks)
- OWASP 2024 recommended parameters
- Derives encryption key from recovery key + random salt

Parameters used:
```
memory: 65536 KB (64 MB)
iterations: 3
parallelism: 4
hashLength: 32 bytes
```

### Encryption Flow

```
User's Recovery Key
        │
        ▼
┌───────────────────┐
│    Argon2id       │ ← Random Salt (stored with ciphertext)
│  Key Derivation   │
└───────────────────┘
        │
        ▼
   256-bit AES Key
        │
        ▼
┌───────────────────┐
│   AES-256-GCM     │ ← Random IV (stored with ciphertext)
│    Encryption     │
└───────────────────┘
        │
        ▼
   Encrypted Blob
   (sent to server)
```

## Recovery Key

The recovery key is a 256-bit random value encoded in a human-readable format:

```
ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-Q
```

- 52 characters (excluding dashes)
- Base32-like alphabet (A-Z, 2-7, no confusable chars)
- ~256 bits of entropy

### Key Properties

- **User-controlled**: Only the user knows it
- **Not transmitted**: Never sent to server
- **Not recoverable**: Server cannot recover lost keys
- **Portable**: Works across devices (just enter the key)

### Recommendations

- Store in a password manager
- Print a physical backup
- Never share via unencrypted channels
- Generate a new key per vault (optional, for isolation)

## Authentication

### JWT Tokens

- Access token: 15 minute expiry
- Refresh token: 7 day expiry
- Tokens include unique `jti` claim to prevent replay
- Refresh rotation on each use

### Password Hashing

User passwords (for email auth) are hashed with Argon2id before storage:

```
memory: 65536 KB
iterations: 3
parallelism: 4
```

### Passkeys (WebAuthn)

- Hardware-backed authentication
- Phishing-resistant
- No password to steal
- Recommended over email/password

## Server Security

### What the server stores

| Data | Encrypted? | Notes |
|------|------------|-------|
| User email | No | Needed for login |
| Password hash | Hashed | Argon2id, not reversible |
| Vault data | Yes | Opaque blob, server can't read |
| Vault salt | No | Required for decryption, useless without key |
| Timestamps | No | For sync conflict resolution |

### What the server CANNOT do

- Read vault contents
- Recover user data without recovery key
- Decrypt data even with database access
- Impersonate users (no access to private keys)

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                       CLIENT                                 │
│                                                             │
│  1. User enters recovery key                                │
│  2. State serialized to JSON                                │
│  3. Argon2id derives AES key from recovery key + salt       │
│  4. AES-256-GCM encrypts JSON                               │
│  5. Encrypted blob + salt sent to server                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS (TLS 1.3)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       SERVER                                 │
│                                                             │
│  6. Receives opaque blob                                    │
│  7. Stores blob + salt + metadata in SQLite                 │
│  8. Returns success                                         │
│                                                             │
│  Server sees: { blob: "a8f3c2e1...", salt: "b7d4...", ... } │
│  Server knows: NOTHING about your actual data               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Audit

The crypto implementation is in `@ursalock/crypto`:

- ~300 lines of TypeScript
- Uses Web Crypto API (no custom crypto)
- Uses `hash-wasm` for Argon2id (audited WASM implementation)

You can audit the code:
```bash
git clone https://github.com/nicodlz/ursalock
cat packages/crypto/src/*.ts | wc -l  # ~300 lines
```

## Reporting Vulnerabilities

Found a security issue? Please report privately:

1. **Do not** open a public GitHub issue
2. Email: ndlz@pm.me
3. Include: description, reproduction steps, impact assessment

We'll respond within 48 hours and coordinate disclosure.
