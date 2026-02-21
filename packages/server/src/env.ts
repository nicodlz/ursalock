/**
 * Environment variables with Zod validation
 * Pattern: Darika style - strict in production, permissive in test
 */

import { z } from "zod";

const numeric = z.string().transform((val) => Number.parseInt(val, 10));

const envSchema = {
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: numeric.default("3456"),
  
  /** SQLite database file path */
  DATABASE_PATH: z.string().default("./data/vault.db"),
  
  /** JWT secret for signing tokens (32+ chars required). Comma-separated for rotation. */
  JWT_SECRET: z.string().min(32),
  
  /** JWT token expiry in seconds (default: 7 days) */
  JWT_EXPIRY: numeric.default("604800"),
  
  /** Relying Party name shown during passkey registration */
  RP_NAME: z.string().default("ursalock"),
  
  /** 
   * Allowed origins for WebAuthn (comma-separated)
   * e.g., "https://app1.example.com,https://app2.example.com"
   * The RP_ID is derived from the hostname of the validated origin
   */
  RP_ORIGINS: z.string().default("http://localhost:5173").refine(
    (val) => {
      const origins = val.split(",").map((s) => s.trim()).filter(Boolean);
      return origins.every((o) => {
        try {
          const url = new URL(o);
          return url.protocol === "https:" || url.protocol === "http:";
        } catch {
          return false;
        }
      });
    },
    { message: "RP_ORIGINS must be valid URLs (http or https)" },
  ).refine(
    (val) => {
      if (process.env["NODE_ENV"] !== "production") return true;
      const origins = val.split(",").map((s) => s.trim()).filter(Boolean);
      return origins.every((o) => new URL(o).protocol === "https:");
    },
    { message: "RP_ORIGINS must use HTTPS in production" },
  ),
};

type Env = {
  [K in keyof typeof envSchema]: z.infer<(typeof envSchema)[K]>;
};

/** Secure default JWT secret for test environment only (never used in production) */
const TEST_JWT_SECRET = "ursalock-test-secret-DO-NOT-USE-IN-PRODUCTION-x9k2m";

const isTestEnv = process.env["NODE_ENV"] === "test";

export const env: Env = (() => {
  // In test, provide a secure default for JWT_SECRET if not explicitly set
  if (isTestEnv && !process.env["JWT_SECRET"]) {
    process.env["JWT_SECRET"] = TEST_JWT_SECRET;
  }

  // Validate JWT_SECRET length even in test — never allow short/empty secrets
  const jwtSecret = process.env["JWT_SECRET"];
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
      `JWT_SECRET must be at least 32 characters (got ${jwtSecret?.length ?? 0}). ` +
      "Set a strong secret in your environment.",
    );
  }

  if (isTestEnv) {
    return Object.fromEntries(
      Object.entries(envSchema).map(([key, schema]) => {
        const result = schema.safeParse(process.env[key]);
        return [key, result.success ? result.data : undefined];
      }),
    ) as Env;
  }

  const parsed = z.object(envSchema).safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${errors}`);
  }
  return parsed.data;
})();

/**
 * Parse and return the allowed origins as an array of trimmed strings.
 */
export function getAllowedOrigins(): string[] {
  return env.RP_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
}
