import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PostaConfig } from '@posta/core';
import type { SesReceipt } from './ses-events';

/** SES refuses to receive a message larger than this, so a larger object is not ours. */
export const MAX_INBOUND_BYTES = 40 * 1024 * 1024;

/** The `inbound_region` a client sends to have Posta's own SMTP server receive a domain's mail. */
export const INBOUND_SMTP = 'smtp';

export function inboundSettings(config: PostaConfig) {
  return {
    provider: config.posta.inbound_provider ?? 'ses',
    buckets: config.aws?.inbound_buckets ?? {},
    prefix: config.aws?.inbound_prefix ?? 'inbound/',
  };
}

/** Where SES receives mail for a region; this is the MX target a domain publishes. */
export function inboundMxHost(region: string): string {
  return `inbound-smtp.${region}.amazonaws.com`;
}

/**
 * The region whose receipt rules take a domain's mail, or null when Posta's own SMTP
 * server should. A region only qualifies once the operator has given it an inbound
 * bucket, so an install that has not set up receiving behaves as it always has.
 * Receiving may use a different region from sending: some regions can only send.
 */
export function resolveInboundRegion(config: PostaConfig, options: { requested?: string | null; sendingRegion?: string | null; served: string[] }): string | null {
  const settings = inboundSettings(config);
  const { requested, sendingRegion, served } = options;
  // A domain can opt out of SES receiving even where its region has a bucket.
  if (requested === INBOUND_SMTP) return null;
  if (settings.provider !== 'ses') {
    if (requested) throw new Error('SES inbound is switched off (posta.inbound_provider is smtp)');
    return null;
  }
  if (requested) {
    if (!settings.buckets[requested]) throw new Error(`SES inbound is not set up in ${requested}; add an inbound bucket for it`);
    if (!served.includes(requested)) throw new Error(`SES region ${requested} is not configured on this installation`);
    return requested;
  }
  return sendingRegion && settings.buckets[sendingRegion] && served.includes(sendingRegion) ? sendingRegion : null;
}

/** An inbound failure that retrying cannot fix. */
export class InboundRejectedError extends Error {
  name = 'InboundRejectedError';
}

/**
 * A notification is a claim about where mail is; it is only believed when it names the
 * bucket and prefix this region was configured with, so a forged or misrouted
 * notification can never make a worker read some other object.
 */
export function assertReceiptLocation(config: PostaConfig, region: string, receipt: Pick<SesReceipt, 'bucket' | 'key'>): void {
  const settings = inboundSettings(config);
  const bucket = settings.buckets[region];
  if (!bucket) throw new InboundRejectedError(`No inbound bucket is configured for ${region}`);
  if (receipt.bucket !== bucket) throw new InboundRejectedError(`Received mail names bucket ${receipt.bucket}, not the configured ${bucket}`);
  if (!receipt.key.startsWith(settings.prefix) || receipt.key.includes('..')) {
    throw new InboundRejectedError('Received mail names an object outside the inbound prefix');
  }
}

export interface S3Like { send(command: any): Promise<any> }

/** Reads received mail from the region's bucket, using the AWS credential chain. */
export class SesInboundStore {
  private clients = new Map<string, S3Like>();
  constructor(private config: PostaConfig, private factory: (region: string) => S3Like = (region) => new S3Client({ region })) {}

  private client(region: string): S3Like {
    let client = this.clients.get(region);
    if (!client) { client = this.factory(region); this.clients.set(region, client); }
    return client;
  }

  /** The raw message as a latin1 string, the form the rest of Posta stores mail in. */
  async fetch(region: string, receipt: Pick<SesReceipt, 'bucket' | 'key'>): Promise<string> {
    assertReceiptLocation(this.config, region, receipt);
    try {
      const object = await this.client(region).send(new GetObjectCommand({ Bucket: receipt.bucket, Key: receipt.key }));
      if ((object.ContentLength ?? 0) > MAX_INBOUND_BYTES) throw new InboundRejectedError('Received mail is larger than SES allows');
      const bytes: Uint8Array = await object.Body.transformToByteArray();
      return Buffer.from(bytes).toString('latin1');
    } catch (error: any) {
      if (error.name === 'NoSuchKey') throw new InboundRejectedError('The received message is no longer in the inbound bucket');
      throw error;
    }
  }

  /** Raw mail now lives in Posta's database, so the bucket copy is only kept as a backstop. */
  async remove(region: string, receipt: Pick<SesReceipt, 'bucket' | 'key'>): Promise<void> {
    try {
      assertReceiptLocation(this.config, region, receipt);
      await this.client(region).send(new DeleteObjectCommand({ Bucket: receipt.bucket, Key: receipt.key }));
    } catch (error: any) {
      // The bucket's lifecycle rule expires it anyway; never fail an ingested message over this.
      console.warn(`[ses-inbound] Could not delete ${receipt.key}: ${error.message}`);
    }
  }
}
