import net from 'node:net';
import dns from 'node:dns';

/**
 * IPv4 ranges that outbound requests are never allowed to reach.
 * Mirrors the Ruby Posta::HTTP::AddressGuard::BLOCKED_RANGES (IPv4 portion).
 */
const BLOCKED_RANGES_V4 = [
  { start: 0x00000000, end: 0x00ffffff },    // 0.0.0.0/8        "this host on this network"
  { start: 0x0a000000, end: 0x0affffff },    // 10.0.0.0/8       RFC1918 private
  { start: 0x64400000, end: 0x647fffff },    // 100.64.0.0/10    RFC6598 carrier-grade NAT
  { start: 0x7f000000, end: 0x7fffffff },    // 127.0.0.0/8      loopback
  { start: 0xa9fe0000, end: 0xa9feffff },    // 169.254.0.0/16   link-local
  { start: 0xac100000, end: 0xac1fffff },    // 172.16.0.0/12    RFC1918 private
  { start: 0xc0000000, end: 0xc00000ff },    // 192.0.0.0/24     IETF protocol assignments
  { start: 0xc0a80000, end: 0xc0a8ffff },    // 192.168.0.0/16   RFC1918 private
  { start: 0xc6120000, end: 0xc613ffff },    // 198.18.0.0/15    benchmarking
  { start: 0xe0000000, end: 0xefffffff },    // 224.0.0.0/4      multicast
  { start: 0xf0000000, end: 0xffffffff },    // 240.0.0.0/4      reserved
];

/**
 * IPv6 ranges that outbound requests are never allowed to reach.
 * Uses BigInt for 128-bit address comparison.
 * Mirrors the Ruby Posta::HTTP::AddressGuard::BLOCKED_RANGES (IPv6 portion).
 */
const BLOCKED_RANGES_V6: Array<{ start: bigint; end: bigint }> = [
  // ::/128 — unspecified
  { start: 0n, end: 0n },
  // ::1/128 — loopback
  { start: 1n, end: 1n },
  // ::ffff:0:0/96 — IPv4-mapped (also re-checked against the v4 list)
  { start: 0x0000_0000_0000_0000_ffff_0000_0000_0000n, end: 0x0000_0000_0000_0000_ffff_ffff_ffff_ffffn },
  // fc00::/7 — unique-local
  { start: 0xfc00_0000_0000_0000_0000_0000_0000_0000n, end: 0xfdff_ffff_ffff_ffff_ffff_ffff_ffff_ffffn },
  // fe80::/10 — link-local
  { start: 0xfe80_0000_0000_0000_0000_0000_0000_0000n, end: 0xfebf_ffff_ffff_ffff_ffff_ffff_ffff_ffffn },
  // ff00::/8 — multicast
  { start: 0xff00_0000_0000_0000_0000_0000_0000_0000n, end: 0xffff_ffff_ffff_ffff_ffff_ffff_ffff_ffffn },
];

/**
 * Protects outbound HTTP requests against SSRF attacks by resolving the
 * destination hostname to an IP and blocking connections to private,
 * loopback, link-local, multicast, or otherwise reserved addresses.
 *
 * Mirrors the Ruby Posta::HTTP::AddressGuard class.
 */
export class IPAddressGuard {
  private host: string;
  private allowlist: Array<{ type: 'cidr' | 'hostname'; value: string }>;

  constructor(host: string, allowedDestinations?: string[]) {
    this.host = host;
    this.allowlist = (allowedDestinations ?? []).map((entry) => {
      if (entry.includes('/') || net.isIP(entry)) {
        return { type: 'cidr' as const, value: entry };
      }
      return { type: 'hostname' as const, value: entry.toLowerCase() };
    });
  }

  /**
   * Resolve and validate the host, returning a safe IP address to connect to.
   * Throws BlockedDestinationError if the destination is not permitted.
   */
  async getSafeConnectAddress(): Promise<string> {
    if (!this.host) {
      throw new BlockedDestinationError('No host was given for the request');
    }

    const addresses = await this.resolve();

    if (addresses.length === 0) {
      throw new BlockedDestinationError(`Could not resolve '${this.host}' to any IP address`);
    }

    // Reject the whole request if any resolved address is blocked
    for (const addr of addresses) {
      if (this.isBlocked(addr)) {
        throw new BlockedDestinationError(
          `Destination '${this.host}' (${addr}) is not permitted`,
        );
      }
    }

    // Prefer IPv4 for predictability
    const v4 = addresses.find((a) => net.isIPv4(a));
    if (v4) return v4;

    return addresses[0];
  }

  /**
   * Resolve hostname to IP addresses (both IPv4 and IPv6).
   */
  private async resolve(): Promise<string[]> {
    if (net.isIP(this.host)) {
      return [this.host];
    }

    // Resolve both IPv4 and IPv6 addresses in parallel
    const [v4Addresses, v6Addresses] = await Promise.all([
      dns.promises.resolve4(this.host).catch(() => [] as string[]),
      dns.promises.resolve6(this.host).catch(() => [] as string[]),
    ]);

    return [...v4Addresses, ...v6Addresses];
  }

  /**
   * Check if an IP address is blocked.
   */
  private isBlocked(address: string): boolean {
    // Check allowlist first
    for (const entry of this.allowlist) {
      if (entry.type === 'hostname') {
        if (entry.value === this.host.toLowerCase()) return false;
      } else if (entry.type === 'cidr') {
        if (this.cidrContains(entry.value, address)) return false;
      }
    }

    if (net.isIPv4(address)) {
      return this.isBlockedV4(address);
    }

    if (net.isIPv6(address)) {
      return this.isBlockedV6(address);
    }

    return false;
  }

