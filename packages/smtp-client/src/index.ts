import { SSLModes, type SSLModesType } from './ssl_modes';
import { SmtpEndpoint, type DeliveryAttempt } from './endpoint';
import { SmtpServer } from './server';

export { SmtpEndpoint } from './endpoint';
export { SmtpServer } from './server';
export { SmtpSession } from './session';
export type { SmtpResponse } from './session';
export type { DeliveryAttempt } from './endpoint';
export { SSLModes } from './ssl_modes';
export type { SSLModesType } from './ssl_modes';
export { HttpSender } from './http_sender';
export type { HttpDeliveryResult, HttpMessage, HttpSenderOptions } from './http_sender';

/**
 * High-level sender — orchestrates MX resolution, connection, and delivery.
 *
 * Flow:
 * 1. Resolve MX records for recipient domain → sorted by priority
 * 2. For each MX hostname, resolve to IP addresses (AAAA first, then A)
 * 3. Try each endpoint in order until one accepts the message
 * 4. Classify the result
 */
export class SmtpSender {
  private heloHostname: string;
  private openTimeout: number;
  private readTimeout: number;
  private sourceIpAddress: string | undefined;
  private smtpRelays: Array<{ host: string; port: number; ssl_mode: string }> | undefined;

  constructor(options?: {
    heloHostname?: string;
    openTimeout?: number;
    readTimeout?: number;
    sourceIpAddress?: string;
    smtpRelays?: Array<{ host: string; port: number; ssl_mode: string }>;
  }) {
    this.heloHostname = options?.heloHostname ?? 'localhost';
    this.openTimeout = options?.openTimeout ?? 30;
    this.readTimeout = options?.readTimeout ?? 30;
    this.sourceIpAddress = options?.sourceIpAddress;
    this.smtpRelays = options?.smtpRelays;
  }

  /**
   * Send an email to a single recipient.
   * Returns delivery attempt information.
   */
  async send(
    rawMessage: string,
    mailFrom: string,
    rcptTo: string,
  ): Promise<DeliveryResult> {
    const domain = rcptTo.split('@')[1];
    if (!domain) {
      return {
        success: false,
        classification: 'HardFail',
        attempts: [],
        error: `Invalid recipient address: ${rcptTo}`,
      };
    }

    try {
      // Use SMTP relays if configured, otherwise resolve MX
      const servers: SmtpServer[] = this.smtpRelays && this.smtpRelays.length > 0
        ? this.smtpRelays.map((r) => new SmtpServer(r.host, r.port, (r.ssl_mode as SSLModesType), this.sourceIpAddress))
        : await this.resolveMxServers(domain);

      if (servers.length === 0) {
        return await this.tryDirectDelivery(rawMessage, mailFrom, rcptTo, domain, []);
      }

      // Try each server in order
      for (const server of servers) {
        const endpoints = await server.resolveEndpoints(this.heloHostname, {
          openTimeout: this.openTimeout,
          readTimeout: this.readTimeout,
        });

        if (endpoints.length === 0) continue;

        for (const endpoint of endpoints) {
          const attempt = await endpoint.sendMessage(rawMessage, mailFrom, rcptTo);
          if (attempt.success) {
            return {
              success: true,
              classification: 'Sent',
              attempts: [attempt],
              endpointUsed: attempt.endpointDescription,
            };
          }
        }
      }

      // All servers failed
      return {
        success: false,
        classification: 'SoftFail',
        attempts: [],
        error: 'All servers rejected the message',
      };
    } catch (err: any) {
      return {
        success: false,
        classification: 'SoftFail',
        attempts: [],
        error: err.message ?? 'Delivery failed',
      };
    }
  }

  /**
   * Resolve MX records into SmtpServer objects, sorted by priority.
   */
  private async resolveMxServers(domain: string): Promise<SmtpServer[]> {
    try {
      const mxRecords = await this.resolveMx(domain);
      return mxRecords.map((mx) => new SmtpServer(mx.exchange, 25, 'Auto', this.sourceIpAddress));
    } catch {
      return [];
    }
  }

  /**
   * Try delivering directly to a domain's A/AAAA record (for domains with no MX).
   */
  private async tryDirectDelivery(
    rawMessage: string,
    mailFrom: string,
    rcptTo: string,
    domain: string,
    attempts: DeliveryAttempt[],
  ): Promise<DeliveryResult> {
    const server = new SmtpServer(domain, 25, 'Auto', this.sourceIpAddress);
    const endpoints = await server.resolveEndpoints(this.heloHostname, {
      openTimeout: this.openTimeout,
      readTimeout: this.readTimeout,
    });

    if (endpoints.length === 0) {
      return {
        success: false,
        classification: 'HardFail',
        attempts,
        error: `No MX or A/AAAA records found for ${domain}`,
      };
    }

    for (const endpoint of endpoints) {
      const attempt = await endpoint.sendMessage(rawMessage, mailFrom, rcptTo);
      attempts.push(attempt);
      if (attempt.success) {
        return {
          success: true,
          classification: 'Sent',
          attempts,
          endpointUsed: attempt.endpointDescription,
        };
      }
    }

    return {
      success: false,
      classification: 'SoftFail',
      attempts,
      error: 'All endpoints rejected the message',
    };
  }

  /**
   * Resolve MX records for a domain, sorted by priority.
   */
  private async resolveMx(
    domain: string,
  ): Promise<Array<{ preference: number; exchange: string }>> {
    try {
      const { DnsResolver } = await import('@posta/core');
      const resolver = DnsResolver.local(this.openTimeout);
      return await resolver.mx(domain, this.openTimeout);
    } catch {
      return [];
    }
  }
}

export interface DeliveryResult {
  success: boolean;
  classification: 'Sent' | 'SoftFail' | 'HardFail';
  attempts: DeliveryAttempt[];
  endpointUsed?: string;
  error?: string;
}
