import { randomBytes } from "node:crypto";
import { DEMO_TEAM_ID, EnvKeyring, seedDemoTeam } from "@posta/core";
import type { Db } from "@posta/db";
import { schema } from "@posta/db";
import { createTestDb } from "@posta/test-utils";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { appRouter } from "@/server/routers";
import { type Context, createCallerFactory } from "@/server/trpc";

let db: Db;
let close: () => Promise<void>;
const OPERATOR = { id: "op", email: "op@example.test", name: "Operator" };
const OTHER = { id: "other", email: "other@example.test", name: "Other" };
const keyBase64 = randomBytes(32).toString("base64");

const caller = (user: typeof OPERATOR, extra: Partial<Context> = {}) =>
  createCallerFactory(appRouter)({ db, session: { user }, teamId: null, role: null, ...extra });
const demoCaller = () => caller(OPERATOR, { teamId: DEMO_TEAM_ID, role: "owner", isDemo: true });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  vi.stubEnv("MASTER_ENCRYPTION_KEY", keyBase64);
  vi.stubEnv("RECEIVING_MX_HOST", "mx.example.test");
  // The first registered user is the instance operator.
  await db.insert(schema.user).values([
    { ...OPERATOR, createdAt: new Date(0) },
    { ...OTHER, createdAt: new Date(1) },
  ]);
  await seedDemoTeam(db, {
    keyring: EnvKeyring.fromBase64(keyBase64),
    ownerUserId: OPERATOR.id,
  });
}, 60_000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await close();
});

// The guard against a screen going empty: every dashboard list, read the way the page reads it.
describe("a loaded demo team", () => {
  const screens: [string, () => Promise<unknown>][] = [
    ["emails", () => demoCaller().emails.list({})],
    ["suppressions", () => demoCaller().emails.suppressions.list({})],
    ["broadcasts", () => demoCaller().broadcasts.list({})],
    ["templates", () => demoCaller().templates.list({})],
    ["contacts", () => demoCaller().audience.contacts.list({})],
    ["properties", () => demoCaller().audience.properties.list()],
    ["segments", () => demoCaller().segments.list()],
    ["topics", () => demoCaller().topics.list()],
    ["domains", () => demoCaller().domains.list()],
    ["api keys", () => demoCaller().apiKeys.list()],
    ["webhooks", () => demoCaller().webhooks.list()],
    ["logs", () => demoCaller().logs.list({})],
    ["audit", () => demoCaller().audit.list({})],
    ["inboxes", () => demoCaller().inboxes.list({})],
    // `days` is zero-filled, so the delivered total is what says there is data.
    [
      "metrics",
      async () => [(await demoCaller().metrics.window({})).allTimeDelivered].filter(Boolean),
    ],
  ];
  const size = (r: unknown): number => {
    if (Array.isArray(r)) return r.length;
    const o = r as { items?: unknown[]; rows?: unknown[] };
    return (o.items ?? o.rows ?? []).length;
  };
  for (const [name, read] of screens) {
    it(`shows something on ${name}`, async () => {
      expect(size(await read())).toBeGreaterThan(0);
    });
  }
});

describe("demo.load and demo.remove", () => {
  it("are the instance operator's alone, and look like missing routes to anyone else", async () => {
    await expect(caller(OTHER).demo.load()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller(OTHER).demo.remove()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller(OTHER).demo.status()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("do not exist on a cloud deployment, even for the operator", async () => {
    vi.stubEnv("IS_CLOUD", "true");
    try {
      await expect(caller(OPERATOR).demo.load()).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(caller(OPERATOR).demo.remove()).rejects.toMatchObject({ code: "NOT_FOUND" });
    } finally {
      vi.stubEnv("IS_CLOUD", "");
    }
  });

  it("reload the team, switch to it, then remove it", async () => {
    const setActiveTeamCookie = vi.fn();
    const op = caller(OPERATOR, { setActiveTeamCookie });
    expect(await op.demo.status()).toEqual({ loaded: true });
    expect(await op.demo.load()).toEqual({ teamId: DEMO_TEAM_ID });
    expect(setActiveTeamCookie).toHaveBeenCalledWith(DEMO_TEAM_ID);
    const [row] = await db
      .select({ n: count() })
      .from(schema.teams)
      .where(eq(schema.teams.isDemo, true));
    expect(row?.n).toBe(1);

    await op.demo.remove();
    expect(await op.demo.status()).toEqual({ loaded: false });
  }, 60_000);
});
