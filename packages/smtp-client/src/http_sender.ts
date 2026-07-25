/**
 * HTTPSender — delivers messages to HTTP endpoints instead of via SMTP.
 *
 * Port of the Ruby `HTTPSender` class at app/senders/http_sender.rb.
 * Uses `fetch()` with HMAC-SHA256 request signing when a signing key is
 * configured, and classifies responses with the same logic as the Ruby
 * implementation.
 */
import type { HttpEndpoint } from '@posta/core';

// ─── Types ─────────────────────────────────────────────────────────────

export interface HttpDeliveryResult {
  success: boolean;
  classification: 'Sent' | 'SoftFail' | 'HardFail';
  statusCode: number;
  details: string;
  output?: string;
  time: number;
  secure: boolean;
  retry: boolean;
  suppressBounce: boolean;
  connectError: boolean;
}

export interface HttpAttachment {
  filename: string;
  mime_type?: string;
  content_type?: string;
  size?: number;
  body: { toString(): string } | string;
}

export interface HttpMessage {
  id: number;
  rcpt_to: string;
  mail_from: string;
  token: string;
  subject: string;
  message_id: string;
  timestamp: number;
  size: string;
  spam_status?: string;
  bounce: boolean;
  received_with_ssl: boolean;
  headers?: Record<string, string[]>;
  plain_body?: string;
  html_body?: string;
  raw_message?: string;
  attachments?: HttpAttachment[];
}

/**
 * Options passed to the HttpSender constructor.
 */
export interface HttpSenderOptions {
  /** HMAC-SHA256 shared secret for request signing. */
  signingKey?: string;
}

// ─── Reply Separator ───────────────────────────────────────────────────

/**
 * Reply-separator patterns ported from the Ruby `ReplySeparator` class
 * at app/lib/reply_separator.rb.
 *
 * Matches common email reply markers (fwd, quoted text, "On ... wrote",
 * signature separators, etc.) and strips them from the plain-text body.
 */
const REPLY_SEPARATOR_RULES: RegExp[] = [
  /^-{2,10} $.*/gm,
  /^>*\s*----- ?Original Message ?-----.*/gm,
  /^>*\s*From:[^\r\n]*[\r\n]+Sent:.*/gm,
  /^>*\s*From:[^\r\n]*[\r\n]+Date:.*/gm,
  /^>*\s*-----Urspr.ngliche Nachricht----- .*/gm,
  /^>*\s*Le[^\r\n]{10,200}a .crit ?:\s*$.*/gm,
  /^>*\s*__________________.*/gm,
  /^>*\s*On.{10,200}wrote:\s*$.*/gm,
  /^>*\s*Sent from my.*/gm,
  /^>*\s*=== Please reply above this line ===.*/gm,
  /(^>.*\n?){10,}/gm,
];

/**
 * Separate reply text from a plain-text email body.
 * Returns [cleanedBody, strippedReplies].
 *
 * Mirrors `ReplySeparator.separate(text)` in Ruby.
 */
export function separateReplies(text: string): [string, string | null] {
  if (!text || typeof text !== 'string') return ['', null];

  // Normalise line-endings
  text = text.replace(/\r/g, '');

  const strippedParts: string[] = [];

  for (const rule of REPLY_SEPARATOR_RULES) {
    text = text.replace(rule, (match) => {
      strippedParts.unshift(match + '\n');
      return '';
    });
  }

  const stripped = strippedParts.join('').trim();
  return [text.trim(), stripped || null];
}

// ─── HMAC Signing ──────────────────────────────────────────────────────

/**
 * Sign the request body with HMAC-SHA256 and return a Base64-encoded
 * signature string suitable for the `X-Posta-Signature` header.
 */
async function hmacSign(body: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const bodyData = encoder.encode(body);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, bodyData);

  // Convert ArrayBuffer to Base64 string
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ─── Base64 Helpers ────────────────────────────────────────────────────

/**
 * Base64-encode a string (UTF-8 safe via Buffer).
 */
function base64Encode(data: string): string {
  return Buffer.from(data).toString('base64');
}

// ─── Log ID ────────────────────────────────────────────────────────────

/**
 * Generate an 8-character uppercase alphanumeric log ID.
 * Mirrors `SecureRandom.alphanumeric(8).upcase` from Ruby.
 */
function generateLogId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// ─── Form Body Builder ─────────────────────────────────────────────────

/**
 * Build a `application/x-www-form-urlencoded` body from a flat
 * key-value record.  Keys may contain bracket notation (e.g.
 * `attachments[0][filename]`) and are URL-encoded via `URLSearchParams`.
 */
function buildFormBody(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      sp.append(key, String(value));
    }
  }
  return sp.toString();
}

// ─── Parameter Builder ─────────────────────────────────────────────────

