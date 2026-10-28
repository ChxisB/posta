import { schema } from "@posta/db";
import { eq } from "drizzle-orm";
import { encryptEmailBody } from "../crypto/envelope.js";
import { evaluateEmailInsights, SCORE_VERSION } from "../email-insights.js";
import { hashRecipient } from "../suppressions.js";
import {
  buildWebhookPayload,
  encryptWebhookSecret,
  generateWebhookSecret,
  WEBHOOK_MAX_ATTEMPTS,
  type WebhookEventType,
} from "../webhooks.js";
import { BROADCASTS, DEMO_SENDER_DOMAIN, TRANSACTIONAL_KINDS } from "./content.js";
import { clampToCap, DAY_MS, type DemoCtx, HOUR_MS } from "./context.js";
import type { DemoUsage } from "./usage.js";
import type { DemoContact, Workspace } from "./workspace.js";

type EmailStatus = (typeof schema.emailStatusEnum.enumValues)[number];
type EventType = (typeof schema.emailEventTypeEnum.enumValues)[number];

interface SimEvent {
  type: EventType;
  at: Date;
  bounceType?: "Permanent" | "Transient";
  data: Record<string, unknown>;
}

interface SimEmail {
  id: string;
  createdAt: Date;
  sentAt: Date | null;
  status: EmailStatus;
  to: string;
  contact: DemoContact | null;
  subject: string;
  template: string;
  tags: Record<string, string> | null;
  link: string;
  broadcast: boolean;
  apiKeyId: string | null;
  sesMessageId: string | null;
  events: SimEvent[];
}

type Fate = "delivered" | "hard_bounce" | "soft_bounce" | "complaint" | "suppressed";

const CHUNK = 500;
const USER_AGENTS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
];

async function insertChunked<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
}

const sizeLabel = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : `${Number((bytes / 1024).toFixed(1))} KB`;

/**
 * About fifteen days of mail as a stream of events first; every row, counter,
 * log line and webhook delivery below is written from that one stream.
 */
