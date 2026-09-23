import {
  allocateIpAddress,
  createQueuedMessage,
  getMainDb,
  getServerDb,
  stripNameFromAddress,
  type PostaConfig,
} from '@posta/core';
import { MessageDbProvisioner, MessageStore } from '@posta/message-db';
import type { MessageReceivedCallback } from './server';
import type { Recipient } from './state-machine';

type ReceivedSmtpMessage = Parameters<MessageReceivedCallback>[0];

interface PendingMessage {
  serverId: number;
  messageId: number;
  domainId: number | undefined;
  outgoing: boolean;
  rcptTo: string;
}

/**
 * Stores a message received over SMTP and queues it for the worker, as the
 * send API does: one message row per recipient, in the database of the mail
 * server that recipient belongs to.
 */
export class MessageQueuer {
  private config: PostaConfig;
  private provisioner: MessageDbProvisioner;

  constructor(config: PostaConfig) {
    this.config = config;
    this.provisioner = new MessageDbProvisioner(config);
  }

  async queue(msg: ReceivedSmtpMessage): Promise<void> {
    const mainDb = getMainDb(this.config);

    const separatorIndex = msg.rawMessage.search(/\r?\n\r?\n/);
    const headers = separatorIndex >= 0 ? msg.rawMessage.slice(0, separatorIndex) : msg.rawMessage;
    const messageId = headers.match(/^Message-ID:\s*(\S+)/im)?.[1] ?? `<${crypto.randomUUID()}@posta>`;
    const subject = headers.match(/^Subject:\s*(.+)$/im)?.[1] ?? '';
    const from = stripNameFromAddress(headers.match(/^From:\s*(.+)$/im)?.[1] ?? null);

    const byServer = new Map<number, Recipient[]>();
    for (const recipient of msg.recipients) {
      const serverId = recipient.metadata.serverId as number;
      byServer.set(serverId, [...(byServer.get(serverId) ?? []), recipient]);
    }

    // Write every row before queueing any. If a write fails the client gets a
    // 451 and sends again, and nothing from this attempt has been delivered.
    const pending: PendingMessage[] = [];
    for (const [serverId, recipients] of byServer) {
      const msgDb = await this.provisioner.openServerDb(serverId, getServerDb(this.config, serverId));
      const store = new MessageStore(msgDb);
      const raw = await store.insertRawMessage(msg.rawMessage);
      const fromDomainId = await this.findDomainId(serverId, from);

      for (const recipient of recipients) {
        const outgoing = recipient.type === 'credential';
        const domainId = outgoing ? fromDomainId : recipient.metadata.domainId as number;
        const id = await store.create({
          scope: outgoing ? 'outgoing' : 'incoming',
          rcpt_to: recipient.address,
          mail_from: msg.mailFrom,
          subject,
          message_id: messageId,
          raw_table: raw.tableName,
          raw_headers_id: raw.headersId,
          raw_body_id: raw.bodyId,
          domain_id: domainId,
          route_id: outgoing ? undefined : recipient.metadata.routeId as number,
          credential_id: outgoing ? recipient.metadata.credentialId as number : undefined,
          status: 'Pending',
          received_with_ssl: msg.tls,
          bounce: false,
        });
        pending.push({ serverId, messageId: id, domainId, outgoing, rcptTo: recipient.address });
      }
    }

    for (const message of pending) {
      const ipAddressId = message.outgoing
        ? await allocateIpAddress(mainDb, this.config.posta.use_ip_pools, message.serverId, 'outgoing', message.rcptTo)
        : null;
      await createQueuedMessage(mainDb, {
        serverId: message.serverId,
        messageId: message.messageId,
        domainId: message.domainId,
        ipAddressId,
      });
    }
  }

  /** The server's domain the message claims to be from, used to sign it with DKIM. */
  private async findDomainId(serverId: number, from: string | null): Promise<number | undefined> {
    const domain = from?.split('@')[1]?.toLowerCase();
    if (!domain) return undefined;
    const row = await getMainDb(this.config).get<{ id: number }>(
      `SELECT id FROM domains WHERE server_id = $1 AND lower(name) = $2`,
      [serverId, domain],
    );
    return row?.id;
  }
}