type FlatParams = Record<string, unknown>;

/**
 * Build the request parameters hash that is POSTed to the HTTP endpoint.
 *
 * @param message  The email message being delivered.
 * @param endpoint The HTTP endpoint configuration.
 * @param flat     When `true` (FormData encoding), attachment fields are
 *                 flattened with bracket notation; otherwise they are nested.
 */
function buildParameters(
  message: HttpMessage,
  endpoint: HttpEndpoint,
  flat: boolean,
): FlatParams {
  const format = endpoint.format ?? '';
  const stripReplies = endpoint.strip_replies ?? false;
  const includeAttachments = endpoint.include_attachments ?? true;

  switch (format) {
    case 'Hash': {
      const hash: FlatParams = {
        id: message.id,
        rcpt_to: message.rcpt_to,
        mail_from: message.mail_from,
        token: message.token,
        subject: message.subject,
        message_id: message.message_id,
        timestamp: message.timestamp,
        size: message.size,
        spam_status: message.spam_status ?? null,
        bounce: message.bounce,
        received_with_ssl: message.received_with_ssl,
        to: message.headers?.['to']?.at(-1) ?? null,
        cc: message.headers?.['cc']?.at(-1) ?? null,
        from: message.headers?.['from']?.at(-1) ?? null,
        date: message.headers?.['date']?.at(-1) ?? null,
        in_reply_to: message.headers?.['in-reply-to']?.at(-1) ?? null,
        references: message.headers?.['references']?.at(-1) ?? null,
        html_body: message.html_body ?? null,
        attachment_quantity: message.attachments?.length ?? 0,
        auto_submitted: message.headers?.['auto-submitted']?.at(-1) ?? null,
        reply_to: message.headers?.['reply-to'] ?? null,
      };

      // Handle reply stripping
      if (stripReplies && message.plain_body) {
        const [plainBody, replies] = separateReplies(message.plain_body);
        hash['plain_body'] = plainBody;
        hash['replies_from_plain_body'] = replies;
      } else {
        hash['plain_body'] = message.plain_body ?? null;
      }

      // Attachments
      if (includeAttachments && message.attachments?.length) {
        if (flat) {
          message.attachments.forEach((a, i) => {
            const bodyStr = typeof a.body === 'string' ? a.body : a.body.toString();
            hash[`attachments[${i}][filename]`] = a.filename;
            hash[`attachments[${i}][content_type]`] = a.content_type ?? a.mime_type ?? 'application/octet-stream';
            hash[`attachments[${i}][size]`] = String(bodyStr.length);
            hash[`attachments[${i}][data]`] = base64Encode(bodyStr);
          });
        } else {
          hash['attachments'] = message.attachments.map((a) => {
            const bodyStr = typeof a.body === 'string' ? a.body : a.body.toString();
            return {
              filename: a.filename,
              content_type: a.content_type ?? a.mime_type ?? 'application/octet-stream',
              size: bodyStr.length,
              data: base64Encode(bodyStr),
            };
          });
        }
      }

      return hash;
    }

    case 'RawMessage': {
      return {
        id: message.id,
        rcpt_to: message.rcpt_to,
        mail_from: message.mail_from,
        message: base64Encode(message.raw_message ?? ''),
        base64: true,
        size: parseInt(message.size, 10) || 0,
      };
    }

    default:
      return {};
  }
}

// ─── Response Classification ───────────────────────────────────────────

/**
 * Classify an HTTP response into a delivery result.
 *
 * Mirrors the classification logic in Ruby `HTTPSender#send_message`:
 *  - 2xx       → Sent
 *  - 5xx       → SoftFail (retryable)
 *  - 429       → HardFail (suppress bounce)
 *  - Other     → HardFail
 */
function classifyResponse(
  status: number,
  bodyText: string,
  secure: boolean,
  startTime: number,
  url: string,
): HttpDeliveryResult {
  const output = bodyText.substring(0, 500).trim() || undefined;
  const details = `Received a ${status} from ${url}`;

  if (status >= 200 && status < 300) {
    return {
      success: true,
      classification: 'Sent',
      statusCode: status,
      details,
      output,
      time: parseFloat(((Date.now() - startTime) / 1000).toFixed(2)),
      secure,
      retry: false,
      suppressBounce: false,
      connectError: false,
    };
  }

  if (status >= 500 && status < 600) {
    return {
      success: false,
      classification: 'SoftFail',
      statusCode: status,
      details,
      output,
      time: parseFloat(((Date.now() - startTime) / 1000).toFixed(2)),
      secure,
      retry: true,
      suppressBounce: false,
      connectError: false,
    };
  }

  if (status === 429) {
    return {
      success: false,
      classification: 'HardFail',
      statusCode: status,
      details,
      output,
      time: parseFloat(((Date.now() - startTime) / 1000).toFixed(2)),
      secure,
      retry: false,
      suppressBounce: true,
      connectError: false,
    };
  }

  // Other status codes are permanent failures
  return {
    success: false,
    classification: 'HardFail',
    statusCode: status,
    details,
    output,
    time: parseFloat(((Date.now() - startTime) / 1000).toFixed(2)),
    secure,
    retry: false,
    suppressBounce: false,
    connectError: false,
  };
}

