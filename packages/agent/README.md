# @ursalock/agent

Headless Node.js SDK for AI agents to read/write E2E encrypted documents.

## Overview

`@ursalock/agent` is a **thin wrapper** around `@ursalock/client` that provides:

- **Base64 key handling** — Agents receive keys as strings, not Uint8Arrays
- **API key authentication** — Simple bearer token auth
- **Clean, self-documenting API** — Purpose-built for agent use
- **Zero crypto reimplementation** — Delegates to `@ursalock/client` and `@ursalock/crypto`

## Installation

```bash
npm install @ursalock/agent
```

## Quick Start

```typescript
import { AgentVault } from '@ursalock/agent';

// Create vault with explicit keys
const vault = new AgentVault({
  serverUrl: 'https://vault.ndlz.net',
  apiKey: 'ulk_your_api_key',
  vaultUid: 'vault-123',
  encryptionKey: 'base64-encoded-key',
  hmacKey: 'base64-encoded-hmac-key',
});

// Access a typed collection
interface Note {
  title: string;
  content: string;
}

const notes = vault.collection<Note>('notes');

// Create encrypted document
await notes.create({
  title: 'Secret Note',
  content: 'This is encrypted end-to-end',
});

// List all notes
const allNotes = await notes.list();

// Get specific note
const note = await notes.get('doc-uid');

// Update note
await notes.update('doc-uid', { title: 'Updated Title' });

// Delete note
await notes.delete('doc-uid');
```

## Using Master Key

If you have the full master key (highest trust level):

```typescript
import { createAgentVaultFromMasterKey } from '@ursalock/agent';

const vault = await createAgentVaultFromMasterKey({
  serverUrl: 'https://vault.ndlz.net',
  apiKey: 'ulk_your_api_key',
  vaultUid: 'vault-123',
  masterKey: 'base64-encoded-master-key',
});

// Vault keys are automatically derived using HKDF
const notes = vault.collection<Note>('notes');
```

## API Reference

### `AgentVault`

#### Constructor

```typescript
new AgentVault(options: AgentVaultOptions)
```

**Options:**
- `serverUrl` — Vault server URL
- `apiKey` — API key for authentication (starts with `ulk_`)
- `vaultUid` — Vault unique identifier
- `encryptionKey` — Base64-encoded 32-byte encryption key
- `hmacKey` — Optional base64-encoded 32-byte HMAC key

#### Methods

##### `collection<T>(name: string): Collection<T>`

Get a typed collection.

**Example:**
```typescript
const tasks = vault.collection<{ task: string; done: boolean }>('tasks');
```

### `createAgentVaultFromMasterKey`

```typescript
async function createAgentVaultFromMasterKey(options: {
  serverUrl: string;
  apiKey: string;
  vaultUid: string;
  masterKey: string; // base64-encoded
}): Promise<AgentVault>
```

Derives vault-specific encryption and HMAC keys from a master key using HKDF.

### `Collection<T>`

See [@ursalock/client documentation](../client/README.md) for full Collection API.

**Methods:**
- `create(content: T): Promise<Document<T>>`
- `get(uid: string): Promise<Document<T>>`
- `list(options?: ListOptions): Promise<Document<T>[]>`
- `update(uid: string, content: Partial<T>): Promise<Document<T>>`
- `delete(uid: string): Promise<void>`
- `sync(since?: number): Promise<SyncResult<T>>`

## Security

### Key Handling

- **Never hardcode keys** — Load from environment variables or secure storage
- **Use HMAC keys** — Provides integrity verification (Encrypt-then-MAC)
- **Rotate API keys** — If compromised, revoke and generate new keys

### API Key Format

API keys start with `ulk_` and should be treated as secrets:

```typescript
const vault = new AgentVault({
  serverUrl: process.env.VAULT_URL!,
  apiKey: process.env.VAULT_API_KEY!,
  vaultUid: process.env.VAULT_UID!,
  encryptionKey: process.env.VAULT_ENC_KEY!,
  hmacKey: process.env.VAULT_HMAC_KEY,
});
```

### Trust Model

1. **Explicit keys** — Agent has encryption key only (read/write documents)
2. **Master key** — Agent has full vault access (highest trust)
3. **API key** — Server-side authentication (revocable)

## Architecture

This package is a **thin wrapper** with ~150 lines of code:

```
@ursalock/agent (this package)
  ↓ wraps
@ursalock/client (Collection implementation)
  ↓ uses
@ursalock/crypto (AES-GCM, HMAC, HKDF)
```

**Design principles:**
- **DRY** — No crypto/collection logic duplication
- **Minimal** — Only agent-specific concerns (base64, API key auth)
- **Reusable** — Delegates to battle-tested client/crypto packages

## Development

```bash
# Build
pnpm build

# Test
pnpm test

# Type check
pnpm typecheck
```

## License

MIT
