import { defineConfig } from "vitest/config";

// Set test env vars before any imports
process.env["DATABASE_PATH"] = ":memory:";
process.env["JWT_SECRET"] = "test-secret-key-32-bytes-minimum!!";
process.env["NODE_ENV"] = "test";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
    fileParallelism: false, // Sequential tests (shared DB)
  },
  resolve: {
    alias: {
      "#": "./src",
    },
  },
});