/**
 * Classify a connection/transport-level error.
 *
 * Negative status codes mirror the Ruby `Posta::HTTP` convention:
 *  -1 = timeout,  -2 = generic connection,  -3 = SSL
 */
function classifyError(
  error: Error | any,
  secure: boolean,
  startTime: number,
  url: string,
  timeoutMs: number,
): HttpDeliveryResult {
  let statusCode: number;
  let output: string | undefined;

  if (error?.name === 'AbortError' || error?.message?.includes('timed out') || error?.message?.includes('aborted')) {
    statusCode = -1;
    output = `Timed out after ${timeoutMs / 1000}s`;
  } else if (error?.message?.includes('SSL') || error?.message?.includes('certificate')) {
    statusCode = -3;
    output = 'Invalid SSL certificate';
  } else {
    statusCode = -2;
    output = error?.message ?? String(error);
  }

  return {
    success: false,
    classification: 'SoftFail',
    statusCode,
    details: `Error connecting to ${url}`,
    output: output?.substring(0, 500),
    time: parseFloat(((Date.now() - startTime) / 1000).toFixed(2)),
    secure,
    retry: true,
    suppressBounce: false,
    connectError: true,
  };
}

// ─── HttpSender Class ──────────────────────────────────────────────────

export class HttpSender {
  private endpoint: HttpEndpoint;
  private logId: string;
  private signingKey?: string;

  /**
   * @param endpoint  The HTTP endpoint configuration (from the database).
   * @param options   Optional signing key and other settings.
   */
  constructor(endpoint: HttpEndpoint, options?: HttpSenderOptions) {
    this.endpoint = endpoint;
    this.logId = generateLogId();
    this.signingKey = options?.signingKey;

    this.log(`Initialised HTTP sender for ${endpoint.url ?? '(no url)'}`);
  }

  /**
   * Deliver a message to the configured HTTP endpoint.
   *
   * Builds parameters from the message according to the endpoint's format
   * and encoding, POSTs them via `fetch()`, and classifies the response.
   */
  async sendMessage(message: HttpMessage): Promise<HttpDeliveryResult> {
    const startTime = Date.now();
    const url = this.endpoint.url;

    if (!url) {
      return {
        success: false,
        classification: 'HardFail',
        statusCode: 0,
        details: 'No URL configured for HTTP endpoint',
        time: 0,
        secure: false,
        retry: false,
        suppressBounce: false,
        connectError: false,
      };
    }

    const timeout = (this.endpoint.timeout ?? 5) * 1000;
    const uri = new URL(url);
    const secure = uri.protocol === 'https:';

    // 1. Build request parameters
    const flat = this.endpoint.encoding === 'FormData';
    const params = buildParameters(message, this.endpoint, flat);

    // 2. Build body and Content-Type based on encoding
    let body: string;
    let contentType: string;

    if (this.endpoint.encoding === 'BodyAsJSON') {
      body = JSON.stringify(params);
      contentType = 'application/json';
    } else if (this.endpoint.encoding === 'FormData') {
      body = buildFormBody(params);
      contentType = 'application/x-www-form-urlencoded';
    } else {
      // Default: POST with JSON body
      body = JSON.stringify(params);
      contentType = 'application/json';
    }

    // 3. Build headers
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'User-Agent': 'Posta/4.0',
    };

    // 4. Sign the request if a signing key is configured
    if (this.signingKey) {
      headers['X-Posta-Signature'] = await hmacSign(body, this.signingKey);
    }

    // 5. POST with timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    this.log(`Sending request to ${url}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const responseBody = await response.text();

      this.log(`  -> Received: ${response.status}`);
      if (responseBody) {
        this.log(`  -> Body: ${responseBody.substring(0, 255)}`);
      }

      return classifyResponse(response.status, responseBody, secure, startTime, url);
    } catch (err: any) {
      clearTimeout(timer);
      this.log(`  -> Error: ${err?.message ?? String(err)}`);
      return classifyError(err, secure, startTime, url, timeout);
    }
  }

  // ─── Logging ──────────────────────────────────────────────────────────

  /**
   * Emit a log line. Mirrors `Posta.logger.info` in the Ruby version.
   */
  private log(text: string): void {
    console.log(`[http-sender:${this.logId}] ${text}`);
  }
}
