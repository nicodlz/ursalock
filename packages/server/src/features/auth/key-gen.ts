/**
 * API key generation utilities
 * Pattern: ulk_ + 48 hex chars = 52 chars total
 */

import { randomBytes } from "node:crypto";

/**
 * Generate a new API key
 * Format: ulk_{48_hex_chars}
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(24).toString("hex"); // 24 bytes = 48 hex chars
  return `ulk_${randomPart}`;
}

/**
 * Extract prefix from API key (first 8 chars including ulk_)
 */
export function getKeyPrefix(key: string): string {
  return key.substring(0, 8);
}
