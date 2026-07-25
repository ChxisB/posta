/**
 * SpamAssassin spam inspection via the SPAMC/1.2 protocol.
 *
 * Port of lib/posta/message_inspectors/spam_assassin.rb
 * Connects to a spamd daemon via TCP, sends the raw message using
 * the REPORT command, and parses the response for spam check symbols.
 */

import net from 'node:net';

export interface SpamAssassinConfig {
  host: string;
  port: number;
}

export interface SpamAssassinCheck {
  name: string;
  score: number;
  description: string;
}

export interface SpamAssassinResult {
  spam: boolean;
  score: number;
  threshold: number;
  checks: SpamAssassinCheck[];
  error?: string;
}

/**
 * Regex patterns to exclude from outgoing message spam checks.
 *
 * These rules are commonly triggered by the sending infrastructure itself
 * (e.g. missing Received headers, HELO mismatches) and are not indicative
 * of actual spam when scanning outbound mail.
 *
 * Mirrors the EXCLUSIONS hash in the Ruby implementation.
 */
const OUTGOING_EXCLUSIONS: Array<string | RegExp> = [
  'NO_RECEIVED',
  'NO_RELAYS',
  'ALL_TRUSTED',
  'FREEMAIL_FORGED_REPLYTO',
  'RDNS_DYNAMIC',
  'CK_HELO_GENERIC',
  /^SPF_/,
  /^HELO_/,
  /DKIM_/,
  /^RCVD_IN_/,
];

/**
 * Check whether a spam check code should be excluded for the given scope.
 */
function isExcluded(code: string, scope: 'incoming' | 'outgoing'): boolean {
  if (scope === 'incoming') return false;

  for (const pattern of OUTGOING_EXCLUSIONS) {
    if (typeof pattern === 'string') {
      if (code === pattern) return true;
    } else {
      if (pattern.test(code)) return true;
    }
  }
  return false;
}

/**
 * Inspect a raw email message with SpamAssassin via the SPAMC/1.2 protocol.
 *
 * Protocol flow:
 * 1. Connect to spamd daemon via TCP
 * 2. Send: `REPORT SPAMC/1.2\r\nContent-length: N\r\n\r\n{raw_message}`
 * 3. Receive response with headers and a report body
 * 4. Parse the `Spam:` header for true/false, score, and threshold
 * 5. Parse symbol lines from the report body
 *
 * @param config     - SpamAssassin daemon connection details
 * @param rawMessage - Complete raw email (headers + body)
 * @param scope      - 'incoming' or 'outgoing' (affects exclusion filtering)
 * @param timeout    - Timeout in milliseconds (default 15s, matching Ruby)
 */
export async function checkWithSpamAssassin(
  config: SpamAssassinConfig,
  rawMessage: string,
  scope: 'incoming' | 'outgoing' = 'incoming',
  timeout?: number,
): Promise<SpamAssassinResult> {
  const timeoutMs = timeout ?? 15_000;

  try {
    const data = await connectAndReport(config, rawMessage, timeoutMs);
    return parseResponse(data, scope);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'timeout') {
      return {
        spam: false,
        score: 0,
        threshold: 0,
        checks: [{ name: 'TIMEOUT', score: 0, description: 'Timed out when scanning for spam' }],
        error: 'Timed out when scanning for spam',
      };
    }
    return {
      spam: false,
      score: 0,
      threshold: 0,
      checks: [{ name: 'ERROR', score: 0, description: 'Error when scanning for spam' }],
      error: 'Error when scanning for spam',
    };
  }
}

/**
 * Parse the SPAMC/1.2 REPORT response.
 *
 * Response format:
 * ```
 * SPAMC/1.2 200 OK
 * Spam: True ; 12.5 / 5.0
 * ...other headers...
 *
 * --- separator line ---
 * pts rule name              description
 * ---- --------------------- --------------------------------------------------
 *  2.5 HEADER_FROM_DIFFERENT ...
 *  1.0 MISSING_SUBJECT       ...
 * ```
 */
