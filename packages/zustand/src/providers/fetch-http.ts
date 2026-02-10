/**
 * Fetch-based HTTP client implementation
 * Concrete implementation of IHttpClient using browser fetch API
 */

import type { IHttpClient, IHttpRequest, IHttpResponse } from "../interfaces/http.js";

/**
 * HTTP client using native fetch API
 */
export class FetchHttpClient implements IHttpClient {
  async request(request: IHttpRequest): Promise<IHttpResponse> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    return {
      ok: response.ok,
      status: response.status,
      json: () => response.json(),
      text: () => response.text(),
    };
  }
}
