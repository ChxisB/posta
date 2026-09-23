import type { SSLModesType } from './ssl_modes';
import { SmtpSession, type SmtpResponse } from './session';

/**
 * Result of a delivery attempt to one endpoint.
 */
export interface DeliveryAttempt {
  endpointDescription: string;
  success: boolean;
  classification: 'Sent' | 'SoftFail' | 'HardFail';
  responseCode: number;
  responseMessage: string;
  time: number;
}

/**
 * An endpoint represents one IP address for a destination mail server.
 */
export class SmtpEndpoint {
  readonly hostname: string;
  readonly ipAddress: string;
  readonly port: number;
  readonly sslMode: SSLModesType;
  readonly sourceIpAddress: string | undefined;
  private heloHostname: string;
  private openTimeout: number;
  private readTimeout: number;
  private session: SmtpSession | null;

  constructor(options: {
    hostname: string;
    ipAddress: string;
    port: number;
    sslMode: SSLModesType;
    heloHostname: string;
    openTimeout?: number;
    readTimeout?: number;
    sourceIpAddress?: string;
  }) {
    this.hostname = options.hostname;
    this.ipAddress = options.ipAddress;
    this.port = options.port;
    this.sslMode = options.sslMode;
    this.sourceIpAddress = options.sourceIpAddress;
    this.heloHostname = options.heloHostname;
    this.openTimeout = options.openTimeout ?? 30;
    this.readTimeout = options.readTimeout ?? 30;
    this.session = null;
  }

  get description(): string {
    return `${this.ipAddress}:${this.port} (${this.hostname})`;
  }

  get isIpv6(): boolean {
    return this.ipAddress.includes(':');
  }

  /**
   * Open an SMTP session to this endpoint and send one message.
   * Retries once on connection error.
   */
  async sendMessage(
    rawMessage: string,
    mailFrom: string,
    rcptTo: string,
  ): Promise<DeliveryAttempt> {
    const startTime = Date.now();

    try {
      await this.ensureSession();
      return await this.doSend(rawMessage, mailFrom, rcptTo);
    } catch (err: any) {
      // Retry once on connection-level errors
      if (this.isConnectionError(err)) {
        try { this.close(); } catch {}
        try {
          await this.ensureSession();
          return await this.doSend(rawMessage, mailFrom, rcptTo);
        } catch (retryErr: any) {
          this.close();
          return this.classifyError(retryErr, startTime);
        }
      }

      this.close();
      return this.classifyError(err, startTime);
    }
  }

  /**
   * Close the current session.
   */
  close(): void {
    if (this.session) {
      try { this.session.quit(); } catch {}
      this.session = null;
    }
  }

  /**
   * Reset the current session (RSET).
   */
  reset(): void {
    if (this.session?.isConnected) {
      try { this.session.rset(); } catch { this.close(); }
    }
  }

  // ─── Private ──────────────────────────────────────────

  private async ensureSession(): Promise<SmtpSession> {
    if (this.session?.isConnected) return this.session;

    const session = new SmtpSession({
      host: this.ipAddress,
      port: this.port,
      sslMode: this.sslMode,
      heloHostname: this.heloHostname,
      openTimeout: this.openTimeout,
      readTimeout: this.readTimeout,
      sourceIpAddress: this.sourceIpAddress,
    });

    // Connect
    const greeting = await session.connect();
    if (greeting.code >= 500) {
      throw new SmtpError(greeting.code, greeting.message);
    }

    // EHLO (try EHLO first, fall back to HELO)
    let capabilities: string[] = [];
    try {
      capabilities = await session.ehlo();
    } catch {
      // EHLO not supported, try HELO
      const heloResponse = await session.helo();
      if (heloResponse.code >= 500) {
        throw new SmtpError(heloResponse.code, heloResponse.message);
      }
    }

    // STARTTLS if appropriate
    if (this.sslMode === 'Auto' || this.sslMode === 'STARTTLS') {
      const hasStartTls = capabilities.some((c) => c.toUpperCase().startsWith('STARTTLS'));
      if (hasStartTls) {
        try {
          const tlsResponse = await session.startTls();
          if (tlsResponse.code === 220) {
            // Re-EHLO after STARTTLS
            await session.ehlo();
          }
        } catch {
          if (this.sslMode === 'STARTTLS') {
            throw new SmtpError(-3, 'STARTTLS required but failed');
          }
          // Auto mode: continue without TLS
        }
      } else if (this.sslMode === 'STARTTLS') {
        throw new SmtpError(-3, 'STARTTLS required but not advertised');
      }
    }

    this.session = session;
    return session;
  }

