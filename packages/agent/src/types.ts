/**
 * Re-export base64 utilities from @ursalock/crypto
 * 
 * Agents receive encryption keys as base64 strings (for easy serialization)
 * and need to convert them to Uint8Array for crypto operations.
 */
export { base64ToBytes, bytesToBase64 } from "@ursalock/crypto";
