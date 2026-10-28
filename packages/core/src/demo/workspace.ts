import { schema } from "@posta/db";
import { eq } from "drizzle-orm";
import { generateApiKey } from "../api-keys.js";
import { recountSegment } from "../segment-counts.js";
import {
  BROADCASTS,
  COMPANIES,
  CONTACT_DOMAINS,
  CONTACT_PLANS,
  COUNTRIES,
  DEMO_PENDING_DOMAIN,
  DEMO_SENDER_DOMAIN,
  FIRST_NAMES,
  LAST_NAMES,
  TEMPLATES,
} from "./content.js";
import { DAY_MS, type DemoCtx, HOUR_MS } from "./context.js";

export interface DemoContact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  unsubscribed: boolean;
  createdAt: Date;
  subscribedTopicIds: string[];
}

export interface DemoTemplateRow {
  id: string;
  subject: string;
  html: string;
  text: string;
}

export interface Workspace {
  verifiedDomainId: string;
  pendingDomainId: string;
  contacts: DemoContact[];
  topicIds: { updates: string; digest: string; beta: string };
  segmentIds: { active: string; power: string; beta: string };
  templates: Map<string, DemoTemplateRow>;
  broadcastIds: { sent: string; scheduled: string; draft: string };
  apiKeyIds: { production: string; backend: string };
}

export const CONTACT_COUNT = 300;
const CHUNK = 500;

async function insertChunked<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
}

