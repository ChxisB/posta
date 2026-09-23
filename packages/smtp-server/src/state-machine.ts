/**
 * SMTP state machine.
 *
 * States:
 *   preauth          — waiting for proxy protocol header
 *   welcome          — waiting for EHLO/HELO (first command)
 *   welcomed         — EHLO/HELO received
 *   mail_from_received — MAIL FROM received
 *   rcpt_to_received — RCPT TO received (one or more)
 *   data_receiving   — receiving message body via DATA
 */

export type SmtpState =
  | 'preauth'
  | 'welcome'
  | 'welcomed'
  | 'mail_from_received'
  | 'rcpt_to_received'
  | 'data_receiving'
  | 'finished';

export type RecipientType = 'credential' | 'bounce' | 'route';

export interface Recipient {
  type: RecipientType;
  address: string;
  metadata: Record<string, unknown>;
}

/** One complete transaction: everything needed to store and queue it. */
export interface ReceivedMessage {
  mailFrom: string;
  recipients: Recipient[];
  /** The message as received, one character per byte. */
  data: string;
}

export interface SmtpCommandResult {
  /** Response lines to send back. */
  lines: string[];
  /** If true, the connection should be closed after sending. */
  finished?: boolean;
  /** If true, the socket should be upgraded to TLS. */
  startTls?: boolean;
  /**
   * A complete message. The server must store it before sending `lines`:
   * the 250 tells the client the message is ours, and it will not resend.
   */
  message?: ReceivedMessage;
  /** Logging control */
  silenceLogging?: boolean;
}

/**
 * SMTP client state machine.
 * Manages one SMTP session from connect to quit.
 */
export class SmtpStateMachine {
  /** Current state */
  state: SmtpState;
  /** The client's claimed hostname from EHLO/HELO */
  heloName: string | null;
  /** IP address of the connecting client */
  ipAddress: string | null;
  /** The MAIL FROM address */
  mailFrom: string | null;
  /** Accumulated RCPT TO recipients */
  recipients: Recipient[];
  /** Message data being received */
  messageData: string | null;
  /** Parsed headers during DATA phase */
  headers: Record<string, string[]>;
  /** Currently receiving headers vs body */
  receivingHeaders: boolean;
  /** Current header key being accumulated */
  currentHeaderKey: string | null;
  /** Whether TLS has been started */
  tlsStarted: boolean;
  /** Whether we're waiting for a password (for log redaction) */
  passwordExpected: boolean;
  /** Whether logging is enabled for this session */
  loggingEnabled: boolean;
  /** Server hostname for banners */
  serverHostname: string;
  /** Trace ID for logging correlation */
  traceId: string;
  /** Whether TLS is available */
  tlsAvailable: boolean;
  /** Max message size in bytes */
  maxMessageSize: number;
  /** The authenticated credential (set after AUTH success) */
  credential: any | null;
  /** Internal data handler for DATA mode */
  private _dataHandler: ((line: string) => SmtpCommandResult | null) | null;

  constructor(serverHostname: string, ipAddress: string | null, options?: {
    tlsAvailable?: boolean;
    maxMessageSize?: number;
    proxyProtocol?: boolean;
  }) {
    this.serverHostname = serverHostname;
    this.ipAddress = ipAddress;
    this.tlsAvailable = options?.tlsAvailable ?? false;
    this.maxMessageSize = (options?.maxMessageSize ?? 14) * 1024 * 1024;
    this.tlsStarted = false;
    this.loggingEnabled = true;
    this.passwordExpected = false;
    this.credential = null;
    this._dataHandler = null;
    this.traceId = generateTraceId();
    this.heloName = null;
    this.mailFrom = null;
    this.recipients = [];
    this.messageData = null;
    this.headers = {};
    this.receivingHeaders = false;
    this.currentHeaderKey = null;

    if (ipAddress) {
      this.state = 'welcome';
    } else {
      this.state = 'preauth';
    }
  }

  /**
   * Reset the current mail transaction (recipients, mail_from, data).
   */
  transactionReset(): void {
    this.recipients = [];
    this.mailFrom = null;
    this.messageData = null;
    this.headers = {};
    this.receivingHeaders = false;
    this.currentHeaderKey = null;
  }

  /**
   * Handle an incoming line from the client.
   * Returns the response lines, or null if nothing to send.
   */
  handleLine(line: string, crPresent: boolean, prevCrPresent: boolean): SmtpCommandResult | null {
    // Strip trailing CR (already done by the line buffer)

    if (this.state === 'preauth') {
      return this.handleProxy(line);
    }

    const sanitized = this.sanitizeForLog(line);

    // If we have a data handler active, route to it
    if (this._dataHandler) {
      return this._dataHandler(line);
    }

    // Mid-AUTH, the line is the client's answer to a 334 challenge
    if (this.authHandler) {
      return this.authHandler(line);
    }

    // Otherwise dispatch as a command
    return this.dispatch(line);
  }