  private async doSend(
    rawMessage: string,
    mailFrom: string,
    rcptTo: string,
  ): Promise<DeliveryAttempt> {
    const startTime = Date.now();

    if (!this.session) {
      throw new Error('Session not established');
    }

    const session = this.session;

    // One transaction, pipelined where the peer allows it.
    //
    // Replaces the sequential MAIL / RCPT / DATA exchange, which cost four
    // round trips per message. Against a mailbox provider every one of those
    // is pure network latency, so collapsing to two halves the dialog. See
    // SmtpSession.transaction: it falls back to the sequential path when
    // PIPELINING is not advertised, because RFC 2920 forbids pipelining
    // unannounced and some servers drop the connection on unexpected input.
    const { response: dataResponse } = await session.transaction(mailFrom, rcptTo, rawMessage);

    // A failure from any stage arrives here as that stage's reply, so one
    // classification covers all three rather than three near-identical early
    // returns. A 4xx is a deferral, not a delivery: counting it as Sent drops
    // the message with nothing left to retry.
    const classification = this.classifyCode(dataResponse.code);

    return {
      endpointDescription: this.description,
      success: classification === 'Sent',
      classification,
      responseCode: dataResponse.code,
      responseMessage: dataResponse.message,
      time: Date.now() - startTime,
    };
  }

  private classifyCode(code: number): 'Sent' | 'SoftFail' | 'HardFail' {
    if (code >= 200 && code < 300) return 'Sent';
    if (code >= 400 && code < 500) return 'SoftFail';
    if (code >= 500 && code < 600) return 'HardFail';
    return 'HardFail';
  }

  private isConnectionError(err: any): boolean {
    const msg = (err.message ?? '').toLowerCase();
    const code = err.code ?? '';
    return (
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('econnaborted') ||
      msg.includes('epipe') ||
      msg.includes('socket') ||
      msg.includes('timeout') ||
      msg.includes('ssl') ||
      code === 'ECONNRESET' ||
      code === 'ECONNREFUSED' ||
      code === 'ECONNABORTED' ||
      code === 'EPIPE' ||
      code === 'ETIMEDOUT'
    );
  }

  private classifyError(err: any, startTime: number): DeliveryAttempt {
    const msg = (err.message ?? '').toLowerCase();

    let classification: 'Sent' | 'SoftFail' | 'HardFail';
    let responseCode: number;
    let responseMessage: string;

    if (msg.includes('timed out')) {
      classification = 'SoftFail';
      responseCode = -1;
      responseMessage = 'Connection timed out';
    } else if (msg.includes('ssl') || msg.includes('certificate')) {
      classification = 'HardFail';
      responseCode = -3;
      responseMessage = 'SSL error: ' + err.message;
    } else if (err instanceof SmtpError) {
      classification = err.code >= 500 ? 'HardFail' : 'SoftFail';
      responseCode = err.code;
      responseMessage = err.message;
    } else {
      classification = 'SoftFail';
      responseCode = -2;
      responseMessage = err.message ?? 'Connection error';
    }

    return {
      endpointDescription: this.description,
      success: false,
      classification,
      responseCode,
      responseMessage,
      time: Date.now() - startTime,
    };
  }
}

export class SmtpError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'SmtpError';
    this.code = code;
  }
}
