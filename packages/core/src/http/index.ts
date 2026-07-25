import net from 'node:net';
import { IPAddressGuard } from './address_guard';
import type { PostaConfig } from '../config/index';

/**
 * Result of an HTTP request.
 */
export interface HttpResponse {
  code: number;
  body: string;
  headers: Record<string, string[]>;
  secure: boolean;
}

/**
 * Options for outbound HTTP requests.
 */
export interface HttpRequestOptions {
  headers?: Record<string, string>;
  username?: string;
  password?: string;
  json?: string;
  text_body?: string;
  sign?: boolean;
  user_agent?: string;
  timeout?: number;
  signingKey?: string; // RSA private key for signing
}

/**
 * HTTP client with SSRF protection.
 *
 * Mirrors the Ruby Posta::HTTP class at lib/posta/http.rb.
 * Uses address guard to prevent SSRF and DNS rebinding attacks.
 */
export class HttpClient {
  private config: PostaConfig;

  constructor(config: PostaConfig) {
    this.config = config;
  }

  /**
   * Perform a GET request.
   */
  async get(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    return this.request('GET', url, options);
  }

  /**
   * Perform a POST request.
   */
  async post(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    return this.request('POST', url, options);
  }

  /**
   * Perform an HTTP request with SSRF protection.
   */
  async request(
    method: string,
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse> {
    const uri = new URL(url);
    const timeout = options.timeout ?? 60;

    try {
      // Resolve + validate destination address (SSRF protection)
      const guard = new IPAddressGuard(
        uri.hostname,
        this.config.posta.allowed_request_destinations,
      );
      const connectAddress = guard.getSafeConnectAddress();

      // Build the request
      const headers: Record<string, string> = {
        'User-Agent': options.user_agent ?? `Posta/4.0`,
        ...options.headers,
      };

      if (options.username || uri.username) {
        const auth = Buffer.from(
          `${options.username || uri.username}:${options.password || uri.password}`,
        ).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }

      let body: string | undefined;
      let contentType: string | undefined;

      if (options.json !== undefined) {
        body = options.json;
        contentType = 'application/json';
      } else if (options.text_body !== undefined) {
        body = options.text_body;
      }

      if (contentType && !headers['Content-Type']) {
        headers['Content-Type'] = contentType;
      }

      // Sign the request if requested
      if (options.sign && options.signingKey) {
        const { Signer } = await import('../crypto/signer');
        const signer = new Signer(options.signingKey);
        const jwk = await signer.getJwk();
        headers['X-Posta-Signature-KID'] = jwk.kid!;
        headers['X-Posta-Signature'] = await signer.sha1Sign64(body ?? '');
        headers['X-Posta-Signature-256'] = await signer.sign64(body ?? '');
      }

      // The connection is pinned to the validated IP address to prevent
      // DNS rebinding attacks between validation and connection.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout * 1000);

      const fetchUrl = `${uri.protocol}//${connectAddress}${uri.pathname}${uri.search}`;

      const response = await fetch(fetchUrl, {
        method,
        headers,
        body: body ?? undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);

      return {
        code: response.status,
        body: await response.text(),
        headers: Object.fromEntries(response.headers.entries()) as any,
        secure: uri.protocol === 'https:',
      };
    } catch (error: any) {
      if (error instanceof BlockedDestinationError) {
        return { code: -4, body: error.message, headers: {}, secure: uri.protocol === 'https:' };
      }
      if (error?.message?.includes('certificate') || error?.message?.includes('SSL')) {
        return { code: -3, body: 'Invalid SSL certificate', headers: {}, secure: uri.protocol === 'https:' };
      }
      if (error?.name === 'AbortError') {
        return { code: -1, body: `Timed out after ${timeout}s`, headers: {}, secure: uri.protocol === 'https:' };
      }
      return { code: -2, body: error?.message ?? String(error), headers: {}, secure: uri.protocol === 'https:' };
    }
  }
}

export class BlockedDestinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedDestinationError';
  }
}
