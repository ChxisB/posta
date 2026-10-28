import { computeTeamStandings, utcDay } from "@posta/core";
import type { Db } from "@posta/db";
import { schema } from "@posta/db";
import { createTeam, createTestDb, createWebhookEndpoint } from "@posta/test-utils";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  reapUnverifiedDomains,
  reconcileStalledBroadcasts,
  reconcileWebhookDeliveries,
  reverifyDomains,
} from "../src/handlers/cron.js";
import { alertLinkedTeams } from "../src/handlers/linkage-alerts.js";
import { runSafetyFlags } from "../src/handlers/safety-flags.js";

// Every cross-team job and reader must treat the seeded demo team as absent:
// each case gives a demo team the bait a real team would be acted on for, next
// to a real control, and expects only the control to be touched.

let db: Db;
let close: () => Promise<void>;
let demo: string;
let real: string;

const NOW = new Date("2026-10-16T12:00:00Z");
const HOUR_MS = 3_600_000;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  demo = await createTeam(db, "demo");
  real = await createTeam(db, "real");
  await db.update(schema.teams).set({ isDemo: true }).where(eq(schema.teams.id, demo));
});
afterAll(() => close());

const noSes = () => {
  throw new Error("SES must not be called for the demo team");
};

async function addDomain(teamId: string, name: string) {
  const [row] = await db
    .insert(schema.domains)
    .values({
      teamId,
      name,
      region: "us-east-1",
      status: "pending",
      dkimSelector: "sel",
      dkimPublicKey: "PUB",
      mailFromSubdomain: "send",
      createdAt: new Date(NOW.getTime() - 100 * HOUR_MS),
    })
    .returning({ id: schema.domains.id });
  return row?.id ?? "";
}

it("reaps an unverified domain of the real team and leaves the demo team's", async () => {
  const demoDomain = await addDomain(demo, "demo.example.test");
  const realDomain = await addDomain(real, "squat.example.test");
  const reaped = await reapUnverifiedDomains(db, {
    now: NOW,
    clientForRegion: () => ({ send: async () => ({ DkimAttributes: { Status: "FAILED" } }) }),
  });
  expect(reaped).toBe(1);
  const left = (await db.select({ id: schema.domains.id }).from(schema.domains)).map((r) => r.id);
  expect(left).toContain(demoDomain);
  expect(left).not.toContain(realDomain);
});

it("never re-verifies a demo domain against SES or DNS", async () => {
  const result = await reverifyDomains(db, {
    now: NOW,
    clientForRegion: noSes,
    resolver: { resolveTxt: noSes, resolveCname: noSes, resolveMx: noSes } as never,
  });
  // Only the real team's domain was reaped above, so nothing else is due.
  expect(result.checked).toBe(0);
});

it("re-enqueues a stalled broadcast of the real team and not the demo team's", async () => {
  const stale = new Date(NOW.getTime() - HOUR_MS);
  const rows = await db
    .insert(schema.broadcasts)
    .values(
      [demo, real].map((teamId) => ({
        teamId,
        name: "Launch",
        subject: "Hi",
        from: "hi@example.test",
        status: "scheduled" as const,
        scheduledAt: stale,
      })),
    )
    .returning({ id: schema.broadcasts.id, teamId: schema.broadcasts.teamId });
  const enqueued: string[] = [];
  await reconcileStalledBroadcasts(db, {
    now: NOW,
    enqueue: async (id) => void enqueued.push(id),
  });
  expect(enqueued).toEqual([rows.find((r) => r.teamId === real)?.id]);
});

it("does not retry, arm or exhaust a demo team's webhook deliveries", async () => {
  const endpointId = await createWebhookEndpoint(db, demo, null);
  const [delivery] = await db
    .insert(schema.webhookDeliveries)
    .values({
      endpointId,
      messageId: "msg_demo",
      eventType: "email.delivered",
      payload: {},
      status: "failed",
      createdAt: new Date(NOW.getTime() - 30 * 24 * HOUR_MS),
      nextAttemptAt: new Date(NOW.getTime() - 25 * 24 * HOUR_MS),
    })
    .returning({ id: schema.webhookDeliveries.id });
  const armed: string[] = [];
  const count = await reconcileWebhookDeliveries(db, {
    now: NOW,
    enqueue: async (rows) => void armed.push(...rows.map((r) => r.endpointId)),
  });
  expect(count).toBe(0);
  expect(armed).toEqual([]);
  const [after] = await db
    .select({ status: schema.webhookDeliveries.status })
    .from(schema.webhookDeliveries)
    .where(eq(schema.webhookDeliveries.id, delivery?.id ?? ""));
  expect(after?.status).toBe("failed");
});

it("gives the demo team no standing, no flag and no share of the unsubscribed count", async () => {
  await db.insert(schema.usageCounters).values([
    { teamId: demo, day: utcDay(NOW), sent: 500, complained: 20 },
    { teamId: real, day: utcDay(NOW), sent: 200 },
  ]);
  await db.insert(schema.contacts).values([
    { teamId: demo, email: "gone@example.test", unsubscribed: true },
    { teamId: real, email: "left@example.test", unsubscribed: true },
  ]);
  expect((await computeTeamStandings(db, NOW)).map((s) => s.teamId)).toEqual([real]);
  expect(await runSafetyFlags(db, { now: NOW })).toMatchObject({ teams: 1, opened: 0 });
  expect(await db.select().from(schema.teamFlags)).toEqual([]);
  const probes = await db.select().from(schema.instanceProbes);
  expect(probes).toMatchObject([{ probe: "contacts_unsubscribed", value: 1 }]);
});

it("does not mail the operator about a link on the demo team", async () => {
  await db.insert(schema.user).values({
    id: "op",
    name: "Operator",
    email: "op@example.test",
    createdAt: new Date(0),
  });
  await db.insert(schema.teamLinks).values({
    teamId: demo,
    linkedTeamId: crypto.randomUUID(),
    linkedTeamName: "other",
    matches: [{ kind: "phone", value: "1", matched: "1" }],
    trigger: "send",
    held: false,
  });
  const mails: string[] = [];
  const mailer = { send: async (to: string) => void mails.push(to) };
  expect(await alertLinkedTeams(db, { mailer })).toBe(0);
  expect(mails).toEqual([]);
});
