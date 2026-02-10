/**
 * HTTP client interface for VaultClient
 * Follows Dependency Inversion Principle
 */

/**
 * HTTP client interface
 * Abstracts fetch API for testing and alternative implementations
 */
export interface IHttpClient {
  /**
   * Make an HTTP request
   * @param url Full URL or path (will be prefixed with serverUrl if path)
   * @param options Fetch options
   * @returns Response
   */
  fetch(url: string, options?: RequestInit): Promise<Response>;
}

/**
 * Default fetch-based HTTP client
 */
export class FetchHttpClient implements IHttpClient {
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    return fetch(url, options);
  }
}
