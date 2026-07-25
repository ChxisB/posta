/**
 * MessageParser — rewrites links and inserts tracking pixels in email bodies.
 * Port of lib/posta/message_parser.rb
 */

const URL_REGEX = /(https?):\/\/([A-Za-z0-9\-.:]+)(\/[A-Za-z0-9.\/+?&\-_%=~:;()\[\]#]*)?/g;

export interface MessageParserResult {
  actioned: boolean;
  trackedLinks: number;
  trackedImages: number;
  newBody: string;
  newHeaders: string;
}

export interface TrackDomainConfig {
  domain: string;
  full_name: string;
  ssl_enabled: boolean;
  track_clicks: boolean;
  track_loads: boolean;
  excluded_click_domains: string[];
  server_token: string;
  message_token: string;
}

export interface LinkStore {
  createLink(url: string): Promise<string>;
}

export class MessageParser {
  private trackDomain: TrackDomainConfig | null;
  private linkStore: LinkStore | null;
  private actioned = false;
  private trackedLinks = 0;
  private trackedImages = 0;

  constructor(trackDomain: TrackDomainConfig | null, linkStore?: LinkStore) {
    this.trackDomain = trackDomain;
    this.linkStore = linkStore ?? null;
  }

  get tracked_links(): number { return this.trackedLinks; }
  get tracked_images(): number { return this.trackedImages; }

  isActioned(): boolean {
    return this.actioned || this.trackedLinks > 0 || this.trackedImages > 0;
  }

  /**
   * Parse a raw MIME message and return the modified version.
   */
  async parse(rawMessage: string): Promise<string> {
    if (!this.trackDomain) return rawMessage;

    try {
      const separatorIndex = rawMessage.search(/\r?\n\r?\n/);
      const headersPart = separatorIndex >= 0 ? rawMessage.slice(0, separatorIndex) : rawMessage;
      const bodyPart = separatorIndex >= 0 ? rawMessage.slice(separatorIndex + 2) : '';

      const contentTypeMatch = headersPart.match(/^Content-Type:\s*(.+)$/im);
      const contentType = contentTypeMatch?.[1].trim() ?? 'text/plain';

      let newBody = bodyPart;

      if (contentType.includes('text/html')) {
        newBody = await this.parseHtml(bodyPart);
      } else if (contentType.includes('text/plain')) {
        newBody = await this.parseText(bodyPart);
      } else if (contentType.includes('multipart/')) {
        const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i);
        if (boundaryMatch) {
          newBody = await this.parseMultipart(bodyPart, boundaryMatch[1]);
        }
      }

      if (!this.isActioned()) return rawMessage;

      return headersPart + '\r\n\r\n' + newBody;
    } catch (err) {
      console.error('[message-parser] error:', err);
      return rawMessage;
    }
  }

  private async parseHtml(html: string): Promise<string> {
    let result = html;

    if (this.trackDomain!.track_clicks) {
      result = await this.rewriteHtmlLinks(result);
    }

    if (this.trackDomain!.track_loads) {
      result = this.insertTrackingPixel(result);
    }

    return result;
  }

  private async parseText(text: string): Promise<string> {
    if (!this.trackDomain!.track_clicks) return text;

    let result = text;
    const matches = [...result.matchAll(new RegExp(URL_REGEX.source, 'g'))];

    for (const match of matches) {
      const fullUrl = match[0];
      const domain = match[2];

      if (!this.shouldTrackDomain(domain)) continue;

      let url = fullUrl;
      while (url.length > 0 && /[^\w]$/.test(url)) {
        url = url.slice(0, -1);
      }

      const token = this.linkStore ? await this.linkStore.createLink(url) : crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      this.trackedLinks++;

      const trackingUrl = `${this.trackingDomainBase()}/${this.trackDomain!.server_token}/${token}`;
      result = result.replace(fullUrl, trackingUrl + fullUrl.slice(url.length));
    }

    result = result.replace(/(https?)\+notrack:\/\//g, (_, protocol) => {
      this.actioned = true;
      return `${protocol}://`;
    });

    return result;
  }

  private async parseMultipart(body: string, boundary: string): Promise<string> {
    const parts = body.split(`--${boundary}`);
    const results: string[] = [];

    for (const part of parts) {
      if (part.trim() === '' || part.trim() === '--') {
        results.push(part);
        continue;
      }

      const sepIdx = part.search(/\r?\n\r?\n/);
      const partHeaders = sepIdx >= 0 ? part.slice(0, sepIdx) : part;
      const partBody = sepIdx >= 0 ? part.slice(sepIdx + 2) : '';

      const ctMatch = partHeaders.match(/^Content-Type:\s*(.+)$/im);
      const ct = ctMatch?.[1].trim() ?? '';

      let newPartBody = partBody;
      if (ct.includes('text/html')) {
        newPartBody = await this.parseHtml(partBody);
      } else if (ct.includes('text/plain')) {
        newPartBody = await this.parseText(partBody);
      } else if (ct.includes('multipart/')) {
        const innerBoundaryMatch = ct.match(/boundary="?([^";\s]+)"?/i);
        if (innerBoundaryMatch) {
          newPartBody = await this.parseMultipart(partBody, innerBoundaryMatch[1]);
        }
      }

      results.push(partHeaders + (sepIdx >= 0 ? '\r\n\r\n' : '') + newPartBody);
    }

    return results.join(`--${boundary}`);
  }

  private async rewriteHtmlLinks(html: string): Promise<string> {
    const hrefRegex = /href=(['"])((https?):\/\/([A-Za-z0-9\-.:]+)([^'"]*))['"]/g;

    const matches = [...html.matchAll(hrefRegex)];
    let result = html;

    for (const match of matches) {
      const [fullMatch, quote, url, protocol, domain] = match;
      if (!this.shouldTrackDomain(domain)) continue;

      const token = this.linkStore ? await this.linkStore.createLink(url) : crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      this.trackedLinks++;

      const trackingUrl = `${this.trackingDomainBase()}/${this.trackDomain!.server_token}/${token}`;
      result = result.replace(fullMatch, `href=${quote}${trackingUrl}${quote}`);
    }

    result = result.replace(/(https?)\+notrack:\/\//g, (_, protocol) => {
      this.actioned = true;
      return `${protocol}://`;
    });

    return result;
  }

  private insertTrackingPixel(html: string): string {
    this.trackedImages++;
    const pixel = `<p class='ampimg' style='display:none;visibility:none;margin:0;padding:0;line-height:0;'><img src='${this.trackingDomainBase()}/img/${this.trackDomain!.server_token}/${this.trackDomain!.message_token}' alt=''></p>`;

    if (html.includes('</body>')) {
      return html.replace('</body>', `${pixel}</body>`);
    }
    return html + pixel;
  }

  private trackingDomainBase(): string {
    const ssl = this.trackDomain?.ssl_enabled ?? false;
    const name = this.trackDomain?.full_name ?? '';
    return `${ssl ? 'https' : 'http'}://${name}`;
  }

  private shouldTrackDomain(domain: string): boolean {
    if (!this.trackDomain) return false;
    return !this.trackDomain.excluded_click_domains.includes(domain);
  }
}