/**
 * HTTP server entry point
 */

import { serve } from "@hono/node-server";
import { createApp } from "#app.js";
import { env } from "#env.js";
import { closeDb } from "#db/client.js";

const app = createApp();

console.log(`🔐 zod-vault server starting...`);
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

// Graceful shutdown
const shutdown = () => {
  console.log("\n🛑 Shutting down...");
  closeDb();
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
