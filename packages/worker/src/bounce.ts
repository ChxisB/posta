import { randomUUID } from 'node:crypto';
import type { PostaConfig } from '@posta/core';
import { getMainDb, createQueuedMessage } from '@posta/core';
import { MessageDbProvisioner, MessageStore } from '@posta/message-db';

/**
 * Options for generating and processing a bounce (DSN) message.
 */
export interface BounceOptions {
  /** The server that processed the original message. */
  serverId: number;
  /** The original message ID that failed delivery. */
  messageId: number;
  /** The original message's MAIL FROM (envelope sender). */
  mailFrom: string;
  /** The original message's RCPT TO (envelope recipient). */
  rcptTo: string;
  /** The original message's Subject header. */
  subject: string;
  /** The original message's token (used for identification). */
  token: string;
  /** The original message's Message-ID header value. */
  messageId_header: string;
  /** Human-readable description of the route that failed. */
  routeDescription: string;
  /** The domain name (used for the postmaster contact address). */
  domainName?: string;
  /** The complete raw RFC 822 message that failed delivery. */
  rawMessage: string;
}

/**
 * Generates bounce (DSN) messages and queues them for delivery.
 *
 * Mirrors the Ruby `BounceMessage` model in app/models/bounce_message.rb.
 */
export class BounceProcessor {
  private config: PostaConfig;
  private provisioner: MessageDbProvisioner;

  constructor(config: PostaConfig, provisioner: MessageDbProvisioner) {
    this.config = config;
    this.provisioner = provisioner;
  }

  /**
   * Generate a bounce DSN message and queue it for delivery.
   *
   * 1. Opens the server's MessageDB
   * 2. Builds a multipart bounce DSN (Delivery Status Notification) email
   * 3. Creates an outgoing message record marked as a bounce
   * 4. Queues the message in the main DB for the worker to pick up
   *
   * @returns The new message ID in the server's MessageDB.
   */
  async processBounce(options: BounceOptions): Promise<number> {
    const returnPathDomain = this.config.dns.return_path_domain;

    // Open the server's MessageDB
    const msgDb = this.provisioner.openServerDb(options.serverId);
    const msgStore = new MessageStore(msgDb);

    // Build the bounce DSN MIME message
    const rawBounceMsg = this.buildBounceMessage(options, returnPathDomain);

    // Store the raw bounce message in the partitioned raw tables
    const { tableName, headersId, bodyId } =
      msgStore.insertRawMessage(rawBounceMsg);

    // Create the bounce message record
    const msgId = msgDb.insert('messages', {
      token: options.token,
      scope: 'outgoing',
      rcpt_to: options.mailFrom,
      mail_from: options.routeDescription,
      subject: `Mail Delivery Failed (${options.subject})`,
      message_id: `<${randomUUID()}@${returnPathDomain}>`,
      timestamp: Date.now() / 1000,
      status: 'Pending',
      bounce: 1,
      bounce_for_id: options.messageId,
      raw_table: tableName,
      raw_headers_id: headersId,
      raw_body_id: bodyId,
      size: String(Buffer.byteLength(rawBounceMsg, 'utf-8')),
    });

    // Queue the bounce in the main DB so the worker picks it up for delivery
    const mainDb = getMainDb(this.config);
    createQueuedMessage(mainDb, {
      serverId: options.serverId,
      messageId: msgId,
    });

    return msgId;
  }

  /**
   * Build a multipart bounce DSN (Delivery Status Notification) MIME message.
   *
   * The message contains:
   * - A text body explaining the delivery failure with diagnostic details
   * - The original message attached as a message/rfc822 MIME part
   *
   * @returns The complete MIME message as a string.
   */
  buildBounceMessage(options: BounceOptions, returnPathDomain: string): string {
    const boundary = `=_${randomUUID().replace(/-/g, '')}`;
    const messageId = `<${randomUUID()}@${returnPathDomain}>`;

    const postmasterContact = options.domainName
      ? `postmaster@${options.domainName}`
      : 'the relevant mail administrator';

    const textBody = [
      `This is the mail delivery service responsible for delivering mail to ${options.routeDescription}.`,
      '',
      "The message you've sent cannot be delivered. Your original message is attached to this message.",
      '',
      `For further assistance please contact ${postmasterContact}. Please include the details below to help us identify the issue.`,
      '',
      `Message Token: ${options.token}`,
      `Original Message ID: ${options.messageId_header}`,
      `Mail from: ${options.mailFrom}`,
      `Rcpt To: ${options.rcptTo}`,
    ].join('\r\n');

    const encodedAttachment = encodeQuotedPrintable(options.rawMessage);

    const message = [
      `From: Mail Delivery Service <${options.routeDescription}>`,
      `To: ${options.mailFrom}`,
      `Subject: Mail Delivery Failed (${options.subject})`,
      `Message-ID: ${messageId}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      textBody,
      '',
      `--${boundary}`,
      'Content-Type: message/rfc822; name="Original Message.eml"',
      'Content-Disposition: attachment; filename="Original Message.eml"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      encodedAttachment,
      '',
      `--${boundary}--`,
      '',
    ].join('\r\n');

    return message;
  }
}

/**
 * Encode a string as quoted-printable (RFC 2045, section 6.7).
 *
 * Lines are wrapped at 76 characters (excluding the soft line break).
 * Characters outside the printable ASCII range (including '=') are
 * encoded as =XX hex sequences.
 */
function encodeQuotedPrintable(input: string): string {
  const bytes = Buffer.from(input, 'utf-8');
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    let chunk: string;

    if (byte === 0x0a) {
      // LF — end of line
      lines.push(currentLine);
      currentLine = '';
      continue;
    }

    if (byte === 0x0d) {
      // CR — skip, LF handles line breaks
      continue;
    }

    if (
      (byte >= 33 && byte <= 60) || // ! through <
      (byte >= 62 && byte <= 126) // > through ~
    ) {
      // Printable ASCII (except '=')
      chunk = String.fromCharCode(byte);
    } else if (byte === 0x09 || byte === 0x20) {
      // Tab or space
      chunk = String.fromCharCode(byte);
    } else if (byte === 0x3d) {
      // Equals sign
      chunk = '=3D';
    } else {
      // All other bytes encoded as =XX
      chunk = '=' + byte.toString(16).toUpperCase().padStart(2, '0');
    }

    // Line-length wrapping at 75 characters (soft break adds '=')
    if (currentLine.length + chunk.length > 75) {
      lines.push(currentLine + '=');
      currentLine = chunk;
    } else {
      currentLine += chunk;
    }
  }

  // Flush any remaining content
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.join('\r\n');
}