  /**
   * Check if an IPv4 address falls within a blocked range.
   */
  private isBlockedV4(address: string): boolean {
    const ipNum = this.ipToNumber(address);
    if (ipNum === null) return false;

    for (const range of BLOCKED_RANGES_V4) {
      if (ipNum >= range.start && ipNum <= range.end) return true;
    }

    return false;
  }

  /**
   * Check if an IPv6 address falls within a blocked range.
   * IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) are also checked against
   * the IPv4 blocked ranges using the embedded IPv4 address.
   */
  private isBlockedV6(address: string): boolean {
    const ipBigInt = this.ipv6ToBigInt(address);
    if (ipBigInt === null) return false;

    for (const range of BLOCKED_RANGES_V6) {
      if (ipBigInt >= range.start && ipBigInt <= range.end) {
        // For IPv4-mapped addresses (::ffff:0:0/96), also check the
        // embedded IPv4 address against the IPv4 blocked list.
        if (this.isIPv4Mapped(ipBigInt)) {
          const mappedV4 = this.extractIPv4FromMapped(ipBigInt);
          if (mappedV4 !== null && this.isBlockedV4(mappedV4)) {
            return true;
          }
        }
        return true;
      }
    }

    // Even if the IPv6 range itself isn't blocked, an IPv4-mapped address
    // might map to a blocked IPv4 address.
    if (this.isIPv4Mapped(ipBigInt)) {
      const mappedV4 = this.extractIPv4FromMapped(ipBigInt);
      if (mappedV4 !== null && this.isBlockedV4(mappedV4)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a BigInt IPv6 address is in the IPv4-mapped range (::ffff:0:0/96).
   */
  private isIPv4Mapped(ipBigInt: bigint): boolean {
    return ipBigInt >= 0x0000_0000_0000_0000_ffff_0000_0000_0000n &&
           ipBigInt <= 0x0000_0000_0000_0000_ffff_ffff_ffff_ffffn;
  }

  /**
   * Extract the IPv4 address string from an IPv4-mapped IPv6 BigInt.
   */
  private extractIPv4FromMapped(ipBigInt: bigint): string | null {
    const v4Part = ipBigInt & 0xffffffffn;
    const a = Number((v4Part >> 24n) & 0xffn);
    const b = Number((v4Part >> 16n) & 0xffn);
    const c = Number((v4Part >> 8n) & 0xffn);
    const d = Number(v4Part & 0xffn);
    return `${a}.${b}.${c}.${d}`;
  }

  /**
   * Convert an IPv4 address string to a 32-bit unsigned number.
   */
  private ipToNumber(ip: string): number | null {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return null;
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }

  /**
   * Convert an IPv6 address string to a 128-bit BigInt.
   * Handles full, compressed (::), and IPv4-mapped (::ffff:a.b.c.d) forms.
   */
  private ipv6ToBigInt(ip: string): bigint | null {
    try {
      // Handle IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1
      const v4MappedMatch = ip.match(/^(.*):(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
      if (v4MappedMatch) {
        const v6Part = v4MappedMatch[1];
        const v4Part = v4MappedMatch[2];
        const v4Num = this.ipToNumber(v4Part);
        if (v4Num === null) return null;
        // Expand the v6 prefix and combine with v4 suffix
        const expanded = this.expandIPv6(`${v6Part}:0:0`);
        if (expanded === null) return null;
        // Replace last 32 bits with the IPv4 value
        const high96 = (expanded >> 32n) << 32n;
        return high96 | BigInt(v4Num);
      }

      const expanded = this.expandIPv6(ip);
      return expanded;
    } catch {
      return null;
    }
  }

  /**
   * Expand an IPv6 address (handling :: compression) into a full 128-bit BigInt.
   */
  private expandIPv6(ip: string): bigint | null {
    let parts: string[];

    if (ip.includes('::')) {
      const [left, right] = ip.split('::');
      const leftParts = left ? left.split(':') : [];
      const rightParts = right ? right.split(':') : [];
      const missing = 8 - leftParts.length - rightParts.length;
      if (missing < 0) return null;
      parts = [...leftParts, ...Array(missing).fill('0'), ...rightParts];
    } else {
      parts = ip.split(':');
    }

    if (parts.length !== 8) return null;

    let result = 0n;
    for (const part of parts) {
      const value = parseInt(part, 16);
      if (isNaN(value) || value < 0 || value > 0xffff) return null;
      result = (result << 16n) | BigInt(value);
    }

    return result;
  }

  /**
   * Check if a CIDR range contains an IP address.
   * Supports both IPv4 and IPv6 CIDR notation.
   */
  private cidrContains(cidr: string, address: string): boolean {
    const [base, bitsStr] = cidr.split('/');
    const bits = parseInt(bitsStr, 10);
    if (isNaN(bits)) return false;

    // IPv6 CIDR
    if (net.isIPv6(base) || (net.isIPv6(address) && !cidr.includes('.'))) {
      const baseBigInt = this.ipv6ToBigInt(base);
      const addrBigInt = this.ipv6ToBigInt(address);
      if (baseBigInt === null || addrBigInt === null) return false;

      const mask = bits === 0 ? 0n : ((1n << 128n) - 1n) << BigInt(128 - bits);
      return (baseBigInt & mask) === (addrBigInt & mask);
    }

    // IPv4 CIDR
    const baseNum = this.ipToNumber(base);
    const addrNum = this.ipToNumber(address);
    if (baseNum === null || addrNum === null) return false;

    const mask = bits === 0 ? 0 : ~(0xffffffff >>> bits);
    return (baseNum & mask) === (addrNum & mask);
  }
}

export class BlockedDestinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedDestinationError';
  }
}