function parseResponse(data: string, scope: 'incoming' | 'outgoing'): SpamAssassinResult {
  // Split headers from body at the first blank line
  const headerBodySplit = data.split(/\r?\n\r?\n/);
  const headerSection = headerBodySplit[0] ?? '';
  const bodySection = headerBodySplit.slice(1).join('\n\n');

  // Parse the Spam: header
  let spam = false;
  let score = 0;
  let threshold = 0;

  const spamHeaderMatch = headerSection.match(
    /^Spam:\s*(True|False)\s*;\s*([\d.]+)\s*\/\s*([\d.]+)/im,
  );
  if (spamHeaderMatch) {
    spam = spamHeaderMatch[1].toLowerCase() === 'true';
    score = parseFloat(spamHeaderMatch[2]);
    threshold = parseFloat(spamHeaderMatch[3]);
  }

  // Parse the report body for individual checks.
  // The report body comes after a separator line like "--- ... ---"
  // Each check line looks like: " 2.5 RULE_NAME  Description text here"
  // Continuation lines (no leading score) append to the previous check.
  const checks: SpamAssassinCheck[] = [];

  // Split on the separator line (--- ... ---)
  const separatorSplit = bodySection.split(/^---.*\r?\n/m);
  const rulesText = separatorSplit.length > 1 ? separatorSplit[separatorSplit.length - 1] : bodySection;
  const lines = rulesText.split(/\r?\n/);

  for (const line of lines) {
    // Match a rule line: optional leading space/dash, score, rule name, description
    const ruleMatch = line.match(/^\s*([- ]?[\d.]+)\s+(\w+)\s+(.*)/);
    if (ruleMatch) {
      const ruleScore = parseFloat(ruleMatch[1].replace(/\s/g, ''));
      checks.push({
        name: ruleMatch[2],
        score: ruleScore,
        description: ruleMatch[3].trim(),
      });
    } else if (checks.length > 0 && line.trim().length > 0) {
      // Continuation line — append to the last check's description
      checks[checks.length - 1].description += ' ' + line.trim();
    }
  }

  // Apply scope-based exclusions
  const filteredChecks = checks.filter((check) => !isExcluded(check.name, scope));

  return {
    spam,
    score,
    threshold,
    checks: filteredChecks,
  };
}

/**
 * Connect to spamd, send the REPORT command, and read the response.
 *
 * Uses the SPAMC/1.2 protocol:
 * - Send: `REPORT SPAMC/1.2\r\nContent-length: N\r\n\r\n{raw_message}`
 * - Half-close the write side after sending
 * - Read the full response until the server closes the connection
 */
function connectAndReport(
  config: SpamAssassinConfig,
  rawMessage: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection(config.port, config.host);
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      socket.destroy();
      reject(new Error('timeout'));
    }, timeoutMs);

    const chunks: Buffer[] = [];

    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    socket.on('close', () => {
      if (!timedOut) {
        clearTimeout(timer);
        const result = Buffer.concat(chunks).toString();
        resolve(result);
      }
    });

    socket.on('error', (err: Error) => {
      if (!timedOut) {
        clearTimeout(timer);
        reject(err);
      }
    });

    socket.on('connect', () => {
      socket.setNoDelay(true);

      // Send the SPAMC/1.2 REPORT command.
      // We do NOT call socket.end() here — in Bun, end() or shutdown() on
      // the client may close the read side before the server's response
      // arrives. Instead we let the server-side timeout or the DNS resolver
      // timeout handle the close. The server will write its response and
      // then close the connection, which triggers our close handler.
      const messageBuffer = Buffer.from(rawMessage);
      socket.write('REPORT SPAMC/1.2\r\n');
      socket.write(`Content-length: ${messageBuffer.length}\r\n`);
      socket.write('\r\n');
      socket.write(messageBuffer);
    });
  });
}
