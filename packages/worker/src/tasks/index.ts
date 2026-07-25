import type { PostaConfig } from '@posta/core';
import { getMainDb, DnsResolver } from '@posta/core';
import { MessageDbProvisioner } from '@posta/message-db';
import {
  sendServerSendLimitApproachingEmail,
  sendServerSendLimitExceededEmail,
} from '../mailers';

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

    const domains = mainDb.query(
      `SELECT id, name, spf_status, dkim_status, mx_status, return_path_status
       FROM domains WHERE dns_checked_at IS NOT NULL AND dns_checked_at <= ?`,
    ).all(hourAgo) as any[];

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

        mainDb.run(
          `UPDATE domains SET spf_status = ?, dkim_status = ?, mx_status = ?, return_path_status = ?, dns_checked_at = datetime('now') WHERE id = ?`,
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
    const servers = mainDb.query(`SELECT id FROM servers WHERE deleted_at IS NULL`).all() as any[];

    for (const server of servers) {
      try {
        const msgDb = provisioner.openServerDb(server.id);
        const now = Date.now() / 1000;
        const expired = msgDb.query(
          `SELECT id FROM messages WHERE status = 'Held' AND hold_expiry IS NOT NULL AND hold_expiry < ?`,
          [now],
        ) as any[];

        for (const msg of expired) {
          msgDb.update('messages', { status: 'Bounced', held: 0 }, { where: { id: msg.id } });
          msgDb.insert('deliveries', {
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
    const servers = mainDb.query(
      `SELECT id, message_retention_days, raw_message_retention_days, raw_message_retention_size
       FROM servers WHERE deleted_at IS NULL`,
    ).all() as any[];

    for (const server of servers) {
      try {
        const msgDb = provisioner.openServerDb(server.id);

        if (server.raw_message_retention_days) {
          provisioner.removeOldRawTables(msgDb, server.raw_message_retention_days);
        }
        if (server.raw_message_retention_size) {
          provisioner.removeRawTablesUntilUnderSize(msgDb, server.raw_message_retention_size * 1024 * 1024);
        }
        if (server.message_retention_days) {
          provisioner.removeOldMessages(msgDb, server.message_retention_days);
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
    const result = mainDb.run(`DELETE FROM webhook_requests WHERE created_at < ?`, [cutoff]);
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
    const servers = mainDb.query(`SELECT id FROM servers WHERE deleted_at IS NULL`).all() as any[];

    for (const server of servers) {
      try {
        const msgDb = provisioner.openServerDb(server.id);
        const now = Date.now() / 1000;
        const result = msgDb.delete('suppressions', { where: { keep_until: { less_than: now } } });
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

    const stale = mainDb.query(
      `SELECT id FROM queued_messages WHERE locked_by IS NOT NULL AND locked_at < ?`,
    ).all(cutoff) as any[];

    for (const msg of stale) {
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [msg.id]);
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

    const servers = mainDb.query(
      `SELECT id, name, send_limit, send_limit_approaching_at, send_limit_exceeded_at,
              send_limit_approaching_notified_at, send_limit_exceeded_notified_at
       FROM servers WHERE deleted_at IS NULL AND send_limit IS NOT NULL`,
    ).all() as any[];

    for (const server of servers) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const todayTs = today.getTime() / 1000;

      const count = mainDb.query(
        `SELECT COUNT(*) as count FROM queued_messages q
         INNER JOIN messages m ON m.id = q.message_id
         WHERE q.server_id = ? AND m.timestamp > ?`,
      ).get(server.id, todayTs) as { count: number } | undefined;

      const totalSent = count?.count ?? 0;

      if (totalSent >= server.send_limit * 0.9 && !server.send_limit_approaching_notified_at) {
        console.log(`[worker] server ${server.name} (${server.id}) approaching send limit (${totalSent}/${server.send_limit})`);
        try {
          sendServerSendLimitApproachingEmail(
            config,
            server.id,
            server.name,
            server.send_limit,
            totalSent,
          );
          mainDb.run(`UPDATE servers SET send_limit_approaching_at = datetime('now'), send_limit_approaching_notified_at = datetime('now') WHERE id = ?`, [server.id]);
        } catch (err: any) {
          console.error(`[worker] failed to send approaching notification for server ${server.id}:`, err.message);
        }
      }

      if (totalSent >= server.send_limit && !server.send_limit_exceeded_notified_at) {
        console.log(`[worker] server ${server.name} (${server.id}) exceeded send limit (${totalSent}/${server.send_limit})`);
        try {
          sendServerSendLimitExceededEmail(
            config,
            server.id,
            server.name,
            server.send_limit,
            totalSent,
          );
          mainDb.run(`UPDATE servers SET send_limit_exceeded_at = datetime('now'), send_limit_exceeded_notified_at = datetime('now') WHERE id = ?`, [server.id]);
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

    mainDb.run(`DELETE FROM servers WHERE deleted_at IS NOT NULL AND deleted_at < ?`, [cutoff]);
    mainDb.run(`DELETE FROM organizations WHERE deleted_at IS NOT NULL AND deleted_at < ?`, [cutoff]);

    console.log(`[worker] action deletions complete`);
  },
};

// ─── All tasks ────────────────────────────────────────────

export const ALL_TASKS: ScheduledTask[] = [
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
