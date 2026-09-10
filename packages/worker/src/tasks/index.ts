import type { PostaConfig } from '@posta/core';
import { getMainDb, getServerDb, DnsResolver } from '@posta/core';
import { MessageDbProvisioner } from '@posta/message-db';
import {
  sendServerSendLimitApproachingEmail,
  sendServerSendLimitExceededEmail,
} from '../mailers';
import { maintainPartitionsTask } from './maintain-partitions';

export interface ScheduledTask {
  name: string;
  nextRunAfter(): Date;
  execute(config: PostaConfig): Promise<void>;
}

// ─── Scheduling helpers ─────────────────────────────────

function quarterPastNext(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCMinutes(15, 0, 0);
  if (next <= now) next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

function quarterToNext(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCMinutes(45, 0, 0);
  if (next <= now) next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

function threeAmNext(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(3, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

// ─── Task: CheckAllDNS ────────────────────────────────────
// Re-check DNS for all domains hourly

const checkAllDnsTask: ScheduledTask = {
  name: 'CheckAllDNS',
  nextRunAfter: () => quarterPastNext(),
  async execute(config: PostaConfig) {
    const mainDb = getMainDb(config);
    const hourAgo = new Date(Date.now() - 3600000).toISOString();

    const domains = await mainDb.query(
      `SELECT id, name, spf_status, dkim_status, mx_status, return_path_status
       FROM domains WHERE dns_checked_at IS NOT NULL AND dns_checked_at <= $1`,
      [hourAgo],
    ) as any[];

    if (domains.length === 0) return;

    const resolver = DnsResolver.local();

    for (const domain of domains) {
      try {
        console.log(`[worker] checking DNS for domain: ${domain.name}`);

        // SPF — look for v=spf1 record
        let spfStatus = 'Unknown';
        try {
          const txtRecords = await resolver.txt(domain.name, 10);
          const hasSpf = txtRecords.some((r) => r.startsWith('v=spf1'));
          spfStatus = hasSpf ? 'OK' : 'Missing';
        } catch { spfStatus = 'Error'; }

        // DKIM — look for the selector
        let dkimStatus = 'Unknown';
        try {
          const dkimName = `${config.dns.dkim_identifier}._domainkey.${domain.name}`;
          const dkimRecords = await resolver.txt(dkimName, 10);
          dkimStatus = dkimRecords.length > 0 ? 'OK' : 'Missing';
        } catch { dkimStatus = 'Error'; }

        // MX
        let mxStatus = 'Unknown';
        try {
          const mxRecords = await resolver.mx(domain.name, 10);
          mxStatus = mxRecords.length > 0 ? 'OK' : 'Missing';
        } catch { mxStatus = 'Error'; }

        // Return-path — look for rp domain TXT
        let returnPathStatus = 'Unknown';
        try {
          const rpDomain = `${config.dns.return_path_domain}`;
          const rpRecords = await resolver.txt(rpDomain, 10);
          const hasRp = rpRecords.some((r) => r.includes(domain.name));
          returnPathStatus = hasRp ? 'OK' : 'Missing';
        } catch { returnPathStatus = 'Error'; }

        await mainDb.run(
          `UPDATE domains SET spf_status = $1, dkim_status = $2, mx_status = $3, return_path_status = $4, dns_checked_at = NOW() WHERE id = $5`,
          [spfStatus, dkimStatus, mxStatus, returnPathStatus, domain.id],
        );

        console.log(`[worker] domain ${domain.name}: SPF=${spfStatus} DKIM=${dkimStatus} MX=${mxStatus} RP=${returnPathStatus}`);
      } catch (err: any) {
        console.error(`[worker] DNS check error for ${domain.name}:`, err.message);
      }
    }
  },
};

// ─── Task: ExpireHeldMessages ─────────────────────────────
// Release or bounce held messages past expiry (every 15 min)

const expireHeldMessagesTask: ScheduledTask = {
  name: 'ExpireHeldMessages',
  nextRunAfter: () => quarterPastNext(),
  async execute(config: PostaConfig) {
    const provisioner = new MessageDbProvisioner(config);
    const mainDb = getMainDb(config);
    const servers = await mainDb.query(`SELECT id FROM servers WHERE deleted_at IS NULL`) as any[];

    for (const server of servers) {
      try {
        const client = getServerDb(config, server.id);
        const msgDb = await provisioner.openServerDb(server.id, client);
        const now = Date.now() / 1000;
        const expired = await msgDb.query(
          `SELECT id FROM messages WHERE status = 'Held' AND hold_expiry IS NOT NULL AND hold_expiry < $1`,
          [now],
        ) as any[];

        for (const msg of expired) {
          await msgDb.update('messages', { status: 'Bounced', held: 0 }, { where: { id: msg.id } });
          await msgDb.insert('deliveries', {
            message_id: msg.id,
            status: 'Bounced',
            details: 'Message expired',
            timestamp: now,
          });
        }

        if (expired.length > 0) {
          console.log(`[worker] expired ${expired.length} held messages on server ${server.id}`);
        }
      } catch { /* server DB not yet created */ }
    }
  },
};

// ─── Task: ProcessMessageRetention ────────────────────────
// Delete old messages per retention policy (daily at 3am)

const processMessageRetentionTask: ScheduledTask = {
  name: 'ProcessMessageRetention',
  nextRunAfter: () => threeAmNext(),
  async execute(config: PostaConfig) {
    const provisioner = new MessageDbProvisioner(config);
    const mainDb = getMainDb(config);
    const servers = await mainDb.query(
      `SELECT id, message_retention_days, raw_message_retention_days, raw_message_retention_size
       FROM servers WHERE deleted_at IS NULL`,
    ) as any[];

    for (const server of servers) {
      try {
        const client = getServerDb(config, server.id);
        const msgDb = await provisioner.openServerDb(server.id, client);

        if (server.raw_message_retention_days) {
          await provisioner.removeOldRawTables(msgDb, server.raw_message_retention_days);
        }
        if (server.raw_message_retention_size) {
          await provisioner.removeRawTablesUntilUnderSize(msgDb, server.raw_message_retention_size * 1024 * 1024);
        }
        if (server.message_retention_days) {
          await provisioner.removeOldMessages(msgDb, server.message_retention_days);
        }

        console.log(`[worker] retention processed for server ${server.id}`);
      } catch { /* server DB not yet created */ }
    }
  },
};

// ─── Task: PruneWebhookRequests ──────────────────────────
// Delete old webhook request records (hourly)
// webhook_requests is in the MAIN DB, not per-server message DBs

const pruneWebhookRequestsTask: ScheduledTask = {
  name: 'PruneWebhookRequests',
  nextRunAfter: () => quarterToNext(),
  async execute(config: PostaConfig) {
    const mainDb = getMainDb(config);
    const cutoff = new Date(Date.now() - 10 * 86400000).toISOString();
    await mainDb.run(`DELETE FROM webhook_requests WHERE created_at < $1`, [cutoff]);
    console.log(`[worker] pruned webhook requests older than 10 days`);
  },
};

// ─── Task: PruneSuppressionLists ─────────────────────────
// Remove expired suppressions (daily)

const pruneSuppressionListsTask: ScheduledTask = {
  name: 'PruneSuppressionLists',
  nextRunAfter: () => threeAmNext(),
  async execute(config: PostaConfig) {
    const provisioner = new MessageDbProvisioner(config);
    const mainDb = getMainDb(config);
    const servers = await mainDb.query(`SELECT id FROM servers WHERE deleted_at IS NULL`) as any[];

    for (const server of servers) {
      try {
        const client = getServerDb(config, server.id);
        const msgDb = await provisioner.openServerDb(server.id, client);
        const now = Date.now() / 1000;
        await msgDb.delete('suppressions', { where: { keep_until: { less_than: now } } });
        console.log(`[worker] pruned suppressions for server ${server.id}`);
      } catch { /* server DB not yet created */ }
    }
  },
};

// ─── Task: CleanupAuthieSessions ─────────────────────────
// No-op — Clerk replaced Authie (Phase 9)

const cleanupAuthieSessionsTask: ScheduledTask = {
  name: 'CleanupAuthieSessions',
  nextRunAfter: () => quarterPastNext(),
  async execute() {
    // No-op — Clerk handles session management
  },
};

// ─── Task: TidyQueuedMessages ─────────────────────────────
// Clean stale locked messages (every 15 min)

const tidyQueuedMessagesTask: ScheduledTask = {
  name: 'TidyQueuedMessages',
  nextRunAfter: () => quarterToNext(),
  async execute(config: PostaConfig) {
    const mainDb = getMainDb(config);
    const staleThreshold = config.posta.queued_message_lock_stale_days ?? 1;
    const cutoff = new Date(Date.now() - staleThreshold * 86400000).toISOString();

    const stale = await mainDb.query(
      `SELECT id FROM queued_messages WHERE locked_by IS NOT NULL AND locked_at < $1`,
      [cutoff],
    ) as any[];

    for (const msg of stale) {
      await mainDb.run(`DELETE FROM queued_messages WHERE id = $1`, [msg.id]);
    }

    if (stale.length > 0) {
      console.log(`[worker] tidied ${stale.length} stale queued messages`);
    }
  },
};

// ─── Task: SendNotifications ──────────────────────────────
// Email send-limit alerts (hourly)

const sendNotificationsTask: ScheduledTask = {
  name: 'SendNotifications',
  nextRunAfter: () => quarterPastNext(),
  async execute(config: PostaConfig) {
    const mainDb = getMainDb(config);

    const servers = await mainDb.query(
      `SELECT id, name, send_limit, send_limit_approaching_at, send_limit_exceeded_at,
              send_limit_approaching_notified_at, send_limit_exceeded_notified_at
       FROM servers WHERE deleted_at IS NULL AND send_limit IS NOT NULL`,
    ) as any[];

    for (const server of servers) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const todayTs = today.getTime() / 1000;

      const count = await mainDb.get(
        `SELECT COUNT(*) as count FROM queued_messages q
         INNER JOIN messages m ON m.id = q.message_id
         WHERE q.server_id = $1 AND m.timestamp > $2`,
        [server.id, todayTs],
      ) as { count: number } | undefined;

      const totalSent = count?.count ?? 0;

      if (totalSent >= server.send_limit * 0.9 && !server.send_limit_approaching_notified_at) {
        console.log(`[worker] server ${server.name} (${server.id}) approaching send limit (${totalSent}/${server.send_limit})`);
        try {
          await sendServerSendLimitApproachingEmail(
            config,
            server.id,
            server.name,
            server.send_limit,
            totalSent,
          );
          await mainDb.run(`UPDATE servers SET send_limit_approaching_at = NOW(), send_limit_approaching_notified_at = NOW() WHERE id = $1`, [server.id]);
        } catch (err: any) {
          console.error(`[worker] failed to send approaching notification for server ${server.id}:`, err.message);
        }
      }

      if (totalSent >= server.send_limit && !server.send_limit_exceeded_notified_at) {
        console.log(`[worker] server ${server.name} (${server.id}) exceeded send limit (${totalSent}/${server.send_limit})`);
        try {
          await sendServerSendLimitExceededEmail(
            config,
            server.id,
            server.name,
            server.send_limit,
            totalSent,
          );
          await mainDb.run(`UPDATE servers SET send_limit_exceeded_at = NOW(), send_limit_exceeded_notified_at = NOW() WHERE id = $1`, [server.id]);
        } catch (err: any) {
          console.error(`[worker] failed to send exceeded notification for server ${server.id}:`, err.message);
        }
      }
    }
  },
};

// ─── Task: ActionDeletions ────────────────────────────────
// Permanently delete soft-deleted records (daily)

const actionDeletionsTask: ScheduledTask = {
  name: 'ActionDeletions',
  nextRunAfter: () => threeAmNext(),
  async execute(config: PostaConfig) {
    const mainDb = getMainDb(config);
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();

    await mainDb.run(`DELETE FROM servers WHERE deleted_at IS NOT NULL AND deleted_at < $1`, [cutoff]);
    await mainDb.run(`DELETE FROM organizations WHERE deleted_at IS NOT NULL AND deleted_at < $1`, [cutoff]);

    console.log(`[worker] action deletions complete`);
  },
};

// ─── All tasks ────────────────────────────────────────────

export const ALL_TASKS: ScheduledTask[] = [
  maintainPartitionsTask,
  checkAllDnsTask,
  expireHeldMessagesTask,
  processMessageRetentionTask,
  pruneWebhookRequestsTask,
  pruneSuppressionListsTask,
  cleanupAuthieSessionsTask,
  tidyQueuedMessagesTask,
  sendNotificationsTask,
  actionDeletionsTask,
];
