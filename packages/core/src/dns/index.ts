import dns from 'node:dns';
import { readFileSync, existsSync } from 'node:fs';

/**
 * DNS resolution results.
 */
export interface DnsResult {
  a: string[];
  aaaa: string[];
  mx: Array<{ preference: number; exchange: string }>;
  txt: string[];
  cname: string[];
  ns: string[];
}

/**
 * DNS resolver that reads nameservers from resolv.conf.
 *
 * Mirrors the Ruby DNSResolver class at app/lib/dns_resolver.rb.
 * Supports A, AAAA, MX, TXT, CNAME, NS lookups with configurable timeout.
 */
export class DnsResolver {
  public readonly nameservers: string[];
  public readonly timeout: number;

  constructor(nameservers: string[], timeout: number = 5) {
    this.nameservers = nameservers;
    this.timeout = timeout;
  }

  /**
   * Look up A records for a hostname.
   */
  a(name: string, timeout?: number): Promise<string[]> {
    return this.withResolver(timeout, (resolver) =>
      new Promise<string[]>((resolve, reject) => {
        resolver.resolve4(name, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses);
        });
      }),
    );
  }

  /**
   * Look up AAAA records for a hostname.
   */
  aaaa(name: string, timeout?: number): Promise<string[]> {
    return this.withResolver(timeout, (resolver) =>
      new Promise<string[]>((resolve, reject) => {
        resolver.resolve6(name, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses);
        });
      }),
    );
  }

  /**
   * Look up MX records for a hostname.
   * Returns sorted by preference (lowest first), with random ordering within same preference.
   */
  mx(name: string, timeout?: number): Promise<Array<{ preference: number; exchange: string }>> {
    return this.withResolver(timeout, (resolver) =>
      new Promise<Array<{ preference: number; exchange: string }>>((resolve, reject) => {
        resolver.resolveMx(name, (err, addresses) => {
          if (err) reject(err);
          else {
            const records = addresses.map((mx) => ({
              preference: mx.priority,
              exchange: mx.exchange,
            }));
            records.sort((a, b) => {
              if (a.preference === b.preference) {
                return Math.random() < 0.5 ? -1 : 1;
              }
              return a.preference - b.preference;
            });
            resolve(records);
          }
        });
      }),
    );
  }

  /**
   * Look up TXT records for a hostname.
   */
  txt(name: string, timeout?: number): Promise<string[]> {
    return this.withResolver(timeout, (resolver) =>
      new Promise<string[]>((resolve, reject) => {
        resolver.resolveTxt(name, (err, records) => {
          if (err) reject(err);
          else resolve(records.map((chunks) => chunks.join('')));
        });
      }),
    );
  }

  /**
   * Look up CNAME records for a hostname.
   */
  cname(name: string, timeout?: number): Promise<string[]> {
    return this.withResolver(timeout, (resolver) =>
      new Promise<string[]>((resolve, reject) => {
        resolver.resolveCname(name, (err, records) => {
          if (err) reject(err);
          else resolve(records.map((r) => r.toLowerCase()));
        });
      }),
    );
  }

  /**
   * Look up NS records for a hostname, walking up the domain hierarchy.
   */
  ns(name: string, timeout?: number): Promise<string[]> {
    return this.withResolver(timeout, (resolver) =>
      new Promise<string[]>((resolve, reject) => {
        resolver.resolveNs(name, (err, records) => {
          if (err) reject(err);
          else resolve(records);
        });
      }),
    );
  }

  /**
   * Find effective nameservers for a domain by walking up the label hierarchy.
   */
  async effectiveNs(name: string, timeout?: number): Promise<string[]> {
    const parts = name.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      const domain = parts.slice(i).join('.');
      try {
        const records = await this.ns(domain, timeout);
        if (records.length > 0) return records;
      } catch {
        continue;
      }
    }
    return [];
  }

  /**
   * Perform a reverse DNS lookup (IP to hostname).
   */
  async ipToHostname(ipAddress: string, timeout?: number): Promise<string> {
    try {
      const hostnames = await this.withResolver(timeout, (resolver) =>
        new Promise<string[]>((resolve, reject) => {
          resolver.reverse(ipAddress, (err, hostnames) => {
            if (err) reject(err);
            else resolve(hostnames);
          });
        }),
      );
      return hostnames[0] ?? ipAddress;
    } catch {
      return ipAddress;
    }
  }

  /**
   * Run a DNS operation with the configured resolver.
   */
  private withResolver<T>(
    timeoutOverride: number | undefined,
    fn: (resolver: dns.Resolver) => Promise<T>,
  ): Promise<T> {
    const resolver = new dns.Resolver();
    resolver.setServers(this.nameservers);
    const t = timeoutOverride ?? this.timeout;

    // node:dns Resolver uses cancel() for timeout via cancellation
    // We wrap with a timeout promise race
    
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        try { resolver.cancel(); } catch {}
        reject(new Error(`DNS query timed out after ${t}s`));
      }, t * 1000);

      fn(resolver)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  // ─── Static factories ──────────────────────────────────

  private static _local: DnsResolver | null = null;

  /**
   * Create a resolver for a specific domain using the domain's nameservers.
   */
  static async forDomain(name: string, timeout?: number): Promise<DnsResolver> {
    const local = DnsResolver.local(timeout);
    const nsNames = await local.effectiveNs(name, timeout);
    const ips: string[] = [];
    for (const ns of nsNames) {
      try {
        const addrs = await local.a(ns, timeout);
        ips.push(...addrs);
      } catch {
        // skip unresolvable nameservers
      }
    }
    return new DnsResolver([...new Set(ips)], timeout);
  }

  /**
   * Create a resolver using local nameservers from /etc/resolv.conf.
   */
  static local(timeout?: number): DnsResolver {
    if (DnsResolver._local) return DnsResolver._local;

    const resolvConfPath = '/etc/resolv.conf';
    if (!existsSync(resolvConfPath)) {
      throw new Error(`No resolver config found at ${resolvConfPath}`);
    }

    const content = readFileSync(resolvConfPath, 'utf-8');
    const nameservers: string[] = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('nameserver ')) {
        const ns = trimmed.slice(11).trim();
        if (ns) nameservers.push(ns);
      }
    }

    if (nameservers.length === 0) {
      throw new Error(`Could not find nameservers in ${resolvConfPath}`);
    }

    DnsResolver._local = new DnsResolver(nameservers, timeout);
    return DnsResolver._local;
  }

  /**
   * Reset the cached local resolver (useful in tests).
   */
  static resetLocal(): void {
    DnsResolver._local = null;
  }
}
