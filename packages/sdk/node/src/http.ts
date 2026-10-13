import { type ErrorResponse, type Result, toErrorResponse } from "./error.js";
import type { BatchValidation } from "./types.js";

const DEFAULT_BASE_URL = "https://api.millionsend.com";
const DEFAULT_TIMEOUT_MS = 30_000;
const SDK_VERSION = "0.8.0";

export interface MillionSendOptions {
  /**
   * Your MillionSend instance URL (no trailing slash needed). Falls back to
   * `MILLIONSEND_BASE_URL`, then MillionSend Cloud (`https://api.millionsend.com`).
   * Self-hosted instances set their own origin here.
   */
  baseUrl?: string;
  /** Inject a fetch implementation (tests, proxies, custom agents). */
  fetch?: typeof fetch;
  /** Extra User-Agent suffix appended after the SDK's own token. */
  userAgent?: string;
  /** Request deadline in milliseconds. Defaults to 30 seconds. */
  timeoutMs?: number;
  /**
   * Plain `http://` is only accepted for loopback hosts, since the API key
   * travels as a bearer header. Set to `true` to talk to a non-TLS instance
   * elsewhere (e.g. inside a private network).
   */
  allowInsecureHttp?: boolean;
}

export interface RequestOptions {
  /** POST-only idempotency key (emails.send, batch.send). */
  idempotencyKey?: string;
}

export interface BatchRequestOptions extends RequestOptions {
  /**
   * `x-batch-validation`: `strict` (the API default) rejects the whole batch
   * when one item is invalid; `permissive` writes the valid subset and lists
   * the failed items in the response's `errors`.
   */
  batchValidation?: BatchValidation;
}

interface DoRequest {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  query?: Record<string, string | number | undefined> | undefined;
  idempotencyKey?: string | undefined;
  /** Extra request headers; undefined values are skipped. */
  headers?: Record<string, string | undefined> | undefined;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True for an `http://` URL whose host is not loopback. Unparseable URLs are left to fetch. */
function isInsecureHttpUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:") return false;
  return !LOOPBACK_HOSTS.has(parsed.hostname) && !parsed.hostname.startsWith("127.");
}

function queryString(query: Record<string, string | number | undefined> | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export class HttpClient {
  readonly #apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(apiKey: string, options: MillionSendOptions = {}) {
    this.#apiKey = apiKey;
    this.baseUrl = (
      options.baseUrl ??
      process.env.MILLIONSEND_BASE_URL ??
      DEFAULT_BASE_URL
    ).replace(/\/+$/, "");
    if (!options.allowInsecureHttp && isInsecureHttpUrl(this.baseUrl)) {
      throw new Error(
        `Refusing to send the API key over plain http to ${this.baseUrl}. Use https, or set allowInsecureHttp: true.`,
      );
    }
    // Bind so a passed-in fetch keeps its own `this`; default to the global.
    const chosen = options.fetch ?? globalThis.fetch;
    if (!chosen) {
      throw new Error(
        "No fetch implementation found. Use Node 18+ or pass `fetch` in the client options.",
      );
    }
    this.fetchImpl = chosen;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error("timeoutMs must be a positive finite number.");
    }
    const base = `millionsend-node/${SDK_VERSION}`;
    this.userAgent = options.userAgent ? `${base} ${options.userAgent}` : base;
  }

  async request<T>({
    method,
    path,
    body,
    query,
    idempotencyKey,
    headers: extraHeaders,
  }: DoRequest): Promise<Result<T>> {
    const url = `${this.baseUrl}${path}${queryString(query)}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#apiKey}`,
      Accept: "application/json",
      "User-Agent": this.userAgent,
    };
    for (const [key, value] of Object.entries(extraHeaders ?? {})) {
      if (value !== undefined) headers[key] = value;
    }
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(this.timeoutMs) };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    // Idempotency is POST-only on the wire; sending it elsewhere is a no-op.
    if (idempotencyKey && method === "POST") headers["Idempotency-Key"] = idempotencyKey;

    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (cause) {
      const error: ErrorResponse = {
        name: "application_error",
        message: cause instanceof Error ? cause.message : String(cause),
        statusCode: null,
      };
      return { data: null, error };
    }

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) {
      return { data: null, error: toErrorResponse(parsed, response.status) };
    }
    return { data: parsed as T, error: null };
  }
}
