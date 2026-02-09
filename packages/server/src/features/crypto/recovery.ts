/**
 * Recovery key generation for E2EE
 * Generates a 256-bit key in base32 format with dashes
 */

import { randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Generate a new recovery key
 * Format: XXXX-XXXX-XXXX-... (52 chars + dashes)
 */
export function generateRecoveryKey(): string {
  const bytes = randomBytes(32);
  const raw = base32Encode(bytes);
  return formatWithDashes(raw);
}

function base32Encode(bytes: Buffer): string {
  let result = "";
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

function formatWithDashes(raw: string): string {
  const chunks: string[] = [];
  for (let i = 0; i < raw.length; i += 4) {
    chunks.push(raw.slice(i, i + 4));
  }
  return chunks.join("-");
}