export async function seedTraffic(ctx: DemoCtx, ws: Workspace, usage: DemoUsage): Promise<void> {
  const { db, rng, now, teamId, keyring } = ctx;
  const t = schema;
  const from = {
    tx: `Acme <notifications@${DEMO_SENDER_DOMAIN}>`,
    bulk: `Acme <hello@${DEMO_SENDER_DOMAIN}>`,
  };

  // Addresses already on the do-not-contact list, and the hand-made entries.
  const unsubscribed = ws.contacts.filter((c) => c.unsubscribed);
  const blockedByList = rng.shuffle(ws.contacts.filter((c) => !c.unsubscribed)).slice(0, 3);
  const manual = blockedByList.slice(0, 2);
  const oldBounce = blockedByList[2];
  const oneClick = unsubscribed.slice(0, 2);
  const blocked = new Set(
    [...manual, ...(oldBounce ? [oldBounce] : []), ...oneClick].map((c) => c.email),
  );
  const suppressions = new Map<
    string,
    {
      email: string;
      reason: (typeof t.suppressionReasonEnum.enumValues)[number];
      sourceEmailId: string | null;
      createdAt: Date;
    }
  >();
  const addSuppression = (
    email: string,
    reason: (typeof t.suppressionReasonEnum.enumValues)[number],
    sourceEmailId: string | null,
    createdAt: Date,
  ) => {
    const key = hashRecipient(email);
    if (!suppressions.has(key)) suppressions.set(key, { email, reason, sourceEmailId, createdAt });
  };
  const daysAgo = (d: number) => new Date(now.getTime() - d * DAY_MS);
  for (const c of manual) addSuppression(c.email, "manual", null, daysAgo(9));
  if (oldBounce) addSuppression(oldBounce.email, "hard_bounce", null, daysAgo(12));
  for (const c of oneClick) addSuppression(c.email, "one_click_unsubscribe", null, daysAgo(7));

  // Slots: when each email is created, before anything is decided about it.
  const midnight = new Date(now);
  midnight.setUTCHours(0, 0, 0, 0);
  const slots: { createdAt: Date; broadcast: boolean; contact: DemoContact | null }[] = [];
  for (let d = 14; d >= 0; d--) {
    const dayStart = midnight.getTime() - d * DAY_MS;
    const weekday = new Date(dayStart).getUTCDay();
    const count = Math.round(
      68 * (weekday === 0 || weekday === 6 ? 0.5 : 1) * (0.8 + rng.next() * 0.4),
    );
    for (let i = 0; i < count; i++) {
      const hour = 6 + Math.floor((rng.next() + rng.next()) * 8.5);
      const createdAt = new Date(dayStart + hour * HOUR_MS + rng.int(0, HOUR_MS - 1));
      if (createdAt.getTime() <= ctx.cap.getTime())
        slots.push({ createdAt, broadcast: false, contact: null });
    }
  }
  const sentBroadcastAt = daysAgo(5);
  const audience = ws.contacts.filter(
    (c) =>
      !c.unsubscribed &&
      c.subscribedTopicIds.includes(ws.topicIds.updates) &&
      !blocked.has(c.email),
  );
  audience.forEach((contact, i) => {
    slots.push({
      createdAt: new Date(sentBroadcastAt.getTime() + i * 1_500),
      broadcast: true,
      contact,
    });
  });
  slots.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Decide each slot in order, so an address that bounced or complained is never mailed again.
  const kindTotal = TRANSACTIONAL_KINDS.reduce((n, k) => n + k.weight, 0);
  const pickKind = () => {
    let roll = rng.next() * kindTotal;
    for (const k of TRANSACTIONAL_KINDS) {
      roll -= k.weight;
      if (roll < 0) return k;
    }
    return TRANSACTIONAL_KINDS[0] as (typeof TRANSACTIONAL_KINDS)[number];
  };
  const emails: SimEmail[] = [];
  let bulkSeen = 0;
  let suppressedTx = 0;
  for (const slot of slots) {
    const kind = slot.broadcast ? null : pickKind();
    let contact = slot.contact;
    if (!contact) {
      for (let tries = 0; tries < 8; tries++) {
        const pick = rng.pick(ws.contacts);
        if (!blocked.has(pick.email)) {
          contact = pick;
          break;
        }
      }
    } else if (blocked.has(contact.email)) {
      continue;
    }
    if (!contact) continue;
    const id = rng.uuid();
    let fate: Fate = "delivered";
    if (slot.broadcast) {
      bulkSeen++;
      if (bulkSeen === 41) fate = "complaint";
      else if (rng.chance(0.012)) fate = "hard_bounce";
      else if (rng.chance(0.004)) fate = "soft_bounce";
    } else {
      if (suppressedTx < 3 && slot.createdAt.getTime() > daysAgo(8).getTime() && rng.chance(0.01)) {
        // To an address on the list: stopped before it was sent.
        const listed = manual[suppressedTx % manual.length];
        if (listed) {
          contact = listed;
          fate = "suppressed";
          suppressedTx++;
        }
      } else if (rng.chance(0.011)) fate = "hard_bounce";
      else if (rng.chance(0.004)) fate = "soft_bounce";
    }

    const created = slot.createdAt;
    const events: SimEvent[] = [];
    const at = (base: Date, plus: number) => clampToCap(ctx, base.getTime() + plus);
    let sentAt: Date | null = null;
    let status: EmailStatus = "delivered";
    if (fate === "suppressed") {
      status = "suppressed";
      events.push({ type: "suppressed", at: created, data: { reason: "manual" } });
    } else {
      sentAt = at(created, rng.int(800, 4_000));
      events.push({ type: "sent", at: sentAt, data: { source: "worker" } });
      if (fate === "hard_bounce" || fate === "soft_bounce") {
        const permanent = fate === "hard_bounce";
        const bouncedAt = at(sentAt, rng.int(2_000, 30_000));
        status = "bounced";
        events.push({
          type: "bounced",
          at: bouncedAt,
          bounceType: permanent ? "Permanent" : "Transient",
          data: {
            bounce: {
              bounceType: permanent ? "Permanent" : "Transient",
              bounceSubType: permanent ? "General" : "MailboxFull",
              diagnosticCode: permanent
                ? "smtp; 550 5.1.1 The email account that you tried to reach does not exist"
                : "smtp; 452 4.2.2 The recipient's inbox is full",
            },
          },
        });
        if (permanent) addSuppression(contact.email, "hard_bounce", id, bouncedAt);
      } else {
        const deliveredAt = at(sentAt, rng.int(1_000, 6_000));
        events.push({
          type: "delivered",
          at: deliveredAt,
          data: {
            delivery: { timestamp: deliveredAt.toISOString(), smtpResponse: "250 2.0.0 OK" },
          },
        });
        const engaged = (p: number) => rng.chance(p);
        const delay = (meanMs: number) => Math.round(-Math.log(1 - rng.next()) * meanMs) + 60_000;
        const hit = () => ({
          ipAddress: `203.0.113.${rng.int(1, 254)}`,
          userAgent: rng.pick(USER_AGENTS),
        });
        let openedAt: Date | null = null;
        if (engaged(slot.broadcast ? 0.38 : 0.46)) {
          const when = deliveredAt.getTime() + delay(90 * 60_000);
          if (when <= ctx.cap.getTime()) {
            openedAt = new Date(when);
            status = "opened";
            events.push({
              type: "opened",
              at: openedAt,
              data: { open: { ...hit(), timestamp: openedAt.toISOString() } },
            });
          }
        }
        if (openedAt && engaged(0.22)) {
          const when = openedAt.getTime() + rng.int(5_000, 20 * 60_000);
          if (when <= ctx.cap.getTime()) {
            const clickedAt = new Date(when);
            status = "clicked";
            events.push({
              type: "clicked",
              at: clickedAt,
              data: {
                click: {
                  ...hit(),
                  timestamp: clickedAt.toISOString(),
                  link: kind?.link ?? "https://acme.test/changelog",
                },
              },
            });
          }
        }
        if (fate === "complaint") {
          const complainedAt = at(deliveredAt, rng.int(HOUR_MS, 2 * DAY_MS));
          status = "complained";
          events.push({
            type: "complained",
            at: complainedAt,
            data: { complaint: { complaintFeedbackType: "abuse" } },
          });
          addSuppression(contact.email, "complaint", id, complainedAt);
        }
      }
    }
    if (fate === "hard_bounce" || fate === "complaint") blocked.add(contact.email);

    emails.push({
      id,
      createdAt: created,
      sentAt,
      status,
      to: contact.email,
      contact: slot.broadcast ? contact : null,
      subject: slot.broadcast ? BROADCASTS.sent.subject : (kind?.subject ?? ""),
      template: slot.broadcast ? BROADCASTS.sent.template : (kind?.template ?? "welcome"),
      tags: slot.broadcast ? null : (kind?.tags ?? null),
      link: kind?.link ?? "https://acme.test/changelog",
      broadcast: slot.broadcast,
      apiKeyId: slot.broadcast
        ? null
        : rng.chance(0.7)
          ? ws.apiKeyIds.production
          : ws.apiKeyIds.backend,
      sesMessageId: sentAt ? `demo-${rng.hex(24)}` : null,
      events,
    });
  }

  // Counters come from the stream, one bump per event.
  for (const e of emails) {
    usage.bump(e.createdAt, "accepted");
    for (const ev of e.events) {
      if (ev.type === "sent") usage.bump(ev.at, "sent");
      else if (ev.type === "delivered") usage.bump(ev.at, "delivered");
      else if (ev.type === "bounced") {
        usage.bump(ev.at, "bounced");
        if (ev.bounceType === "Permanent") usage.bump(ev.at, "hardBounced");
      } else if (ev.type === "complained") usage.bump(ev.at, "complained");
      else if (ev.type === "opened") usage.bump(ev.at, "opened");
      else if (ev.type === "clicked") usage.bump(ev.at, "clicked");
    }
  }

  // Emails, bodies sealed the way a real send seals them.
  const domainId = ws.verifiedDomainId;
  const emailRows = [];
  for (const e of emails) {
    const tpl = ws.templates.get(e.template);
    const sealed = await encryptEmailBody(
      { html: tpl?.html ?? null, text: tpl?.text ?? null },
      keyring,
      { teamId, rowId: e.id },
    );
    emailRows.push({
      id: e.id,
      teamId,
      domainId,
      apiKeyId: e.apiKeyId,
      broadcastId: e.broadcast ? ws.broadcastIds.sent : null,
      contactId: e.contact?.id ?? null,
      topicId: e.broadcast ? ws.topicIds.updates : null,
      sesMessageId: e.sesMessageId,
      from: e.broadcast ? from.bulk : from.tx,
      to: [e.to],
      subject: e.subject,
      tags: e.tags,
      headers: e.broadcast
        ? { "List-Unsubscribe": `<https://${DEMO_SENDER_DOMAIN}/unsubscribe/demo>` }
        : null,
      latestStatus: e.status,
      bodyCiphertext: sealed.ciphertext,
      bodyIv: sealed.iv,
      bodyWrappedDek: sealed.wrappedDek,
      bodyKeyVersion: sealed.keyVersion,
      createdAt: e.createdAt,
      sentAt: e.sentAt,
    });
  }
  await insertChunked(emailRows, (chunk) => db.insert(t.emails).values(chunk));
  await insertChunked(
    emails.flatMap((e) =>
      e.events.map((ev) => ({
        emailId: e.id,
        type: ev.type,
        occurredAt: ev.at,
        bounceType: ev.bounceType ?? null,
        data: ev.data,
        createdAt: ev.at,
      })),
    ),
    (chunk) => db.insert(t.emailEvents).values(chunk),
  );
  await insertChunked([...suppressions.values()], (chunk) =>
    db.insert(t.suppressions).values(
      chunk.map((s) => ({
        teamId,
        email: s.email,
        emailHash: hashRecipient(s.email),
        reason: s.reason,
        sourceEmailId: s.sourceEmailId,
        createdAt: s.createdAt,
      })),
    ),
  );

  // The sent broadcast's totals are the sum of its emails.
  const bulk = emails.filter((e) => e.broadcast);
  const has = (e: SimEmail, type: EventType) => e.events.some((ev) => ev.type === type);
  await db
    .update(t.broadcasts)
    .set({
      recipientCount: bulk.length,
      audienceCount: bulk.length,
      deliveredCount: bulk.filter((e) => has(e, "delivered")).length,
      bouncedCount: bulk.filter((e) => has(e, "bounced")).length,
      complainedCount: bulk.filter((e) => has(e, "complained")).length,
    })
    .where(eq(t.broadcasts.id, ws.broadcastIds.sent));

  await seedInsights(ctx, ws, emails);
  await seedRequestLog(ctx, ws, emails);
  await seedWebhooks(ctx, emails);
}

