/**
 * Rspamd spam inspection.
 *
 * Port of lib/posta/message_inspectors/rspamd.rb
 * Sends a raw message to an Rspamd daemon over HTTP and parses
 * the JSON response to extract spam check symbols.
 */

export interface SpamCheck {
  name: string;
  score: number;
  description: string;
}

export interface RspamdConfig {
  host: string;
  port: number;
  ssl?: boolean;
  password?: string;
  flags?: string;
}

/**
 * Check a raw email message with Rspamd.
 *
 * POSTs the raw message to the Rspamd /checkv2 endpoint and
 * returns any spam symbols found.
 *
 * @param config  - Rspamd daemon connection details
 * @param rawMessage - Complete raw email (headers + body)
 * @param scope   - 'incoming' or 'outgoing'
 * @param rcptTo  - Envelope recipient
 * @param mailFrom - Envelope sender
 * @param token   - Queue identifier (used as Queue-Id header)
 */
export async function checkWithRspamd(
  config: RspamdConfig,
  rawMessage: string,
  scope: 'incoming' | 'outgoing',
  rcptTo: string,
  mailFrom: string,
  token: string,
): Promise<{ checks: SpamCheck[]; error?: string }> {
  const protocol = config.ssl ? 'https' : 'http';
  const url = `${protocol}://${config.host}:${config.port}/checkv2`;

  const headers: Record<string, string> = {
    'Content-Length': String(Buffer.byteLength(rawMessage)),
    'User-Agent': 'Posta',
    'Deliver-To': rcptTo,
    'From': mailFrom,
    'Rcpt': rcptTo,
    'Queue-Id': token,
  };

  if (config.password) {
    headers['Password'] = config.password;
  }
  if (config.flags) {
    headers['Flags'] = config.flags;
  }

  // For outgoing messages, clear the User and Ip headers so Rspamd
  // treats this as an outbound email and disables certain checks.
  // https://rspamd.com/doc/tutorials/scanning_outbound.html
  if (scope === 'outgoing') {
    headers['User'] = '';
    headers['Ip'] = '';
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: rawMessage,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return {
        checks: [],
        error: `Error when scanning with rspamd (got ${response.status})`,
      };
    }

    const text = await response.text();
    let body: { symbols?: Record<string, unknown> };
    try {
      body = JSON.parse(text);
    } catch {
      return { checks: [], error: `Error when scanning with rspamd (invalid JSON response)` };
    }
    const symbols = body?.symbols;

    if (!symbols || typeof symbols !== 'object') {
      return { checks: [] };
    }

    const checks: SpamCheck[] = [];
    for (const [, symbol] of Object.entries(symbols)) {
      const s = symbol as Record<string, unknown>;
      if (!s.description || String(s.description).trim() === '') {
        continue;
      }
      checks.push({
        name: String(s.name ?? ''),
        score: Number(s.score ?? 0),
        description: String(s.description),
      });
    }

    return { checks };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (err instanceof Error && err.name === 'AbortError') {
      return {
        checks: [],
        error: 'Error when scanning with rspamd (timeout)',
      };
    }

    return {
      checks: [],
      error: `Error when scanning with rspamd (${err instanceof Error ? err.constructor.name : 'Error'}: ${message})`,
    };
  }
}
