import { isIP } from 'node:net';
import type { SSLModesType } from './ssl_modes';
import { SmtpEndpoint } from './endpoint';

export class SmtpServer {
  readonly hostname: string;
  readonly port: number;
  readonly sslMode: SSLModesType;
  readonly sourceIpAddress: string | undefined;

  constructor(hostname: string, port: number = 25, sslMode: SSLModesType = 'Auto', sourceIpAddress?: string) {
    this.hostname = hostname;
    this.port = port;
    this.sslMode = sslMode;
    this.sourceIpAddress = sourceIpAddress;
  }

  async resolveEndpoints(heloHostname: string, options?: {
    openTimeout?: number;
    readTimeout?: number;
  }): Promise<SmtpEndpoint[]> {
    const endpoints: SmtpEndpoint[] = [];

    const ipType = isIP(this.hostname);
    if (ipType !== 0) {
      endpoints.push(new SmtpEndpoint({
        hostname: this.hostname,
        ipAddress: this.hostname,
        port: this.port,
        sslMode: this.sslMode,
        heloHostname,
        sourceIpAddress: this.sourceIpAddress,
        ...options,
      }));
      return endpoints;
    }

    const { DnsResolver } = await import('@posta/core');

    try {
      const resolver = DnsResolver.local(options?.openTimeout);
      const aaaa = await resolver.aaaa(this.hostname);
      for (const ip of aaaa) {
        endpoints.push(new SmtpEndpoint({
          hostname: this.hostname,
          ipAddress: ip,
          port: this.port,
          sslMode: this.sslMode,
          heloHostname,
          sourceIpAddress: this.sourceIpAddress,
          ...options,
        }));
      }
    } catch {
      // IPv6 not available, skip
    }

    try {
      const resolver = DnsResolver.local(options?.openTimeout);
      const a = await resolver.a(this.hostname);
      for (const ip of a) {
        endpoints.push(new SmtpEndpoint({
          hostname: this.hostname,
          ipAddress: ip,
          port: this.port,
          sslMode: this.sslMode,
          heloHostname,
          sourceIpAddress: this.sourceIpAddress,
          ...options,
        }));
      }
    } catch {
      // IPv4 not available, skip
    }

    return endpoints;
  }
}
