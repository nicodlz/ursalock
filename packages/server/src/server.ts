/**
 * HTTP server entry point
 */

import { serve } from "@hono/node-server";
import { createApp } from "#app.js";
import { env } from "#env.js";
import { closeDb, deleteExpiredSessions } from "#db/client.js";

const app = createApp();

console.log(`🔐 ursalock server starting...`);
console.log(`   Environment: ${env.NODE_ENV}`);
console.log(`   Database: ${env.DATABASE_PATH}`);

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`   Listening: http://localhost:${info.port}`);
    console.log("");
    console.log("📡 Endpoints:");
    console.log("   POST /auth/email/register - Register with email/password");
    console.log("   POST /auth/email/login    - Login with email/password");
    console.log("   GET  /auth/me             - Get current user");
    console.log("   POST /auth/refresh        - Refresh token");
    console.log("   POST /auth/logout         - Logout");
    console.log("");
    console.log("   GET    /vault             - List vaults");
    console.log("   POST   /vault             - Create vault");
    console.log("   GET    /vault/:uid        - Get vault");
    console.log("   PUT    /vault/:uid        - Update vault");
    console.log("   DELETE /vault/:uid        - Delete vault");
    console.log("");
  },
);

// Clean up expired sessions every hour
const SESSION_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const cleanupInterval = setInterval(() => {
  try {
    const deleted = deleteExpiredSessions();
    if (deleted > 0) {
      console.log(`🧹 Cleaned up ${deleted} expired session(s)`);
    }
  } catch (err) {
    console.error("Failed to clean expired sessions:", err);
  }
}, SESSION_CLEANUP_INTERVAL);

// Graceful shutdown
let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n🛑 Shutting down...");
  clearInterval(cleanupInterval);
  // Stop accepting new connections
  server.close(() => {
    console.log("✅ Server closed");
  });
  // Wait for in-flight requests before closing DB
  setTimeout(() => {
    closeDb();
    console.log("✅ Database closed");
    process.exit(0);
  }, 2000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
