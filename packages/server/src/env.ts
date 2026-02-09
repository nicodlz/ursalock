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
  
  /** JWT secret for signing tokens (32+ bytes recommended) */
  JWT_SECRET: z.string().min(32),
  
  /** JWT token expiry in seconds (default: 7 days) */
  JWT_EXPIRY: numeric.default("604800"),
  
  /** Relying Party name shown during passkey registration */
  RP_NAME: z.string().default("zod-vault"),
  
  /** 
   * Allowed origins for WebAuthn (comma-separated)
   * e.g., "https://app1.example.com,https://app2.example.com"
   * The RP_ID is derived from the hostname of the validated origin
   */
  RP_ORIGINS: z.string().default("http://localhost:5173"),
};

type Env = {
  [K in keyof typeof envSchema]: z.infer<(typeof envSchema)[K]>;
};

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

  const parsed = z.object(envSchema).safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${errors}`);
  }
  return parsed.data;
})();
