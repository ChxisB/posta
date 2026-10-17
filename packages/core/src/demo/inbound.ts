import { schema } from "@posta/db";
import { encryptEmailBody, encryptPayload } from "../crypto/envelope.js";
import { sha256Hex } from "../hash.js";
import { encodeInboxActor } from "../inboxes/activity.js";
import { defaultSafety } from "../inboxes/safety.js";
import {
  type ReceivedExtracted,
  sealReceivedAttachments,
  sealReceivedExtracted,
  sealReceivedRaw,
} from "../receiving/message.js";
import { utcDay } from "../utc-day.js";
import { DEMO_SENDER_DOMAIN, INBOUND_SUBJECTS } from "./content.js";
import { clampToCap, DAY_MS, type DemoCtx, HOUR_MS } from "./context.js";
import type { DemoUsage } from "./usage.js";
import type { DemoContact, Workspace } from "./workspace.js";

const BODIES = [
  "Could you resend the invoice for last month? Our finance team can't find it.",
  "Is there a way to fetch every email sent to one address through the API?",
  "We would love to try the beta. Our team of eight is ready to start this week.",
  "Notes from Tuesday are below. Main action: ship the export fix before Friday.",
  "Your verification code is 482913. It expires in ten minutes.",
  "A message to one of our customers could not be delivered. Details attached.",
  "We run a small agency and think there is a good fit between our products.",
  "The new dashboard is much faster. One thing: the filters reset when I go back.",
];

interface Msg {
  at: number;
  inbound: boolean;
}