  // ─── Command dispatch ────────────────────────────────

  private dispatch(line: string): SmtpCommandResult | null {
    const trimmed = line.trim();

    if (trimmed.match(/^QUIT/i)) return this.cmdQuit();
    if (trimmed.match(/^STARTTLS/i)) return this.cmdStartTls();
    if (trimmed.match(/^EHLO/i)) return this.cmdEhlo(trimmed);
    if (trimmed.match(/^HELO/i)) return this.cmdHelo(trimmed);
    if (trimmed.match(/^RSET/i)) return this.cmdRset();
    if (trimmed.match(/^NOOP/i)) return this.cmdNoop();
    if (trimmed.match(/^AUTH PLAIN/i)) return this.cmdAuthPlain(trimmed);
    if (trimmed.match(/^AUTH LOGIN/i)) return this.cmdAuthLogin(trimmed);
    if (trimmed.match(/^AUTH CRAM-MD5/i)) return this.cmdAuthCramMd5(trimmed);
    if (trimmed.match(/^MAIL FROM/i)) return this.cmdMailFrom(trimmed);
    if (trimmed.match(/^RCPT TO/i)) return this.cmdRcptTo(trimmed);
    if (trimmed.match(/^DATA/i)) return this.cmdData();

    return { lines: ['502 Invalid/unsupported command'] };
  }

  // ─── Protocol commands ───────────────────────────────

  private cmdQuit(): SmtpCommandResult {
    return { lines: ['221 Closing Connection'], finished: true };
  }

  private cmdStartTls(): SmtpCommandResult {
    if (this.tlsAvailable && !this.tlsStarted) {
      return { lines: ['220 Ready to start TLS'], startTls: true };
    }
    return { lines: ['502 TLS not available'] };
  }

  private cmdEhlo(line: string): SmtpCommandResult {
    this.heloName = line.split(' ').slice(1).join(' ') || null;
    this.transactionReset();
    this.state = 'welcomed';

    const capabilities = [
      '250-My capabilities are',
    ];
    if (this.tlsAvailable && !this.tlsStarted) {
      capabilities.push('250-STARTTLS');
    }
    capabilities.push('250-PIPELINING');
    capabilities.push('250-8BITMIME');
    capabilities.push('250 AUTH CRAM-MD5 PLAIN LOGIN');

    return { lines: capabilities };
  }

  private cmdHelo(line: string): SmtpCommandResult {
    this.heloName = line.split(' ').slice(1).join(' ') || null;
    this.transactionReset();
    this.state = 'welcomed';
    return { lines: [`250 ${this.serverHostname}`] };
  }

  private cmdRset(): SmtpCommandResult {
    this._dataHandler = null;
    this.transactionReset();
    this.state = 'welcomed';
    return { lines: ['250 OK'] };
  }

  private cmdNoop(): SmtpCommandResult {
    return { lines: ['250 OK'] };
  }

  // ─── Auth ────────────────────────────────────────────

  private authHandler: ((line: string) => SmtpCommandResult | null) | null = null;

  private cmdAuthPlain(line: string): SmtpCommandResult {
    this.passwordExpected = false;

    const remaining = line.replace(/^AUTH PLAIN\s*/i, '').trim();

    if (!remaining) {
      // Client will provide credentials on next line
      this.authHandler = (idata: string) => {
        this.authHandler = null;
        return this.authenticatePlain(idata);
      };
      return { lines: ['334'] };
    }

    return this.authenticatePlain(remaining);
  }

  private authenticatePlain(data: string): SmtpCommandResult {
    try {
      const decoded = Buffer.from(data, 'base64').toString('utf-8');
      const parts = decoded.split('\0');
      // PLAIN format: \0username\0password or username\0username\0password
      const password = parts[parts.length - 1];
      if (!password) {
        return { lines: ['535 Authenticated failed - protocol error'] };
      }
      return this.doAuth(password);
    } catch {
      return { lines: ['535 Authenticated failed - protocol error'] };
    }
  }

