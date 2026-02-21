/**
 * Test setup - runs before each test file
 * Env vars set in vitest.config.ts
 */

import { beforeEach, afterAll } from "vitest";
import { getDb, closeDb } from "./db/client.js";

// Reset database before each test
beforeEach(() => {
  const db = getDb();
  
  // Clear all tables (if they exist)
  try {
    db.exec(`
      DELETE FROM documents;
      DELETE FROM api_keys;
      DELETE FROM vaults;
      DELETE FROM sessions;
      DELETE FROM passkeys;
      DELETE FROM users;
    `);
  } catch {
    // Tables might not exist yet on first run, that's ok
  }
});

// Close database after all tests
afterAll(() => {
  closeDb();
});
