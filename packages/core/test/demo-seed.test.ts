import { randomBytes } from "node:crypto";
import type { Db } from "@posta/db";
import { schema } from "@posta/db";
import { createTeam, createTestDb } from "@posta/test-utils";
import { count, eq, getTableColumns, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { EnvKeyring } from "../src/crypto/keyring.js";
import { DEMO_TEAM_ID, removeDemoTeam, seedDemoTeam } from "../src/demo/index.js";
import { sendRefusal } from "../src/team-standing.js";

let db: Db;
let close: () => Promise<void>;
const keyring = EnvKeyring.fromBase64(randomBytes(32).toString("base64"));
const NOW = new Date("2026-10-16T12:00:00Z");
const OWNER = "owner-1";

const rows = async (table: PgTable) => {
  const [r] = await db.select({ n: count() }).from(table);
  return r?.n ?? 0;
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db
    .insert(schema.user)
    .values({ id: OWNER, name: "Chris", email: "chris@example.test", createdAt: new Date(0) });
}, 60_000);
afterAll(() => close());

it("seeds a believable team, deterministically and repeatably", async () => {
  await seedDemoTeam(db, { keyring, ownerUserId: OWNER, now: NOW });
  const first = {
    emails: await rows(schema.emails),
    contacts: await rows(schema.contacts),
    received: await rows(schema.receivedEmails),
    audit: await rows(schema.auditLog),
  };
  expect(first.emails).toBeGreaterThan(900);
  expect(first.contacts).toBe(300);
  expect(first.received).toBeGreaterThan(15);
  expect(first.audit).toBeGreaterThan(15);

  const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, DEMO_TEAM_ID));
  expect(team).toMatchObject({ isDemo: true, name: "Demo", suspendedAt: null });
  expect(team?.stripeCustomerId ?? null).toBeNull();

  // A second run replaces the first: same shape, one team, audit not doubled.
  await seedDemoTeam(db, { keyring, ownerUserId: OWNER, now: NOW });
  expect(await rows(schema.emails)).toBe(first.emails);
  expect(await rows(schema.contacts)).toBe(first.contacts);
  expect(await rows(schema.receivedEmails)).toBe(first.received);
  expect(await rows(schema.auditLog)).toBe(first.audit);
  expect(await rows(schema.teams)).toBe(1);
}, 120_000);

it("is refused every send", async () => {
  expect(await sendRefusal(db, DEMO_TEAM_ID)).toMatchObject({ reason: "demo_team" });
});

it("keeps its counters equal to the events and its rates deliverable", async () => {
  const totals = async (col: keyof typeof schema.usageCounters.$inferSelect) => {
    const [r] = await db
      .select({ n: sql<number>`coalesce(sum(${schema.usageCounters[col]}), 0)::int` })
      .from(schema.usageCounters);
    return r?.n ?? 0;
  };
  const events = async (type: (typeof schema.emailEventTypeEnum.enumValues)[number]) => {
    const [r] = await db
      .select({ n: count() })
      .from(schema.emailEvents)
      .where(eq(schema.emailEvents.type, type));
    return r?.n ?? 0;
  };
  expect(await totals("accepted")).toBe(await rows(schema.emails));
  for (const [col, type] of [
    ["sent", "sent"],
    ["delivered", "delivered"],
    ["bounced", "bounced"],
    ["complained", "complained"],
    ["opened", "opened"],
    ["clicked", "clicked"],
  ] as const) {
    expect(await totals(col), col).toBe(await events(type));
  }
  const sent = await totals("sent");
  expect((await totals("bounced")) / sent).toBeLessThan(0.02);
  expect((await totals("complained")) / sent).toBeLessThan(0.001);
  expect(await totals("complained")).toBeGreaterThan(0);

  // The hourly counters are the daily ones, cut finer.
  const [h] = await db
    .select({ n: sql<number>`coalesce(sum(${schema.usageCountersHourly.sent}), 0)::int` })
    .from(schema.usageCountersHourly);
  expect(h?.n).toBe(sent);
});

it("leaves nothing for a job to pick up", async () => {
  const cap = NOW.getTime() - 3_600_000;
  const [newest] = await db
    .select({ at: sql<Date>`max(${schema.emails.createdAt})` })
    .from(schema.emails);
  expect(new Date(newest?.at ?? 0).getTime()).toBeLessThanOrEqual(cap);
  const [queued] = await db
    .select({ n: count() })
    .from(schema.emails)
    .where(eq(schema.emails.latestStatus, "queued"));
  expect(queued?.n).toBe(0);
  const [retrying] = await db
    .select({ n: count() })
    .from(schema.webhookDeliveries)
    .where(sql`${schema.webhookDeliveries.nextAttemptAt} is not null`);
  expect(retrying?.n).toBe(0);
  const [real] = await db
    .select({ n: count() })
    .from(schema.emails)
    .where(sql`not (${schema.emails.to}->>0 ~ '@(example\\.(com|org|net)|[a-z.]+\\.test)$')`);
  expect(real?.n).toBe(0);
});

it("removes the team, its teammates and every row of its own, and nothing else", async () => {
  const other = await createTeam(db, "real");
  await db.insert(schema.teamMembers).values({ teamId: other, userId: OWNER, role: "owner" });
  await removeDemoTeam(db);

  const owned = (Object.values(schema) as unknown[]).filter((t): t is PgTable => is(t, PgTable));
  for (const table of owned) {
    const col = Object.values(getTableColumns(table)).find((c) => c.name === "team_id");
    // audit_log is append-only by trigger, so its rows outlive the team by design.
    if (!col || table === schema.auditLog) continue;
    const [r] = await db.select({ n: count() }).from(table).where(eq(col, DEMO_TEAM_ID));
    expect(r?.n, `rows left in a team_id table`).toBe(0);
  }
  expect(await rows(schema.emailEvents)).toBe(0);
  expect(await rows(schema.webhookDeliveries)).toBe(0);
  expect(await rows(schema.teams)).toBe(1);
  const users = await db.select({ id: schema.user.id }).from(schema.user);
  expect(users).toEqual([{ id: OWNER }]);
});
