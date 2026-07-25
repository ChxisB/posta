import crypto from 'node:crypto';
import { Signer } from './signer';

/**
 * DKIM header generator.
 *
 * Mirrors the Ruby DKIMHeader class at app/lib/dkim_header.rb.
 * Generates DKIM-Signature headers per RFC 6376 with relaxed/relaxed canonicalization.
 */
export class DkimHeader {
  private domainName: string;
  private dkimKey: string;
  private dkimIdentifier: string;
  private rawHeaders: string;
  private rawBody: string;

  constructor(
    domainName: string,
    dkimKey: string,
    dkimIdentifier: string,
    message: string,
  ) {
    this.domainName = domainName;
    this.dkimKey = dkimKey;
    this.dkimIdentifier = dkimIdentifier;

    const normalized = message.replace(/\r?\n/g, '\r\n');
    const sepIndex = normalized.search(/\r\n\r\n/);
    if (sepIndex >= 0) {
      this.rawHeaders = normalized.slice(0, sepIndex);
      this.rawBody = normalized.slice(sepIndex + 4);
    } else {
      this.rawHeaders = normalized;
      this.rawBody = '';
    }
  }

  /**
   * Generate the DKIM-Signature header string.
   */
  async generate(): Promise<string> {
    const properties = this.getDkimProperties();
    const sig = await this.computeSignature();
    const foldedSig = sig.match(/.{1,72}/g)?.join('\r\n\t') ?? sig;
    return `DKIM-Signature: v=1; ${properties.join('\r\n\t')}${foldedSig}`;
  }

  /**
   * Parse raw headers into individual header lines.
   */
  private get headers(): string[] {
    return this.rawHeaders
      .replace(/\r?\n\s/g, ' ')
      .split(/\r?\n/);
  }

  /**
   * Get the list of header names that will be signed.
   */
  private get headerNames(): string[] {
    return this.normalizedHeaders.map((h) => h.split(':')[0].trim());
  }

  /**
   * Select and normalize headers for signing.
   */
  private get normalizedHeaders(): string[] {
    const dkimHeaderPattern = /^(from|sender|reply-to|subject|date|message-id|to|cc|mime-version|content-type|content-transfer-encoding|resent-to|resent-cc|resent-from|resent-sender|resent-message-id|in-reply-to|references|list-id|list-help|list-owner|list-unsubscribe|list-unsubscribe-post|list-subscribe|list-post):/i;

    return this.headers
      .filter((h) => dkimHeaderPattern.test(h))
      .map((h) => this.normalizeHeader(h));
  }

  /**
   * Normalize a header per RFC 6376 section 3.4.2.
   */
  private normalizeHeader(content: string): string {
    const sepIndex = content.indexOf(':');
    if (sepIndex < 0) return content;

    let key = content.slice(0, sepIndex).toLowerCase();
    let value = content.slice(sepIndex + 1);

    // Unfold continuation lines
    value = value.replace(/\r?\n[ \t]+/g, ' ');

    // Reduce WSP sequences to single SP
    value = value.replace(/[ \t]+/g, ' ');

    // Delete trailing WSP
    value = value.replace(/[ \t]*$/, '');

    // Delete leading WSP after colon
    value = value.replace(/^[ \t]*/, '');

    return `${key}:${value}`;
  }

  /**
   * Normalize the body per RFC 6376 section 3.4.4 (relaxed).
   */
  private get normalizedBody(): string {
    let content = this.rawBody;

    // Reduce sequences of WSP within a line to a single SP
    content = content.replace(/[ \t]+/g, ' ');

    // Ignore all whitespace at the end of lines
    content = content.replace(/[ \t]\r\n/g, '\r\n');

    // Ignore all empty lines at the end
    content = content.replace(/[\r\n]*$/, '');

    content += '\r\n';
    return content;
  }

  /**
   * Compute the body hash (SHA256, Base64).
   */
  private get bodyHash(): string {
    return crypto.createHash('sha256').update(this.normalizedBody).digest('base64');
  }

  /**
   * Build the DKIM properties list (the header fields before the signature).
   */
  private getDkimProperties(): string[] {
    return [
      'a=rsa-sha256; c=relaxed/relaxed;',
      `d=${this.domainName};`,
      `s=${this.dkimIdentifier}; t=${Math.floor(Date.now() / 1000)};`,
      `bh=${this.bodyHash};`,
      `h=${this.headerNames.join(':')};`,
      'b=',
    ];
  }

  /**
   * Build the DKIM header string used for signing.
   */
  private get dkimHeaderForSigning(): string {
    return `dkim-signature:v=1; ${this.getDkimProperties().join(' ')}`;
  }

  /**
   * Build the complete signable header string.
   */
  private get signableHeaderString(): string {
    return [...this.normalizedHeaders, this.dkimHeaderForSigning].join('\r\n');
  }

  /**
   * Compute the signature using RSA SHA256.
   */
  private async computeSignature(): Promise<string> {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(this.signableHeaderString);
    const sig = signer.sign(this.dkimKey);
    return sig.toString('base64');
  }
}
