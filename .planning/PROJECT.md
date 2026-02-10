# ursalock

## Vision

Drop-in E2EE encrypted cloud sync for existing Zustand stores. Replace `persist()` with `vault()` and your data is encrypted and synced across devices — zero-knowledge, self-hostable.

## Target Users

- Developers building apps with sensitive user data (finance, health, notes)
- Privacy-conscious users who want to own their data
- Solo devs who want sync without building a backend

## Core Value Proposition

**Existing solutions require migration.** Evolu needs its own schema DSL. Electric-SQL needs PostgreSQL. 

ursalock works with your **existing Zod schemas and Zustand stores**. No migration, no lock-in.

```typescript
// Before
persist(store, { name: 'my-store' })

// After
vault(store, { name: 'my-store' })
```

## Technical Constraints

- **Bundle size**: <20KB total (crypto + middleware)
- **Browser support**: Modern browsers with Web Crypto API
- **Offline-first**: Must work without network
- **Zero-knowledge**: Server never sees plaintext
- **Self-hostable**: Single Docker image, SQLite storage

## Success Criteria

- [ ] Demeter migrated to ursalock in <2 hours
- [ ] npm install + basic setup in <5 minutes
- [ ] Backend deployable on Coolify in <10 minutes
- [ ] All crypto reviewed and tested
- [ ] README that makes devs want to star
