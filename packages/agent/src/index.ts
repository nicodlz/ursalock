/**
 * @ursalock/agent
 * Headless Node.js SDK for AI agents to read/write encrypted documents
 * 
 * This is a thin wrapper around @ursalock/client that provides:
 * - Base64 key handling (agents receive keys as strings)
 * - API key authentication
 * - Clean, self-documenting interface for agent use
 * 
 * All encryption/decryption logic is delegated to @ursalock/client and @ursalock/crypto.
 * No crypto logic is duplicated.
 */

// Main exports
export { AgentVault, createAgentVaultFromMasterKey, type AgentVaultOptions } from "./agent-vault.js";
export { base64ToBytes, bytesToBase64 } from "./types.js";

// Re-export types from client for convenience
export type { Document, ListOptions, SyncResult } from "@ursalock/client";
export type { Collection } from "@ursalock/client";
