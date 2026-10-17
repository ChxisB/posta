import type { Db } from "@posta/db";
import { schema } from "@posta/db";
import { createTeam, createTestDb, createWebhookEndpoint } from "@posta/test-utils";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { sesEventsHealth } from "../src/events-health.js";
import { listTeamOwners } from "../src/notifications.js";
import { committedDailyVolume } from "../src/team-plan.js";
import { enqueueTeamWebhookDeliveries } from "../src/webhooks.js";

// The cross-team readers must see the seeded demo team as absent: its owner is
// not mailed, its traffic is not the instance's, its endpoints are not called.

let db: Db;
let close: () => Promise<void>;
let demo: string;

const NOW = new Date("2026-10-16T12:00:00Z");

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  demo = await createTeam(db, "demo");
  await db.update(schema.teams).set({ isDemo: true }).where(eq(schema.teams.id, demo));
});
afterAll(() => close());

it("lists no owner to mail for the demo team", async () => {
  await db
    .insert(schema.user)
    .values({ id: "u1", name: "Owner", email: "owner@example.test", createdAt: new Date(0) });
  await db.insert(schema.teamMembers).values({ teamId: demo, userId: "u1", role: "owner" });
  expect(await listTeamOwners(db, demo)).toEqual([]);
});

it("does not count demo sends as an instance whose SES events went missing", async () => {
  await db.insert(schema.emails).values({
    teamId: demo,
    from: "f@example.test",
    to: ["t@example.test"],
    subject: "s",
    sentAt: new Date(NOW.getTime() - 30 * 60_000),
  });
  expect(await sesEventsHealth(db, NOW)).toEqual({
    status: "idle",
    sentInWindow: 0,
    lastSesEventAt: null,
  });
});

it("leaves the demo team out of the committed daily volume", async () => {
  const before = await committedDailyVolume(db, NOW);
  await db.update(schema.teams).set({ plan: "scale" }).where(eq(schema.teams.id, demo));
  expect(await committedDailyVolume(db, NOW)).toBe(before);
});

it("arms no webhook delivery for a demo endpoint", async () => {
  await createWebhookEndpoint(db, demo, null);
  const armed: unknown[] = [];
  await enqueueTeamWebhookDeliveries(db, {
    teamId: demo,
    type: "email.delivered",
    occurredAt: NOW,
    data: {},
    enqueue: async (rows) => void armed.push(...rows),
  });
  expect(armed).toEqual([]);
  expect(await db.select().from(schema.webhookDeliveries)).toEqual([]);
});