/** Two agent inboxes with threads, received mail (sealed), replies, labels and a draft. */
export async function seedInbound(ctx: DemoCtx, ws: Workspace, usage: DemoUsage) {
  const { db, rng, keyring, teamId, ownerUserId, cap } = ctx;
  const t = schema;
  const owner = encodeInboxActor({ kind: "user", userId: ownerUserId });
  const at = (days: number, hours = 0) =>
    clampToCap(ctx, cap.getTime() - days * DAY_MS - hours * HOUR_MS);

  const specs = [
    { local: "support", name: "Support agent", threads: 10, approve: false },
    { local: "billing", name: "Billing agent", threads: 6, approve: true },
  ];
  const inboxes = specs.map((s) => ({
    ...s,
    id: rng.uuid(),
    address: `${s.local}@${DEMO_SENDER_DOMAIN}`,
  }));
  await db.insert(t.inboxes).values(
    inboxes.map((i) => ({
      id: i.id,
      teamId,
      kind: "agent" as const,
      emailAddress: i.address,
      localPart: i.local,
      domainId: ws.verifiedDomainId,
      name: i.name,
      fromName: i.name,
      safety: {
        ...defaultSafety("agent", false),
        allowlist: ["*@example.com"],
        require_approval: i.approve,
      },
      firstSentAt: at(12),
      createdAt: at(20),
      updatedAt: at(1),
    })),
  );

  const labels = inboxes.flatMap((i) =>
    [
      { name: "Needs follow-up", color: "#F59E0B" },
      { name: "Resolved", color: "#16A34A" },
      ...(i.local === "support" ? [{ name: "VIP", color: "#7046E8" }] : []),
    ].map((l) => ({ id: rng.uuid(), teamId, inboxId: i.id, createdAt: at(18), ...l })),
  );
  await db.insert(t.inboxLabels).values(labels);
  const label = (inboxId: string, name: string) =>
    labels.find((l) => l.inboxId === inboxId && l.name === name)?.id;

  const received: (typeof t.receivedEmails.$inferInsert)[] = [];
  const memberships: (typeof t.receivedEmailInboxes.$inferInsert)[] = [];
  const threads: (typeof t.inboxThreads.$inferInsert)[] = [];
  const threadLabels: (typeof t.inboxThreadLabels.$inferInsert)[] = [];
  const outbound: (typeof t.emails.$inferInsert)[] = [];
  const events: (typeof t.emailEvents.$inferInsert)[] = [];
  const activity: (typeof t.inboxActivity.$inferInsert)[] = [];
  const dailyReceived = new Map<string, number>();
  const correspondents = new Map<string, typeof t.inboxCorrespondents.$inferInsert>();
  const drafts: {
    inboxId: string;
    threadId: string;
    to: string;
    replyTo: string;
    subject: string;
  }[] = [];
  let subjectIdx = 0;

  const receive = async (
    inbox: (typeof inboxes)[number],
    threadId: string,
    contact: DemoContact,
    subjectIndex: number,
    when: Date,
    opts: {
      held?: "failed_auth" | "injection";
      read: boolean;
      inReplyTo?: string;
      prior?: string[];
    },
  ) => {
    const id = rng.uuid();
    const subject =
      (opts.inReplyTo ? "Re: " : "") + INBOUND_SUBJECTS[subjectIndex % INBOUND_SUBJECTS.length];
    const body = BODIES[subjectIndex % BODIES.length] ?? "";
    const code = subjectIndex % INBOUND_SUBJECTS.length === 4;
    const messageId = `<${rng.hex(20)}@${contact.email.split("@")[1]}>`;
    const raw = Buffer.from(
      [
        `From: ${contact.firstName} ${contact.lastName} <${contact.email}>`,
        `To: ${inbox.address}`,
        `Subject: ${subject}`,
        `Date: ${when.toUTCString()}`,
        `Message-ID: ${messageId}`,
        ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`] : []),
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=utf-8",
        "",
        `Hi,\r\n\r\n${body}\r\n\r\nThanks,\r\n${contact.firstName}`,
      ].join("\r\n"),
      "utf8",
    );
    const owner_ = { teamId, rowId: id };
    const sealed = await sealReceivedRaw(raw, keyring, owner_);
    const extracted: ReceivedExtracted = {
      text: body,
      quoted: "",
      signature: "",
      code: code ? { kind: "otp", value: "482913" } : null,
      link: null,
      flags: [],
    };
    const failed = opts.held === "failed_auth";
    received.push({
      id,
      teamId,
      domainIds: [ws.verifiedDomainId],
      rawSha256: sha256Hex(raw),
      messageId,
      from: contact.email,
      fromName: `${contact.firstName} ${contact.lastName}`,
      to: [inbox.address],
      receivedFor: [inbox.address],
      subject,
      envelope: {
        mailFrom: contact.email,
        clientIp: `203.0.113.${rng.int(2, 250)}`,
        helo: `mail.${contact.email.split("@")[1]}`,
        tls: { protocol: "TLSv1.3", cipher: "TLS_AES_256_GCM_SHA384" },
      },
      authentication: failed
        ? { spf: "fail", dkim: "none", dmarc: "fail", arc: "none" }
        : { spf: "pass", dkim: "pass", dmarc: "pass", arc: "none" },
      sizeBytes: raw.length,
      rawCiphertext: sealed.ciphertext,
      rawIv: sealed.iv,
      rawWrappedDek: sealed.wrappedDek,
      rawKeyVersion: sealed.keyVersion,
      attachments: await sealReceivedAttachments([], keyring, owner_),
      inReplyTo: opts.inReplyTo ?? null,
      references: opts.prior ?? [],
      senderTrust: failed ? "failed" : "allowlisted",
      spamVerdict: "pass",
      spamScore: 0,
      virusVerdict: "pass",
      extractedKinds: code ? ["code"] : [],
      extracted: await sealReceivedExtracted(extracted, keyring, owner_),
      catchAll: false,
      announcedAt: opts.held ? null : when,
      createdAt: when,
    });
    memberships.push({
      receivedEmailId: id,
      inboxId: inbox.id,
      teamId,
      threadId,
      address: inbox.address,
      senderTrust: failed ? "failed" : "allowlisted",
      verdict: opts.held ? "quarantined" : "clean",
      quarantineReason: opts.held ?? null,
      reasons: opts.held === "injection" ? ["instruction_override"] : [],
      injectionScore: opts.held === "injection" ? 92 : null,
      deliveredAt: opts.held ? null : when,
      quarantinedAt: opts.held ? when : null,
      readAt:
        opts.read && !opts.held ? clampToCap(ctx, when.getTime() + rng.int(5, 240) * 60_000) : null,
      createdAt: when,
    });
    usage.bump(when, "received");
    const day = `${inbox.id}|${utcDay(when)}`;
    dailyReceived.set(day, (dailyReceived.get(day) ?? 0) + 1);
    const key = `${inbox.id}|${contact.email}`;
    const c = correspondents.get(key);
    correspondents.set(key, {
      inboxId: inbox.id,
      address: contact.email,
      firstInAt: c?.firstInAt ?? when,
      firstOutAt: c?.firstOutAt ?? null,
      lastOutAt: c?.lastOutAt ?? null,
      lastSeenAt: when,
    });
    activity.push({
      teamId,
      inboxId: inbox.id,
      actor: "system",
      action: opts.held ? "quarantine" : "deliver",
      threadId,
      emailId: id,
      decision: opts.held ? { result: "quarantined", reasons: [opts.held] } : null,
      createdAt: when,
    });
    return { id, messageId, subject };
  };

  const reply = async (
    inbox: (typeof inboxes)[number],
    threadId: string,
    contact: DemoContact,
    subject: string,
    when: Date,
  ) => {
    const id = rng.uuid();
    const text = "Thanks for reaching out. We are on it and will get back to you shortly.";
    const sealed = await encryptEmailBody({ html: null, text }, keyring, { teamId, rowId: id });
    outbound.push({
      id,
      teamId,
      domainId: ws.verifiedDomainId,
      sesMessageId: `demo-${rng.hex(24)}`,
      from: `${inbox.name} <${inbox.address}>`,
      to: [contact.email],
      subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
      latestStatus: "delivered",
      bodyCiphertext: sealed.ciphertext,
      bodyIv: sealed.iv,
      bodyWrappedDek: sealed.wrappedDek,
      bodyKeyVersion: sealed.keyVersion,
      inboxId: inbox.id,
      threadId,
      createdAt: when,
      sentAt: when,
    });
    const sentAt = clampToCap(ctx, when.getTime() + 2_000);
    const deliveredAt = clampToCap(ctx, when.getTime() + 6_000);
    events.push(
      {
        emailId: id,
        type: "sent",
        occurredAt: sentAt,
        data: { source: "worker" },
        createdAt: sentAt,
      },
      { emailId: id, type: "delivered", occurredAt: deliveredAt, data: {}, createdAt: deliveredAt },
    );
    usage.bump(when, "accepted");
    usage.bump(sentAt, "sent");
    usage.bump(deliveredAt, "delivered");
    const key = `${inbox.id}|${contact.email}`;
    const c = correspondents.get(key);
    if (c) correspondents.set(key, { ...c, firstOutAt: c.firstOutAt ?? when, lastOutAt: when });
    activity.push({
      teamId,
      inboxId: inbox.id,
      actor: owner,
      action: "email.sent",
      threadId,
      emailId: id,
      createdAt: when,
    });
    return id;
  };

  const fresh = rng.shuffle([...ws.contacts].filter((c) => !c.unsubscribed));
  for (const inbox of inboxes) {
    for (let n = 0; n < inbox.threads; n++) {
      const contact = fresh[subjectIdx % fresh.length] as DemoContact;
      const threadId = rng.uuid();
      const start = at(0, rng.int(3, 13 * 24));
      const first = await receive(inbox, threadId, contact, subjectIdx, start, {
        read: rng.chance(0.65),
      });
      const msgs: Msg[] = [{ at: start.getTime(), inbound: true }];
      let replied = false;
      let lastId = first.id;
      if (rng.chance(0.7)) {
        const when = clampToCap(ctx, start.getTime() + rng.int(10, 300) * 60_000);
        lastId = await reply(inbox, threadId, contact, first.subject, when);
        msgs.push({ at: when.getTime(), inbound: false });
        replied = true;
        if (rng.chance(0.35)) {
          const back = start.getTime() + rng.int(6, 30) * HOUR_MS;
          if (back < cap.getTime()) {
            const r = await receive(inbox, threadId, contact, subjectIdx, new Date(back), {
              read: true,
              inReplyTo: first.messageId,
              prior: [first.messageId],
            });
            lastId = r.id;
            msgs.push({ at: back, inbound: true });
            replied = false;
          }
        }
      }
      const last = Math.max(...msgs.map((m) => m.at));
      const archived = replied && cap.getTime() - last > 7 * DAY_MS;
      threads.push({
        id: threadId,
        teamId,
        inboxId: inbox.id,
        subject: first.subject,
        folder: archived ? "archive" : "inbox",
        lastMessageAt: new Date(last),
        participants: replied ? [contact.email] : [],
        createdAt: start,
      });
      const tag = replied ? "Resolved" : "Needs follow-up";
      const labelId = label(inbox.id, tag);
      if (labelId) threadLabels.push({ threadId, labelId, createdAt: new Date(last) });
      if (inbox.local === "support" && n === 0) {
        const vip = label(inbox.id, "VIP");
        if (vip) threadLabels.push({ threadId, labelId: vip, createdAt: new Date(last) });
      }
      if (!replied && inbox.local === "support" && drafts.length === 0) {
        drafts.push({
          inboxId: inbox.id,
          threadId,
          to: contact.email,
          replyTo: lastId,
          subject: first.subject,
        });
      }
      subjectIdx += 1;
    }
  }

  // Two held messages, so the quarantine screens have something to review.
  const support = inboxes[0] as (typeof inboxes)[number];
  for (const held of ["failed_auth", "injection"] as const) {
    const contact = fresh[subjectIdx % fresh.length] as DemoContact;
    const threadId = rng.uuid();
    const when = at(0, rng.int(5, 60));
    const m = await receive(support, threadId, contact, subjectIdx, when, { held, read: false });
    threads.push({
      id: threadId,
      teamId,
      inboxId: support.id,
      subject: m.subject,
      folder: "inbox",
      lastMessageAt: when,
      participants: [],
      createdAt: when,
    });
    subjectIdx += 1;
  }

  await db.insert(t.inboxThreads).values(threads);
  await db.insert(t.receivedEmails).values(received);
  await db.insert(t.receivedEmailInboxes).values(memberships);
  await db.insert(t.inboxThreadLabels).values(threadLabels);
  await db.insert(t.emails).values(outbound);
  await db.insert(t.emailEvents).values(events);
  await db.insert(t.inboxActivity).values(activity);
  await db.insert(t.inboxCorrespondents).values([...correspondents.values()]);
  await db.insert(t.inboxUsageDaily).values(
    [...dailyReceived].map(([key, n]) => {
      const [inboxId, day] = key.split("|") as [string, string];
      return { inboxId, day, received: n };
    }),
  );
  for (const d of drafts) {
    const id = rng.uuid();
    const sealed = await encryptPayload(
      Buffer.from(
        JSON.stringify({ html: null, text: "Thanks for getting in touch. Here is what we found:" }),
        "utf8",
      ),
      keyring,
      { teamId, rowId: id, kind: "inbox_draft" },
    );
    await db.insert(t.inboxDrafts).values({
      id,
      teamId,
      inboxId: d.inboxId,
      type: "reply",
      threadId: d.threadId,
      replyToEmailId: d.replyTo,
      to: [d.to],
      subject: d.subject.startsWith("Re:") ? d.subject : `Re: ${d.subject}`,
      bodyCiphertext: sealed.ciphertext,
      bodyIv: sealed.iv,
      bodyWrappedDek: sealed.wrappedDek,
      bodyKeyVersion: sealed.keyVersion,
      status: "draft",
      createdBy: owner,
      createdAt: at(0, 4),
      updatedAt: at(0, 3),
    });
  }
}
