import { randomUUID } from 'node:crypto';
import type { PostaConfig } from '@posta/core';
import { getMainDb, createQueuedMessage } from '@posta/core';
import { MessageDbProvisioner } from './provisioner';
import { MessageStore } from './message';

function buildMimeMessage(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  returnPathDomain: string;
}): string {
  const messageId = `<${randomUUID()}@${params.returnPathDomain}>`;
  const date = new Date().toUTCString();

  return [
    `Date: ${date}`,
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    params.body,
    '',
  ].join('\r\n');
}

function storeAndQueue(
  config: PostaConfig,
  provisioner: MessageDbProvisioner,
  serverId: number,
  rawMessage: string,
  meta: {
    rcptTo: string;
    mailFrom: string;
    subject: string;
  },
): number {
  const msgDb = provisioner.openServerDb(serverId);
  const msgStore = new MessageStore(msgDb);

  const { tableName, headersId, bodyId } = msgStore.insertRawMessage(rawMessage);

  const msgId = msgDb.insert('messages', {
    token: randomUUID(),
    scope: 'outgoing',
    rcpt_to: meta.rcptTo,
    mail_from: meta.mailFrom,
    subject: meta.subject,
    message_id: `<${randomUUID()}@${config.dns.return_path_domain}>`,
    timestamp: Date.now() / 1000,
    status: 'Pending',
    raw_table: tableName,
    raw_headers_id: headersId,
    raw_body_id: bodyId,
    size: String(Buffer.byteLength(rawMessage, 'utf-8')),
  });

  const mainDb = getMainDb(config);
  createQueuedMessage(mainDb, { serverId, messageId: msgId });

  return msgId;
}

function resolveNotificationRecipient(
  config: PostaConfig,
  serverId: number,
): string {
  const mainDb = getMainDb(config);
  const row = mainDb.query(`SELECT postmaster_address FROM servers WHERE id = ?`).get(serverId) as
    | { postmaster_address: string | null }
    | undefined;

  return row?.postmaster_address || config.smtp.from_address;
}

function notificationFromAddress(config: PostaConfig): string {
  return `${config.smtp.from_name} <${config.smtp.from_address}>`;
}

export function sendServerSendLimitApproachingEmail(
  config: PostaConfig,
  serverId: number,
  serverName: string,
  sendLimit: number,
  sentToday: number,
): number {
  const provisioner = new MessageDbProvisioner(config);
  const recipient = resolveNotificationRecipient(config, serverId);
  const from = notificationFromAddress(config);

  const subject = `[${serverName}] Mail server is approaching its send limit`;
  const body = [
    `Your mail server "${serverName}" is approaching its send limit.`,
    '',
    `Current usage: ${sentToday} / ${sendLimit} messages today.`,
    '',
    `Once the limit is reached, outgoing messages will be held for delivery`,
    `until the limit resets or is increased.`,
    '',
    `Please review your sending patterns and consider increasing the limit`,
    `if this is expected behaviour.`,
    '',
    `-- `,
    `Posta`,
    '',
  ].join('\r\n');

  const rawMessage = buildMimeMessage({
    from, to: recipient, subject, body,
    returnPathDomain: config.dns.return_path_domain,
  });

  return storeAndQueue(config, provisioner, serverId, rawMessage, {
    rcptTo: recipient, mailFrom: config.smtp.from_address, subject,
  });
}

export function sendServerSendLimitExceededEmail(
  config: PostaConfig,
  serverId: number,
  serverName: string,
  sendLimit: number,
  sentToday: number,
): number {
  const provisioner = new MessageDbProvisioner(config);
  const recipient = resolveNotificationRecipient(config, serverId);
  const from = notificationFromAddress(config);

  const subject = `[${serverName}] Mail server has exceeded its send limit`;
  const body = [
    `Your mail server "${serverName}" has exceeded its send limit.`,
    '',
    `Current usage: ${sentToday} / ${sendLimit} messages today.`,
    '',
    `Outgoing messages will now be held for delivery until the limit resets`,
    `or is increased.`,
    '',
    `Please review your sending patterns and take appropriate action.`,
    '',
    '-- ',
    'Posta',
    '',
  ].join('\r\n');

  const rawMessage = buildMimeMessage({
    from, to: recipient, subject, body,
    returnPathDomain: config.dns.return_path_domain,
  });

  return storeAndQueue(config, provisioner, serverId, rawMessage, {
    rcptTo: recipient, mailFrom: config.smtp.from_address, subject,
  });
}

export function sendServerSuspendedEmail(
  config: PostaConfig,
  serverId: number,
  serverName: string,
  reason: string,
): number {
  const provisioner = new MessageDbProvisioner(config);
  const recipient = resolveNotificationRecipient(config, serverId);
  const from = notificationFromAddress(config);

  const subject = `[${serverName}] Your mail server has been suspended`;
  const body = [
    `Your mail server "${serverName}" has been suspended.`,
    '',
    `Reason: ${reason}`,
    '',
    `While suspended, the server will not accept or deliver any messages.`,
    `Please contact your administrator to resolve this issue.`,
    '',
    '-- ',
    'Posta',
    '',
  ].join('\r\n');

  const rawMessage = buildMimeMessage({
    from, to: recipient, subject, body,
    returnPathDomain: config.dns.return_path_domain,
  });

  return storeAndQueue(config, provisioner, serverId, rawMessage, {
    rcptTo: recipient, mailFrom: config.smtp.from_address, subject,
  });
}

export function sendTestEmail(
  config: PostaConfig,
  serverId: number,
  to: string,
  from: string,
): number {
  const provisioner = new MessageDbProvisioner(config);

  const subject = 'Posta SMTP Test Message';
  const body = [
    'This is a test message sent by Posta.',
    '',
    'If you have received this message, your SMTP configuration is working correctly.',
    '',
    `Sent at: ${new Date().toISOString()}`,
    '',
    '-- ',
    'Posta',
    '',
  ].join('\r\n');

  const rawMessage = buildMimeMessage({
    from, to, subject, body,
    returnPathDomain: config.dns.return_path_domain,
  });

  return storeAndQueue(config, provisioner, serverId, rawMessage, {
    rcptTo: to, mailFrom: from, subject,
  });
}
