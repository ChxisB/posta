import type { PostaConfig } from '@posta/core';
import { getMainDb, getServerDb, HttpClient, Signer } from '@posta/core';
import { FailureReason, computeRetryDelay, BackoffStrategy } from '@posta/core';
import type { FailureReasonType } from '@posta/core';
import { readFileSync } from 'node:fs';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 3;

/**
 * ProcessWebhookRequests job.
 *
 * Fetches pending webhook requests, POSTs signed payloads to the destination URL,
 * and handles retries with jitter backoff.
 */
export async function processWebhookRequestsJob(config: PostaConfig): Promise<boolean> {
  const mainDb = getMainDb(config);
  const locker = `webhook-${process.pid}-${Date.now().toString(36)}`;
  const lockTime = new Date().toISOString();

  await mainDb.run(`
    UPDATE webhook_requests
    SET locked_by = $1, locked_at = $2, attempts = COALESCE(attempts, 0) + 1
    WHERE id IN (
      SELECT id FROM webhook_requests
      WHERE locked_by IS NULL
        AND locked_at IS NULL
        AND (retry_after IS NULL OR retry_after <= NOW())
      ORDER BY created_at ASC
      LIMIT $3
    )
  `, [locker, lockTime, BATCH_SIZE]);

  const requests = await mainDb.query(
    `SELECT * FROM webhook_requests WHERE locked_by = $1 AND locked_at = $2`,
    [locker, lockTime],
  ) as any[];

  if (requests.length === 0) return false;

  // Load the signing key once
  const signingKey = loadSigningKey(config);

  await Promise.allSettled(
    requests.map((req) => deliverWebhook(config, req, signingKey, locker)),
  );

  return true;
}

function loadSigningKey(config: PostaConfig): string | null {
  try {
    const keyPath = config.posta.signing_key_path;
    if (!keyPath) return null;
    return readFileSync(keyPath, 'utf-8');
  } catch {
    return null;
  }
}

async function deliverWebhook(
  config: PostaConfig,
  request: any,
  signingKey: string | null,
  locker: string,
): Promise<void> {
  const mainDb = getMainDb(config);
  const startTime = Date.now();
  const attemptNum = request.attempts ?? 1;

  try {
    // ── Load the payload ────────────────────────────────────
    const payload = request.payload ?? '{}';
    const url = request.url;

    if (!url) {
      await mainDb.run(`DELETE FROM webhook_requests WHERE id = $1`, [request.id]);
      console.log(`[worker] webhook ${request.id}: no URL, removing`);
      return;
    }

    // ── Build headers ───────────────────────────────────────
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Posta/4.0',
    };

    // ── Sign the payload ────────────────────────────────────
    if (signingKey) {
      try {
        const signer = new Signer(signingKey);
        const jwk = await signer.getJwk();
        headers['X-Posta-Signature-KID'] = jwk.kid ?? '';
        headers['X-Posta-Signature'] = await signer.sha1Sign64(payload);
        headers['X-Posta-Signature-256'] = await signer.sign64(payload);
      } catch (err: any) {
        console.error(`[worker] webhook ${request.id}: signing failed:`, err.message);
      }
    }

    // ── HTTP POST ───────────────────────────────────────────
    const client = new HttpClient(config);
    const response = await client.post(url, {
      headers,
      json: payload,
      timeout: 30,
    });

    const duration = Date.now() - startTime;
    const success = response.code >= 200 && response.code < 300;

    // ── Record attempt in per-server MessageDB ──────────────
    try {
      const webhook = await mainDb.get(`SELECT server_id FROM webhooks WHERE id = $1`, [request.webhook_id]) as any;
      if (webhook?.server_id) {
        const { MessageDbProvisioner, WebhookStore } = await import('@posta/message-db');
        const provisioner = new MessageDbProvisioner(config);
        const msgClient = getServerDb(config, webhook.server_id);
        const msgDb = await provisioner.openServerDb(webhook.server_id, msgClient);
        await new WebhookStore(msgDb).record({
          uuid: request.uuid,
          event: request.event,
          attempt: attemptNum,
          timestamp: Date.now() / 1000,
          status_code: response.code,
          body: response.body?.slice(0, 10000),
          payload: request.payload,
          will_retry: !success && attemptNum < MAX_ATTEMPTS,
          url: request.url,
          webhook_id: request.webhook_id,
        });
      }
    } catch (err: any) {
      console.error(`[worker] webhook ${request.id}: failed to record in MessageDB: ${err.message}`);
    }

    // ── Record result in main DB ────────────────────────────
    if (success) {
      await mainDb.run(`DELETE FROM webhook_requests WHERE id = $1`, [request.id]);
      console.log(`[worker] webhook ${request.id} delivered to ${url} (${response.code})`);
    } else {
      const error = `HTTP ${response.code}: ${response.body.slice(0, 200)}`;
      await mainDb.run(
        `UPDATE webhook_requests SET error = $1 WHERE id = $2`,
        [error, request.id],
      );
      await retryWebhook(mainDb, request, FailureReason.SoftFail,
        error, attemptNum, startTime, locker);
    }
  } catch (err: any) {
    console.error(`[worker] webhook ${request.id} error:`, err.message);
    await retryWebhook(mainDb, request, FailureReason.Timeout,
      err.message, attemptNum, startTime, locker);
  }
}

async function retryWebhook(
  db: ReturnType<typeof getMainDb>,
  req: any,
  reason: FailureReasonType,
  error: string | null,
  attempt: number,
  startedAt: number,
  locker: string,
): Promise<void> {
  if (attempt >= MAX_ATTEMPTS) {
    await db.run(`DELETE FROM webhook_requests WHERE id = $1`, [req.id]);
    console.log(`[worker] webhook ${req.id}: final failure after ${MAX_ATTEMPTS} attempts (${reason}): ${error}`);
    return;
  }

  // Jitter backoff prevents thundering herd on webhook server restarts
  const delaySec = Math.floor(computeRetryDelay(BackoffStrategy.JITTER, attempt, 60_000, 600_000) / 1000);
  await db.run(
    `UPDATE webhook_requests SET retry_after = NOW() + interval '${delaySec} seconds', locked_by = NULL, locked_at = NULL WHERE id = $1`,
    [req.id],
  );
  console.log(`[worker] webhook ${req.id}: retry ${attempt}/${MAX_ATTEMPTS} in ${delaySec}s (${reason})`);
}