/** Domains, audience, templates, broadcasts and keys: everything but traffic. */
export async function seedWorkspace(ctx: DemoCtx): Promise<Workspace> {
  const { db, rng, now, teamId } = ctx;
  const at = (daysAgo: number, hoursAgo = 0) =>
    new Date(Math.min(now.getTime() - daysAgo * DAY_MS - hoursAgo * HOUR_MS, ctx.cap.getTime()));
  const t = schema;

  // Domains: one verified and receiving, one still waiting on DNS.
  const verifiedDomainId = rng.uuid();
  const pendingDomainId = rng.uuid();
  const dkim = (id: string) => `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ${id.replaceAll("-", "")}`;
  await db.insert(t.domains).values([
    {
      id: verifiedDomainId,
      teamId,
      name: DEMO_SENDER_DOMAIN,
      region: "us-east-1",
      status: "verified",
      dkimSelector: "posta1",
      dkimPublicKey: dkim(verifiedDomainId),
      trackingSubdomain: `links.${DEMO_SENDER_DOMAIN}`,
      trackingSubdomainSetAt: at(18),
      clickTracking: true,
      openTracking: true,
      dnsRecords: [
        {
          group: "verification",
          name: `posta1._domainkey.${DEMO_SENDER_DOMAIN}`,
          type: "TXT",
          status: "found",
        },
        { group: "sending", name: `send.${DEMO_SENDER_DOMAIN}`, type: "MX", status: "found" },
        { group: "sending", name: `send.${DEMO_SENDER_DOMAIN}`, type: "TXT", status: "found" },
      ],
      dmarcPolicy: "quarantine",
      dmarcCheckedAt: at(1),
      registeredAt: new Date("2021-03-14T00:00:00Z"),
      ageSource: "rdap",
      ageCheckedAt: at(18),
      warmupTrustedAt: at(18),
      receivingEnabled: true,
      receivingEnabledAt: at(16),
      createdAt: at(19),
      verifiedAt: at(18),
      lastCheckedAt: at(0, 3),
    },
    {
      id: pendingDomainId,
      teamId,
      name: DEMO_PENDING_DOMAIN,
      region: "us-east-1",
      status: "pending",
      dkimSelector: "posta1",
      dkimPublicKey: dkim(pendingDomainId),
      dnsRecords: [
        {
          group: "verification",
          name: `posta1._domainkey.${DEMO_PENDING_DOMAIN}`,
          type: "TXT",
          status: "missing",
        },
        { group: "sending", name: `send.${DEMO_PENDING_DOMAIN}`, type: "MX", status: "missing" },
      ],
      registeredAt: new Date("2021-03-14T00:00:00Z"),
      ageSource: "rdap",
      ageCheckedAt: at(1),
      warmupTrustedAt: at(1),
      createdAt: at(1),
      lastCheckedAt: at(0, 3),
    },
  ]);

  // Topics, properties and segments.
  const topicIds = { updates: rng.uuid(), digest: rng.uuid(), beta: rng.uuid() };
  const topicRows = [
    {
      id: topicIds.updates,
      name: "Product updates",
      description: "New features and changes",
      defaultSubscribed: true,
      visibility: "public" as const,
    },
    {
      id: topicIds.digest,
      name: "Weekly digest",
      description: "A short summary every Monday",
      defaultSubscribed: true,
      visibility: "public" as const,
    },
    {
      id: topicIds.beta,
      name: "Beta program",
      description: "Early access to what we are testing",
      defaultSubscribed: false,
      visibility: "private" as const,
    },
  ];
  await db.insert(t.topics).values(topicRows.map((row) => ({ ...row, teamId, createdAt: at(30) })));
  await db.insert(t.contactProperties).values([
    { teamId, key: "company", type: "string", fallbackValue: "your team", createdAt: at(30) },
    { teamId, key: "plan", type: "string", fallbackValue: "free", createdAt: at(30) },
    { teamId, key: "country", type: "string", createdAt: at(30) },
    { teamId, key: "seats", type: "number", fallbackValue: "1", createdAt: at(30) },
  ]);

  // Contacts, with the topics each one chose.
  const contacts: DemoContact[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < CONTACT_COUNT; i++) {
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    let email = `${first}.${last}${i}@${rng.pick(CONTACT_DOMAINS)}`.toLowerCase();
    while (seen.has(email)) email = `${i}${email}`;
    seen.add(email);
    const subscribed = [
      ...(rng.chance(0.85) ? [topicIds.updates] : []),
      ...(rng.chance(0.55) ? [topicIds.digest] : []),
      ...(rng.chance(0.12) ? [topicIds.beta] : []),
    ];
    contacts.push({
      id: rng.uuid(),
      email,
      firstName: first,
      lastName: last,
      unsubscribed: rng.chance(0.05),
      createdAt: at(rng.int(1, 40), rng.int(0, 23)),
      subscribedTopicIds: subscribed,
    });
  }
  const contactRows = contacts.map((c) => ({
    id: c.id,
    teamId,
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    properties: {
      company: rng.pick(COMPANIES),
      plan: rng.pick(CONTACT_PLANS),
      country: rng.pick(COUNTRIES),
      seats: String(rng.int(1, 40)),
    },
    unsubscribed: c.unsubscribed,
    unsubscribedAt: c.unsubscribed
      ? new Date(Math.min(c.createdAt.getTime() + rng.int(1, 30) * DAY_MS, ctx.cap.getTime()))
      : null,
    createdAt: c.createdAt,
    updatedAt: c.createdAt,
  }));
  await insertChunked(contactRows, (chunk) => db.insert(t.contacts).values(chunk));

  const topicName = new Map(topicRows.map((row) => [row.id, row.name]));
  const subscriptions = contacts.flatMap((c) =>
    c.subscribedTopicIds.map((topicId) => ({
      contactId: c.id,
      topicId,
      subscribed: true,
      updatedAt: c.createdAt,
    })),
  );
  await insertChunked(subscriptions, (chunk) =>
    db.insert(t.contactTopicSubscriptions).values(chunk),
  );
  const activities = contactRows.flatMap((row, i) => {
    const c = contacts[i];
    if (!c) return [];
    return [
      { teamId, contactId: c.id, type: "contact_created" as const, createdAt: c.createdAt },
      ...c.subscribedTopicIds.map((topicId) => ({
        teamId,
        contactId: c.id,
        type: "topic_opt_in" as const,
        data: { topicId, name: topicName.get(topicId) ?? "" },
        createdAt: c.createdAt,
      })),
      ...(row.unsubscribedAt
        ? [
            {
              teamId,
              contactId: c.id,
              type: "unsubscribed" as const,
              createdAt: row.unsubscribedAt,
            },
          ]
        : []),
    ];
  });
  await insertChunked(activities, (chunk) => db.insert(t.contactActivities).values(chunk));

  const segmentIds = { active: rng.uuid(), power: rng.uuid(), beta: rng.uuid() };
  await db.insert(t.segments).values([
    {
      id: segmentIds.active,
      teamId,
      name: "Paying customers",
      filter: {
        match: "all",
        conditions: [
          { field: "property:plan", op: "not_equals", value: "free" },
          { field: "unsubscribed", op: "is_false", value: null },
        ],
      },
      createdAt: at(25),
    },
    {
      id: segmentIds.power,
      teamId,
      name: "Teams and enterprise",
      filter: {
        match: "any",
        conditions: [
          { field: "property:plan", op: "equals", value: "team" },
          { field: "property:plan", op: "equals", value: "enterprise" },
        ],
      },
      createdAt: at(25),
    },
    { id: segmentIds.beta, teamId, name: "Beta testers", filter: null, createdAt: at(20) },
  ]);
  const betaMembers = contacts.filter((c) => c.subscribedTopicIds.includes(topicIds.beta));
  if (betaMembers.length > 0) {
    await db.insert(t.segmentMembers).values(
      betaMembers.map((c) => ({
        segmentId: segmentIds.beta,
        contactId: c.id,
        createdAt: c.createdAt,
      })),
    );
  }
  // Stamps countedAt, so the recount sweep has nothing to do for these.
  for (const id of Object.values(segmentIds)) {
    const [segment] = await db.select().from(t.segments).where(eq(t.segments.id, id));
    if (segment) await recountSegment(db, segment, ctx.cap);
  }

  // Templates: a few published versions each, "production" on the newest but one.
  const templates = new Map<string, DemoTemplateRow>();
  for (const tpl of TEMPLATES) {
    const id = rng.uuid();
    templates.set(tpl.alias, { id, subject: tpl.subject, html: tpl.html, text: tpl.text });
    await db.insert(t.templates).values({
      id,
      teamId,
      name: tpl.name,
      alias: tpl.alias,
      subject: tpl.subject,
      previewText: tpl.previewText,
      html: tpl.html,
      text: tpl.text,
      latestVersion: tpl.versions,
      createdAt: at(30),
      updatedAt: at(2),
    });
    await db.insert(t.templateVersions).values(
      Array.from({ length: tpl.versions }, (_, i) => ({
        templateId: id,
        version: i + 1,
        name: tpl.name,
        subject: i === 0 ? tpl.firstSubject : tpl.subject,
        previewText: tpl.previewText,
        html: tpl.html,
        text: tpl.text,
        createdAt: at(30 - i * 5),
      })),
    );
    await db.insert(t.templateTags).values([
      {
        templateId: id,
        name: "production",
        version: Math.max(1, tpl.versions - 1),
        createdAt: at(10),
        updatedAt: at(10),
      },
      ...(tpl.versions > 1
        ? [
            {
              templateId: id,
              name: "staging",
              version: tpl.versions,
              createdAt: at(2),
              updatedAt: at(2),
            },
          ]
        : []),
    ]);
  }

  // Broadcasts: one sent (its emails come with the traffic), one scheduled, one draft.
  const broadcastIds = { sent: rng.uuid(), scheduled: rng.uuid(), draft: rng.uuid() };
  const from = `Acme <hello@${DEMO_SENDER_DOMAIN}>`;
  const row = (key: keyof typeof BROADCASTS) => {
    const b = BROADCASTS[key];
    const tpl = templates.get(b.template);
    return {
      id: broadcastIds[key],
      teamId,
      name: b.name,
      from,
      subject: b.subject,
      previewText: b.previewText,
      html: tpl?.html ?? null,
      text: tpl?.text ?? null,
    };
  };
  await db.insert(t.broadcasts).values([
    {
      ...row("sent"),
      topicId: topicIds.updates,
      segmentId: null,
      status: "sent" as const,
      sentAt: at(5),
      createdAt: at(7),
      updatedAt: at(5),
    },
    {
      ...row("scheduled"),
      topicId: topicIds.updates,
      segmentId: segmentIds.power,
      status: "scheduled" as const,
      scheduledAt: new Date(now.getTime() + 2 * DAY_MS),
      createdAt: at(1),
      updatedAt: at(1),
    },
    {
      ...row("draft"),
      topicId: topicIds.digest,
      segmentId: null,
      status: "draft" as const,
      createdAt: at(0, 5),
      updatedAt: at(0, 5),
    },
  ]);

  // Keys: hash and prefix only, drawn at random and never recorded, so nobody
  // holds a secret for them. Only the first two are live.
  const keys = ["production", "backend", "retired"] as const;
  const apiKeyIds = { production: rng.uuid(), backend: rng.uuid() };
  const retiredId = rng.uuid();
  await db.insert(t.apiKeys).values(
    keys.map((name, i) => {
      const generated = generateApiKey();
      return {
        id: [apiKeyIds.production, apiKeyIds.backend, retiredId][i] as string,
        teamId,
        name: ["Production", "Backend service", "Old CI key"][i] as string,
        tokenPrefix: generated.tokenPrefix,
        keyHash: generated.keyHash,
        last4: generated.last4,
        permission: name === "backend" ? ("sending_access" as const) : ("full_access" as const),
        domainId: name === "backend" ? verifiedDomainId : null,
        lastUsedAt: i === 2 ? at(13) : at(0, 2),
        createdAt: i === 2 ? at(20) : at(18 - i),
        revokedAt: i === 2 ? at(12) : null,
      };
    }),
  );

  return {
    verifiedDomainId,
    pendingDomainId,
    contacts,
    topicIds,
    segmentIds,
    templates,
    broadcastIds,
    apiKeyIds,
  };
}