  private cmdAuthLogin(line: string): SmtpCommandResult {
    this.passwordExpected = false;

    const remaining = line.replace(/^AUTH LOGIN\s*/i, '').trim();

    if (!remaining) {
      // Ask for username first
      this.authHandler = (idata: string) => {
        // Got username, now ask for password
        this.authHandler = (pdata: string) => {
          this.authHandler = null;
          return this.authenticateLogin(pdata);
        };
        return { lines: ['334 UGFzc3dvcmQ6'] }; // "Password:"
      };
      return { lines: ['334 VXNlcm5hbWU6'] }; // "Username:"
    }

    // Got inline username, ask for password
    this.authHandler = (pdata: string) => {
      this.authHandler = null;
      return this.authenticateLogin(pdata);
    };
    return { lines: ['334 UGFzc3dvcmQ6'] };
  }

  private authenticateLogin(data: string): SmtpCommandResult {
    try {
      const password = Buffer.from(data, 'base64').toString('utf-8');
      return this.doAuth(password);
    } catch {
      return { lines: ['535 Authenticated failed - protocol error'] };
    }
  }

  private cmdAuthCramMd5(line: string): SmtpCommandResult {
    this.passwordExpected = false;

    const challenge = `<${generateRandomHex(20)}@${this.serverHostname}>`;
    const encodedChallenge = Buffer.from(challenge).toString('base64');

    this.authHandler = (idata: string) => {
      this.authHandler = null;
      return this.authenticateCramMd5(idata, challenge);
    };

    return { lines: [`334 ${encodedChallenge}`] };
  }

  private authenticateCramMd5(data: string, challenge: string): SmtpCommandResult {
    try {
      const decoded = Buffer.from(data, 'base64').toString('utf-8');
      const parts = decoded.split(' ').map((s) => s.trim());
      const username = parts[0] ?? '';
      const password = parts.slice(1).join(' ');
      if (!username || !password) {
        return { lines: ['535 Denied'] };
      }
      return { lines: ['__AUTH_CRAM_MD5__', username, challenge, password] };
    } catch {
      return { lines: ['535 Denied'] };
    }
  }

  /**
   * Authenticate using a password (looks up SMTP credentials).
   * This is a placeholder — the actual DB lookup is done by the caller
   * via a callback since we don't have direct DB access here.
   */
  private doAuth(password: string): SmtpCommandResult {
    return { lines: ['__AUTH_PLAIN_LOGIN__', password] };
  }

  // ─── MAIL FROM ───────────────────────────────────────

  private cmdMailFrom(line: string): SmtpCommandResult {
    if (!this.isInState('welcomed', 'mail_from_received')) {
      return { lines: ['503 EHLO/HELO first please'] };
    }

    this.state = 'mail_from_received';
    this.transactionReset();

    // Strip AUTH parameter
    const cleaned = line.replace(/AUTH=.*/i, '');

    // Extract the address
    const match = cleaned.match(/MAIL FROM\s*:\s*(?:<)?([^>]+)(?:>)?/i);
    if (match) {
      this.mailFrom = match[1].trim();
    } else {
      this.mailFrom = null;
    }

    return { lines: ['250 OK'] };
  }

  // ─── RCPT TO ─────────────────────────────────────────

  private cmdRcptTo(line: string): SmtpCommandResult {
    if (!this.isInState('mail_from_received', 'rcpt_to_received')) {
      return { lines: ['503 EHLO/HELO and MAIL FROM first please'] };
    }

    const match = line.match(/RCPT TO\s*:\s*(?:<)?([^>]+)(?:>)?/i);
    const rcptTo = match ? match[1].trim() : null;

    if (!rcptTo) {
      return { lines: ['501 RCPT TO should not be empty'] };
    }

    const parts = rcptTo.split('@');
    const domain = parts.slice(1).join('@');

    if (!domain) {
      return { lines: ['501 Invalid RCPT TO'] };
    }

    // Signal server layer to verify auth (suspended, IP allowlist)
    this.state = 'rcpt_to_received';
    this.recipients.push({
      type: 'credential',
      address: rcptTo,
      metadata: { domain },
    });

    return { lines: ['__RCPT_TO_VERIFY__', rcptTo] };
  }

  /**
   * Withdraw the recipient just added, after the server layer refused it.
   * Without this a refused address would still be delivered to, and DATA
   * would be accepted with no valid recipients at all.
   */
  rejectRecipient(): void {
    this.recipients.pop();
    if (this.recipients.length === 0 && this.state === 'rcpt_to_received') {
      this.state = 'mail_from_received';
    }
  }

  // ─── DATA ────────────────────────────────────────────

  private cmdData(): SmtpCommandResult {
    if (!this.isInState('rcpt_to_received')) {
      return { lines: ['503 HELO/EHLO, MAIL FROM and RCPT TO before sending data'] };
    }

    this.state = 'data_receiving';
    this.messageData = '';
    this.headers = {};
    this.receivingHeaders = true;
    this.currentHeaderKey = null;

    // Set up the internal data handler
    this._dataHandler = (line: string) => this.handleDataLine(line);

    return {
      lines: ['354 Go ahead'],
    };
  }