/** Scores for a few of each kind of mail and for the sent broadcast, from the real engine. */
async function seedInsights(ctx: DemoCtx, ws: Workspace, emails: SimEmail[]) {
  const { db, teamId, now } = ctx;
  const score = (html: string | null, text: string | null, subject: string, bulk: boolean) => {
    const result = evaluateEmailInsights({
      html,
      preTrackingHtml: html,
      text,
      from: bulk
        ? `Acme <hello@${DEMO_SENDER_DOMAIN}>`
        : `Acme <notifications@${DEMO_SENDER_DOMAIN}>`,
      senderDomain: DEMO_SENDER_DOMAIN,
      subject,
      finalHeaders: bulk
        ? {
            "List-Unsubscribe": `<https://${DEMO_SENDER_DOMAIN}/unsubscribe/demo>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : {},
      hasAttachments: false,
      replyTo: null,
      isBroadcast: bulk,
      hasTopic: bulk,
      tracking: {
        clickEnabled: true,
        openEnabled: true,
        brandedHostUsed: true,
        sharedFallbackUsed: false,
        shippedUntracked: false,
      },
      domainSnapshot: {
        dmarcPolicy: "quarantine",
        dmarcCheckedAt: new Date(now.getTime() - DAY_MS),
      },
      now,
    });
    return {
      marketing: result.marketing,
      checks: result.checks as schema.EmailInsightCheck[],
      scoreTenths: result.scoreTenths,
      scoreVersion: SCORE_VERSION,
      htmlSizeBytes: html ? Buffer.byteLength(html) : null,
      mimeSizeBytes: Buffer.byteLength(html ?? "") + Buffer.byteLength(text ?? "") + 1_200,
    };
  };
  const rows: (typeof schema.emailInsights.$inferInsert)[] = [];
  const sent = ws.templates.get(BROADCASTS.sent.template);
  rows.push({
    teamId,
    broadcastId: ws.broadcastIds.sent,
    ...score(sent?.html ?? null, sent?.text ?? null, BROADCASTS.sent.subject, true),
    computedAt: new Date(now.getTime() - 5 * DAY_MS),
  });
  const perKind = new Map<string, number>();
  for (const e of emails) {
    if (e.broadcast || (perKind.get(e.subject) ?? 0) >= 3) continue;
    perKind.set(e.subject, (perKind.get(e.subject) ?? 0) + 1);
    const tpl = ws.templates.get(e.template);
    rows.push({
      teamId,
      emailId: e.id,
      ...score(tpl?.html ?? null, tpl?.text ?? null, e.subject, false),
      computedAt: e.createdAt,
    });
  }
  await db.insert(schema.emailInsights).values(rows);
}

/** Logs: the API call behind every transactional email, plus reads and a few refusals. */
async function seedRequestLog(ctx: DemoCtx, ws: Workspace, emails: SimEmail[]) {
  const { db, rng, teamId } = ctx;
  const rows: (typeof schema.apiRequests.$inferInsert)[] = [];
  const at = (e: SimEmail, plus: number) => clampToCap(ctx, e.createdAt.getTime() + plus);
  for (const e of emails) {
    if (e.broadcast) continue;
    const tpl = ws.templates.get(e.template);
    const html = tpl?.html ?? "";
    rows.push({
      teamId,
      apiKeyId: e.apiKeyId,
      method: "POST",
      path: "/emails",
      statusCode: 200,
      durationMs: rng.int(40, 190),
      requestBytes: html.length + 180,
      responseBytes: 53,
      requestBody: {
        from: `Acme <notifications@${DEMO_SENDER_DOMAIN}>`,
        to: [e.to],
        subject: e.subject,
        html: `[html, ${sizeLabel(html.length)}]`,
      },
      responseBody: { id: e.id },
      createdAt: at(e, -200),
    });
    if (rng.chance(0.14)) {
      rows.push({
        teamId,
        apiKeyId: e.apiKeyId,
        method: "GET",
        path: `/emails/${e.id}`,
        statusCode: 200,
        durationMs: rng.int(8, 45),
        requestBytes: 0,
        responseBytes: 420,
        requestBody: null,
        responseBody: { id: e.id, last_event: e.status, subject: e.subject },
        createdAt: at(e, rng.int(60_000, 3_600_000)),
      });
    }
  }
  const refusals = [
    {
      statusCode: 422,
      name: "validation_error",
      message: "The `to` field must be a valid email address.",
    },
    { statusCode: 422, name: "missing_required_field", message: "Missing the `subject` field." },
    { statusCode: 401, name: "invalid_api_key", message: "API key is invalid." },
    { statusCode: 404, name: "not_found", message: "The email could not be found." },
    {
      statusCode: 429,
      name: "rate_limit_exceeded",
      message: "Too many requests. Please try again shortly.",
    },
  ];
  for (let i = 0; i < 16; i++) {
    const e = rng.pick(emails);
    const r = rng.pick(refusals);
    rows.push({
      teamId,
      apiKeyId: r.statusCode === 401 ? null : e.apiKeyId,
      method: r.statusCode === 404 ? "GET" : "POST",
      path: r.statusCode === 404 ? `/emails/${rng.uuid()}` : "/emails",
      statusCode: r.statusCode,
      durationMs: rng.int(6, 40),
      requestBytes: 120,
      responseBytes: 110,
      requestBody: r.statusCode === 404 ? null : { to: ["not-an-address"], subject: e.subject },
      responseBody: { name: r.name, message: r.message, statusCode: r.statusCode },
      createdAt: at(e, 5_000),
    });
  }
  await insertChunked(rows, (chunk) => db.insert(schema.apiRequests).values(chunk));
}

/** Two endpoints: one healthy, one whose receiver keeps failing. All settled, so nothing retries. */
async function seedWebhooks(ctx: DemoCtx, emails: SimEmail[]) {
  const { db, rng, teamId, keyring, now } = ctx;
  const healthy = rng.uuid();
  const failing = rng.uuid();
  const endpoint = async (
    id: string,
    url: string,
    description: string,
    events: string[] | null,
  ) => {
    const secret = generateWebhookSecret();
    const sealed = await encryptWebhookSecret(secret, keyring, { teamId, rowId: id });
    return {
      id,
      teamId,
      url,
      description,
      secretCiphertext: sealed.ciphertext,
      secretIv: sealed.iv,
      secretWrappedDek: sealed.wrappedDek,
      secretKeyVersion: sealed.keyVersion,
      secretLast4: secret.slice(-4),
      events,
      createdAt: new Date(now.getTime() - 17 * DAY_MS),
    };
  };
  await db
    .insert(schema.webhookEndpoints)
    .values([
      await endpoint(healthy, "https://hooks.acme.test/posta", "Production", null),
      await endpoint(failing, "https://staging.acme.test/webhooks/mail", "Staging receiver", [
        "email.bounced",
        "email.complained",
      ]),
    ]);

  const deliveries: (typeof schema.webhookDeliveries.$inferInsert)[] = [];
  const recent = now.getTime() - 3 * DAY_MS;
  for (const e of emails) {
    for (const ev of e.events) {
      if (ev.type === "sent" || ev.type === "suppressed") continue;
      const type = `email.${ev.type}` as WebhookEventType;
      const payload = buildWebhookPayload(
        type,
        {
          emailId: e.id,
          from: `notifications@${DEMO_SENDER_DOMAIN}`,
          to: [e.to],
          subject: e.subject,
        },
        ev.at,
        ev.data,
      );
      const bad = ev.type === "bounced" || ev.type === "complained";
      if (bad) {
        deliveries.push({
          endpointId: failing,
          emailId: e.id,
          messageId: `msg_${rng.hex(24)}`,
          eventType: type,
          payload: payload as unknown as Record<string, unknown>,
          status: "exhausted",
          attempts: WEBHOOK_MAX_ATTEMPTS,
          lastAttemptAt: clampToCap(ctx, ev.at.getTime() + 10 * HOUR_MS),
          lastResponseCode: 502,
          lastResponseBody: "Bad Gateway",
          nextAttemptAt: null,
          createdAt: ev.at,
        });
      }
      if (ev.at.getTime() >= recent && !(ev.type === "opened" && rng.chance(0.5))) {
        deliveries.push({
          endpointId: healthy,
          emailId: e.id,
          messageId: `msg_${rng.hex(24)}`,
          eventType: type,
          payload: payload as unknown as Record<string, unknown>,
          status: "success",
          attempts: 1,
          lastAttemptAt: clampToCap(ctx, ev.at.getTime() + 800),
          lastResponseCode: 200,
          lastResponseBody: null,
          nextAttemptAt: null,
          createdAt: ev.at,
        });
      }
    }
  }
  await insertChunked(deliveries, (chunk) => db.insert(schema.webhookDeliveries).values(chunk));
}
