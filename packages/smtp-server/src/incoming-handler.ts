import type { PostaConfig } from '@posta/core';
import { getMainDb, HttpClient } from '@posta/core';
import { MessageDbProvisioner, MessageStore } from '@posta/message-db';

/**
 * Handler for incoming SMTP messages.
 *
 * After DATA completes, this:
 * 1. Stores the raw message in the server's MessageDB
 * 2. Records delivery as incoming
 * 3. Looks up matching routes for the recipient domain
 * 4. Dispatches to the best-matching endpoint
 */
export interface IncomingMessage {
  /** MAIL FROM address */
  mailFrom: string;
  /** RCPT TO address */
  rcptTo: string;
  /** Raw RFC822 message data */
  rawMessage: string;
  /** Source IP address */
  sourceIp: string;
}

export interface RouteMatch {
  route: any;
  endpoint: any;
  endpointType: string;
}

export class IncomingMessageHandler {
  private config: PostaConfig;
  private provisioner: MessageDbProvisioner;

  constructor(config: PostaConfig) {
    this.config = config;
    this.provisioner = new MessageDbProvisioner(config);
  }

  /**
   * Process an incoming message: store, route, and dispatch.
   */
  async handle(msg: IncomingMessage): Promise<void> {
    const mainDb = getMainDb(this.config);

    // 1. Find which server owns this domain
    const recipientDomain = msg.rcptTo.split('@')[1] ?? '';
    const domain = mainDb.query(
      `SELECT d.id as domain_id, d.server_id, d.name, d.verified_at
       FROM domains d
       WHERE d.name = ? AND d.verified_at IS NOT NULL
       LIMIT 1`,
    ).get(recipientDomain) as any;

    if (!domain) {
      console.log(`[incoming] no domain found for ${recipientDomain}, bouncing`);
      return;
    }

    const serverId = domain.server_id;

    // 2. Open the server's MessageDB
    const msgDb = this.provisioner.openServerDb(serverId);
    const store = new MessageStore(msgDb);

    // 3. Store the raw message
    const raw = store.insertRawMessage(msg.rawMessage);

    // 4. Create the message record
    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const messageId = msg.rawMessage.match(/^Message-ID:\s*(\S+)/im)?.[1] ?? `<${crypto.randomUUID()}@posta>`;

    const msgRecordId = store.create({
      scope: 'incoming',
      rcpt_to: msg.rcptTo,
      mail_from: msg.mailFrom,
      message_id: messageId,
      domain_id: domain.domain_id,
      raw_table: raw.tableName,
      raw_headers_id: raw.headersId,
      raw_body_id: raw.bodyId,
      status: 'Pending',
      received_with_ssl: false,
      timestamp: Date.now() / 1000,
    });

    console.log(`[incoming] stored message ${msgRecordId} for ${msg.rcptTo}`);

    // 5. Find matching routes
    const routes = await this.findMatchingRoutes(serverId, recipientDomain, msgDb);
    if (routes.length === 0) {
      console.log(`[incoming] no routes match ${recipientDomain}, marking as Sent`);
      msgDb.update('messages', { status: 'Sent' }, { where: { id: msgRecordId } });
      msgDb.insert('deliveries', {
        message_id: msgRecordId,
        status: 'Sent',
        details: 'No routes configured — accepted without delivery',
        timestamp: Date.now() / 1000,
      });
      return;
    }

    // 6. Dispatch to the first matching route's endpoint
    const match = routes[0];
    const success = await this.dispatchToEndpoint(match, msg, msgRecordId, msgDb);

    if (success) {
      msgDb.update('messages', { status: 'Sent' }, { where: { id: msgRecordId } });
      msgDb.insert('deliveries', {
        message_id: msgRecordId,
        status: 'Sent',
        details: `Delivered via ${match.endpointType}`,
        timestamp: Date.now() / 1000,
      });
    } else {
      msgDb.update('messages', { status: 'SoftFail' }, { where: { id: msgRecordId } });
      msgDb.insert('deliveries', {
        message_id: msgRecordId,
        status: 'SoftFail',
        details: 'Endpoint delivery failed',
        timestamp: Date.now() / 1000,
      });
    }
  }

  /**
   * Find routes matching the recipient domain.
   */
  private async findMatchingRoutes(
    serverId: number,
    domain: string,
    msgDb: any,
  ): Promise<RouteMatch[]> {
    const mainDb = getMainDb(this.config);

    const routes = mainDb.query(
      `SELECT r.* FROM routes r
       JOIN domains d ON d.id = r.domain_id
       WHERE d.name = ? AND r.server_id = ?`,
    ).all(domain, serverId) as any[];

    const matches: RouteMatch[] = [];

    for (const route of routes) {
      let endpoint: any = null;
      let endpointType = route.endpoint_type ?? '';

      if (endpointType === 'HTTP' && route.endpoint_id) {
        endpoint = mainDb.query(`SELECT * FROM http_endpoints WHERE id = ?`).get(route.endpoint_id) as any;
      } else if (endpointType === 'SMTP' && route.endpoint_id) {
        endpoint = mainDb.query(`SELECT * FROM smtp_endpoints WHERE id = ?`).get(route.endpoint_id) as any;
      } else if (endpointType === 'Address' && route.endpoint_id) {
        endpoint = mainDb.query(`SELECT * FROM address_endpoints WHERE id = ?`).get(route.endpoint_id) as any;
      }

      matches.push({ route, endpoint, endpointType });
    }

    return matches;
  }

  /**
   * Dispatch a message to an endpoint.
   */
  private async dispatchToEndpoint(
    match: RouteMatch,
    msg: IncomingMessage,
    msgRecordId: number,
    msgDb: any,
  ): Promise<boolean> {
    try {
      switch (match.endpointType) {
        case 'HTTP': {
          if (!match.endpoint?.url) return false;
          const client = new HttpClient(this.config);
          const response = await client.post(match.endpoint.url, {
            json: JSON.stringify({
              rcpt_to: msg.rcptTo,
              mail_from: msg.mailFrom,
              message: msg.rawMessage,
            }),
            timeout: 30,
          });
          return response.code >= 200 && response.code < 300;
        }

        case 'SMTP': {
          if (!match.endpoint?.hostname) return false;
          const { SmtpSender } = await import('@posta/smtp-client');
          const sender = new SmtpSender({
            heloHostname: this.config.posta.smtp_hostname,
            openTimeout: 30,
            readTimeout: 30,
          });
          const result = await sender.send(msg.rawMessage, msg.mailFrom, msg.rcptTo);
          return result.success;
        }

        case 'Address': {
          // Local delivery — acknowledge only
          return true;
        }

        default:
          return false;
      }
    } catch (err: any) {
      console.error(`[incoming] dispatch error:`, err.message);
      return false;
    }
  }
}