  private handleDataLine(line: string): SmtpCommandResult | null {
    // End of data: "." on a line by itself
    if (line === '.') {
      this.state = 'welcomed';
      return this.finishMessage();
    }

    // Unstuff leading dots
    const dataLine = line.startsWith('..') ? line.slice(1) : line;

    // Parse headers
    if (this.receivingHeaders) {
      if (dataLine.length === 0) {
        this.receivingHeaders = false;
      } else if (dataLine.startsWith(' ') || dataLine.startsWith('\t')) {
        // Continuation of previous header
        if (this.currentHeaderKey) {
          const key = this.currentHeaderKey.toLowerCase();
          if (this.headers[key] && this.headers[key].length > 0) {
            this.headers[key][this.headers[key].length - 1] += dataLine;
          }
        }
      } else {
        const colonIndex = dataLine.indexOf(':');
        if (colonIndex >= 0) {
          this.currentHeaderKey = dataLine.slice(0, colonIndex).trim();
          const value = dataLine.slice(colonIndex + 1).trim();
          const key = this.currentHeaderKey.toLowerCase();
          if (!this.headers[key]) this.headers[key] = [];
          this.headers[key].push(value);
        } else {
          this.currentHeaderKey = null;
        }
      }
    }

    this.messageData! += dataLine + '\r\n';
    return null;
  }

  private finishMessage(): SmtpCommandResult {
    this._dataHandler = null;

    if (!this.messageData) {
      this.transactionReset();
      return { lines: ['250 OK'] };
    }

    // Check message size
    const size = Buffer.byteLength(this.messageData, 'latin1');
    if (size > this.maxMessageSize) {
      this.transactionReset();
      this.state = 'welcomed';
      return { lines: [`552 Message too large (maximum size ${this.maxMessageSize / 1024 / 1024}MB)`] };
    }

    // Check for mail loops
    const receivedHeader = this.headers['received'];
    const ourHostname = this.serverHostname;
    let loopCount = 0;
    if (receivedHeader) {
      for (const h of receivedHeader) {
        if (h.includes(`by ${ourHostname}`)) loopCount++;
      }
    }
    if (loopCount > 4) {
      this.transactionReset();
      this.state = 'welcomed';
      return { lines: ['550 Loop detected'] };
    }

    // Hand the transaction to the server layer before the reset clears it.
    const message: ReceivedMessage = {
      mailFrom: this.mailFrom ?? '',
      recipients: this.recipients,
      data: this.messageData,
    };
    this.transactionReset();
    return { lines: ['250 OK'], message };
  }

  /**
   * Generate a Received header.
   */
  generateReceivedHeader(helo: string | null, ipAddress: string | null, method: 'SMTP' | 'HTTP'): string {
    const ourHostname = this.serverHostname;
    const date = new Date().toUTCString();
    const privacyMode = this.credential?.server?.privacy_mode ?? false;

    let header = `by ${ourHostname} with ${method}; ${date}`;

    if (!privacyMode && ipAddress) {
      header = `from ${helo ?? 'unknown'} ([${ipAddress}]) ${header}`;
    }

    return header;
  }

  // ─── Proxy protocol ──────────────────────────────────

  private handleProxy(line: string): SmtpCommandResult {
    const match = line.match(/^PROXY (.+) (.+) (.+) (\d+) (\d+)$/);
    if (match) {
      this.ipAddress = match[2];
      this.state = 'welcome';
      return { lines: [`220 ${this.serverHostname} ESMTP Posta/${this.traceId}`] };
    }

    this.state = 'finished';
    return { lines: ['502 Proxy Error'], finished: true };
  }

  // ─── Helpers ─────────────────────────────────────────

  private isInState(...states: string[]): boolean {
    return states.includes(this.state);
  }

  get finished(): boolean {
    return this.state === 'finished';
  }

  get startTls(): boolean {
    return false; // TLS state is tracked via SmtpCommandResult
  }

  /**
   * Sanitize sensitive data from log output.
   */
  private sanitizeForLog(data: string): string {
    if (this.passwordExpected) {
      this.passwordExpected = false;
      if (/^[a-z0-9]{3,}=*$/i.test(data)) {
        return '[redacted]';
      }
    }
    return data.replace(/(AUTH\s+\w+)\s+(.*)$/i, '$1 [redacted]');
  }
}

function generateTraceId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateRandomHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
