/**
 * Storage interfaces for vault middleware
 * Follows Dependency Inversion Principle - depend on abstractions not concretions
 */

/**
 * Base storage provider interface
 * Abstracts away the underlying storage mechanism (localStorage, AsyncStorage, etc.)
 */
export interface IStorageProvider {
  /** Get item from storage */
  getItem(key: string): Promise<string | null>;
  /** Set item in storage */
  setItem(key: string, value: string): Promise<void>;
  /** Remove item from storage */
  removeItem(key: string): Promise<void>;
}

/**
 * Encrypted vault storage interface
 * Higher-level abstraction that handles encryption/decryption
 */
export interface IVaultStorage {
  /** Get decrypted state from storage */
  getItem(name: string): Promise<string | null>;
  /** Set encrypted state in storage */
  setItem(name: string, value: string): Promise<void>;
  /** Remove state from storage */
  removeItem(name: string): Promise<void>;
}
