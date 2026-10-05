import type { Queryable } from './db/client';
import { stripNameFromAddress } from './helpers';

export interface InboundRoute {
  id: number;
  server_id: number;
  domain_id: number;
  /** The SES region that receives this domain's mail; null when Posta's SMTP server does. */
  ses_inbound_region: string | null;
}

/**
 * The route that takes mail for this address: one named for its local part
 * (ignoring any +tag), else the domain's catch-all. Both inbound paths, the
 * SMTP server and SES receiving, decide where mail goes with this one query.
 */
export async function findInboundRoute(db: Pick<Queryable, 'get'>, address: string): Promise<InboundRoute | null> {
  const at = address.lastIndexOf('@');
  if (at < 1) return null;
  const name = address.slice(0, at).split('+')[0].toLowerCase();
  const domain = address.slice(at + 1).toLowerCase();

  const route = await db.get<InboundRoute>(
    `SELECT r.id, r.server_id, r.domain_id, d.ses_inbound_region
     FROM routes r
     JOIN domains d ON d.id = r.domain_id
     WHERE lower(d.name) = $1
       AND COALESCE(d.inbound_verified_at, CASE WHEN d.ses_region IS NULL THEN d.verified_at END) IS NOT NULL
       AND d.incoming = 1
       AND (lower(r.name) = $2 OR r.name = '*')
     ORDER BY (r.name = '*')
     LIMIT 1`,
    [domain, name],
  );
  return route ?? null;
}

/** The headers a message row records, read from the raw message. */
export function parseMessageSummary(raw: string): { messageId: string; subject: string; from: string | null } {
  const separatorIndex = raw.search(/\r?\n\r?\n/);
  const headers = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw;
  return {
    messageId: headers.match(/^Message-ID:\s*(\S+)/im)?.[1] ?? `<${crypto.randomUUID()}@posta>`,
    subject: headers.match(/^Subject:\s*(.+)$/im)?.[1] ?? '',
    from: stripNameFromAddress(headers.match(/^From:\s*(.+)$/im)?.[1] ?? null),
  };
}
