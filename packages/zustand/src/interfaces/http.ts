/**
 * HTTP client interface for sync engine
 * Follows Dependency Inversion Principle - allows mocking and alternative implementations
 */

/** HTTP request options */
export interface IHttpRequest {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
}

/** HTTP response */
export interface IHttpResponse {
  ok: boolean;
  status: number;
  json<T = unknown>(): Promise<T>;
  text(): Promise<string>;
}

/** HTTP client interface */
export interface IHttpClient {
  /**
   * Make an HTTP request
   * @param request Request options
   * @returns Response
   */
  request(request: IHttpRequest): Promise<IHttpResponse>;
}
