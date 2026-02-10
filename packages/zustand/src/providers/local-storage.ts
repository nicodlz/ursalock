/**
 * LocalStorage implementation of IStorageProvider
 * Concrete implementation following Dependency Inversion Principle
 */

import type { IStorageProvider } from "../interfaces/storage.js";

/**
 * LocalStorage provider with async interface
 * Wraps synchronous localStorage with async API for consistency
 */
export class LocalStorageProvider implements IStorageProvider {
  async getItem(key: string): Promise<string | null> {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    if (typeof window === "undefined") return;
    localStorage.removeItem(key);
  }
}
