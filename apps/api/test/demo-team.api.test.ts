import { randomBytes } from "node:crypto";
import { DEMO_TEAM_MESSAGE, EnvKeyring, generateApiKey } from "@posta/core";
import type { Db } from "@posta/db";
import { schema } from "@posta/db";
import { createTeam, createTestDb } from "@posta/test-utils";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createApi } from "../src/app.js";

let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof createApi>;
let teamId: string;
let token: string;
let broadcastId: string;

const body = { from: "Acme <a@acme.dev>", to: ["r@example.com"], subject: "s", text: "t" };

const call = (path: string, payload: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  teamId = await createTeam(db, "demo");
  await db.update(schema.teams).set({ isDemo: true }).where(eq(schema.teams.id, teamId));
  await db.insert(schema.domains).values({
    teamId,
    name: "acme.dev",
    region: "us-east-1",
    status: "verified",
    verifiedAt: new Date(),
  });
  // A real, authenticating key: the seeded ones cannot authenticate at all.
  const key = generateApiKey();
  token = key.token;
  await db.insert(schema.apiKeys).values({
    teamId,
    name: "t",
    tokenPrefix: key.tokenPrefix,
    keyHash: key.keyHash,
    last4: key.last4,
  });
  const [bc] = await db
    .insert(schema.broadcasts)
    .values({ teamId, from: "Acme <hi@acme.dev>", subject: "s", html: "<p>hi</p>" })
    .returning({ id: schema.broadcasts.id });
  if (!bc) throw new Error("broadcast insert failed");
  broadcastId = bc.id;
  app = createApi({
    db,
    keyring: EnvKeyring.fromBase64(randomBytes(32).toString("base64")),
    isCloud: false,
    enqueueEmailSend: async () => {},
    enqueueBroadcastSend: async () => {},
    appBaseUrl: "https://app.example.test",
  });
});
afterAll(() => close());

it("refuses every send surface with 403 demo_team while the key still authenticates", async () => {
  const single = await call("/emails", body);
  expect(single.status).toBe(403);
  expect(await single.json()).toMatchObject({
    statusCode: 403,
    name: "demo_team",
    message: DEMO_TEAM_MESSAGE,
  });

  const batch = await call("/emails/batch", [body, { ...body, to: ["b@example.com"] }]);
  expect(batch.status).toBe(403);
  expect(await batch.json()).toMatchObject({ name: "demo_team" });

  const send = await call(`/broadcasts/${broadcastId}/send`, {});
  expect(send.status).toBe(403);
  expect(await send.json()).toMatchObject({ name: "demo_team" });
  const [row] = await db
    .select({ status: schema.broadcasts.status })
    .from(schema.broadcasts)
    .where(eq(schema.broadcasts.id, broadcastId));
  expect(row?.status).toBe("draft");
  expect(await db.select().from(schema.emails).where(eq(schema.emails.teamId, teamId))).toEqual([]);
});
