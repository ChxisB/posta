import { randomBytes } from "node:crypto";
import { EnvKeyring, generateApiKey } from "@posta/core";
import type { Db } from "@posta/db";
import { schema } from "@posta/db";
import { createTeam, createTestDb } from "@posta/test-utils";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApi } from "../src/app.js";

let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof createApi>;
let teamId: string;
let fullKey: string;
let sendKey: string;
let otherTeamKey: string;

function call(token: string, method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function insertKey(
  team: string,
  overrides: Partial<typeof schema.apiKeys.$inferInsert> = {},
) {
  const key = generateApiKey();
  await db.insert(schema.apiKeys).values({
    teamId: team,
    name: "seed",
    tokenPrefix: key.tokenPrefix,
    keyHash: key.keyHash,
    last4: key.last4,
    ...overrides,
  });
  return key.token;
}

async function createTemplate(body: unknown, token = fullKey): Promise<string> {
  const res = await call(token, "POST", "/templates", body);
  expect(res.status).toBe(200);
  const json = (await res.json()) as { object: string; id: string };
  expect(json.object).toBe("template");
  return json.id;
}

async function getTemplate(idOrAlias: string, token = fullKey) {
  const res = await call(token, "GET", `/templates/${idOrAlias}`);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const UNSUPPORTED_ERROR = (field: string) => ({
  statusCode: 422,
  name: "validation_error",
  message: `${field} is not supported on templates yet`,
});

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  teamId = await createTeam(db, "templates-team");
  const otherTeamId = await createTeam(db, "templates-other-team");
  fullKey = await insertKey(teamId);
  sendKey = await insertKey(teamId, { permission: "sending_access" });
  otherTeamKey = await insertKey(otherTeamId);
  const keyring = EnvKeyring.fromBase64(randomBytes(32).toString("base64"));
  app = createApi({ db, keyring, isCloud: false, enqueueEmailSend: async () => {} });
});
afterAll(() => close());

describe("POST /templates", () => {
  it("creates a draft template, storing html raw and blank subject/text as null", async () => {
    const html = '<h1>Hi {{{FIRST_NAME|there}}}</h1><script>alert(1)</script><p onclick="x">x</p>';
    const id = await createTemplate({
      name: "  Welcome  ",
      subject: "",
      html,
      text: "",
      alias: "welcome-v1",
    });

    const [row] = await db.select().from(schema.templates).where(eq(schema.templates.id, id));
    expect(row).toMatchObject({
      teamId,
      name: "Welcome",
      alias: "welcome-v1",
      subject: null,
      html,
      text: null,
      document: null,
    });

    const got = await getTemplate(id);
    expect(got.status).toBe(200);
    expect(got.body).toEqual({
      object: "template",
      id,
      current_version_id: id,
      name: "Welcome",
      alias: "welcome-v1",
      from: null,
      subject: null,
      reply_to: null,
      preview_text: null,
      html,
      text: null,
      variables: [],
      status: "draft",
      published_at: null,
      version: null,
      tags: [],
      has_unpublished_versions: true,
      created_at: row?.createdAt.toISOString(),
      updated_at: row?.updatedAt.toISOString(),
    });
  });

  it("422s from, reply_to and variables with a precise message", async () => {
    const base = { name: "Unsupported", html: "<p>x</p>" };
    for (const [field, value] of [
      ["from", "Acme <hi@acme.com>"],
      ["reply_to", ["a@acme.com"]],
      ["reply_to", "a@acme.com"],
      ["variables", [{ key: "name", type: "string" }]],
    ] as const) {
      const res = await call(fullKey, "POST", "/templates", { ...base, [field]: value });
      expect(res.status, field).toBe(422);
      expect(await res.json()).toEqual(UNSUPPORTED_ERROR(field));
    }
    // A null / empty value carries nothing to drop.
    const ok = await call(fullKey, "POST", "/templates", {
      ...base,
      from: null,
      reply_to: null,
      variables: [],
    });
    expect(ok.status).toBe(200);
  });

  it("422s missing name/html, oversize fields and malformed aliases", async () => {
    for (const body of [
      { html: "<p>x</p>" },
      { name: "No html" },
      { name: "Empty html", html: "" },
      { name: "", html: "<p>x</p>" },
      { name: "x".repeat(201), html: "<p>x</p>" },
      { name: "Subject", html: "<p>x</p>", subject: "s".repeat(999) },
      { name: "Alias", html: "<p>x</p>", alias: "" },
      { name: "Alias", html: "<p>x</p>", alias: "-leading-dash" },
      { name: "Alias", html: "<p>x</p>", alias: "has space" },
      { name: "Alias", html: "<p>x</p>", alias: "a".repeat(101) },
      { name: "Alias", html: "<p>x</p>", alias: crypto.randomUUID() },
    ]) {
      const res = await call(fullKey, "POST", "/templates", body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(422);
      expect(((await res.json()) as { name: string }).name).toBe("validation_error");
    }
  });

  it("409s a duplicate alias within the team; the same alias is free on another team", async () => {
    await createTemplate({ name: "A", html: "<p>a</p>", alias: "shared.alias_1" });
    const dup = await call(fullKey, "POST", "/templates", {
      name: "B",
      html: "<p>b</p>",
      alias: "shared.alias_1",
    });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toEqual({
      statusCode: 409,
      name: "validation_error",
      message: "Template alias already exists",
    });
    await createTemplate({ name: "C", html: "<p>c</p>", alias: "shared.alias_1" }, otherTeamKey);
  });
});

describe("GET /templates/{id-or-alias}", () => {
  it("resolves a uuid by id and anything else by alias, case-sensitively", async () => {
    const id = await createTemplate({ name: "Lookup", html: "<p>l</p>", alias: "Lookup-Me" });
    expect((await getTemplate(id)).body.id).toBe(id);
    expect((await getTemplate("Lookup-Me")).body.id).toBe(id);
    expect((await getTemplate("lookup-me")).status).toBe(404);
    expect((await getTemplate(crypto.randomUUID())).status).toBe(404);
    expect((await getTemplate("Lookup-Me", otherTeamKey)).status).toBe(404);
    expect((await getTemplate(id, otherTeamKey)).status).toBe(404);
  });
});

describe("GET /templates", () => {
  it("lists the SDK list-item key set and paginates with keyset cursors", async () => {
    const list = await call(fullKey, "GET", "/templates?limit=100");
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      object: string;
      data: Record<string, unknown>[];
      has_more: boolean;
    };
    expect(body.object).toBe("list");
    expect(body.has_more).toBe(false);
    expect(body.data.length).toBeGreaterThanOrEqual(3);
    for (const row of body.data) {
      expect(Object.keys(row).sort()).toEqual([
        "alias",
        "created_at",
        "id",
        "name",
        "published_at",
        "status",
        "tags",
        "updated_at",
        "version",
      ]);
      expect(row.status).toBe("draft");
      expect(row.published_at).toBeNull();
      expect(row.version).toBeNull();
      expect(row.tags).toEqual([]);
    }
    // Oldest first, like the other lists.
    const times = body.data.map((r) => String(r.created_at));
    expect([...times].sort()).toEqual(times);

    const first = await call(fullKey, "GET", "/templates?limit=1");
    const firstBody = (await first.json()) as { data: { id: string }[]; has_more: boolean };
    expect(firstBody.data).toHaveLength(1);
    expect(firstBody.has_more).toBe(true);
    const next = await call(fullKey, "GET", `/templates?limit=100&after=${firstBody.data[0]?.id}`);
    const nextBody = (await next.json()) as { data: { id: string }[] };
    expect(nextBody.data.some((r) => r.id === firstBody.data[0]?.id)).toBe(false);
    expect(nextBody.data).toHaveLength(body.data.length - 1);

    // Tenant isolation: the other team sees only its own row.
    const other = await call(otherTeamKey, "GET", "/templates?limit=100");
    const otherBody = (await other.json()) as { data: { alias: string | null }[] };
    expect(otherBody.data.map((r) => r.alias)).toEqual(["shared.alias_1"]);
  });
});

describe("PATCH /templates/{id}", () => {
  it("updates fields, bumps updated_at, clears alias with null, no-ops on an empty body", async () => {
    const id = await createTemplate({
      name: "Patch",
      subject: "Old",
      html: "<p>old</p>",
      text: "old",
      alias: "patch-me",
    });
    const before = await getTemplate(id);

    const res = await call(fullKey, "PATCH", `/templates/${id}`, {
      name: "Patched",
      subject: "",
      html: "<p>new</p>",
      text: "new",
      alias: null,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ object: "template", id });
    const after = await getTemplate(id);
    expect(after.body).toMatchObject({
      name: "Patched",
      subject: null,
      html: "<p>new</p>",
      text: "new",
      alias: null,
      created_at: before.body.created_at,
    });
    expect(after.body.updated_at).not.toBe(before.body.updated_at);
    expect((await getTemplate("patch-me")).status).toBe(404);

    const noop = await call(fullKey, "PATCH", `/templates/${id}`, {});
    expect(noop.status).toBe(200);
    expect(await noop.json()).toEqual({ object: "template", id });
    expect((await getTemplate(id)).body.updated_at).toBe(after.body.updated_at);

    // Reachable by alias too, once it has one again.
    await call(fullKey, "PATCH", `/templates/${id}`, { alias: "patch-me" });
    const viaAlias = await call(fullKey, "PATCH", "/templates/patch-me", { name: "Via alias" });
    expect(viaAlias.status).toBe(200);
    expect((await getTemplate(id)).body.name).toBe("Via alias");
  });

  it("accepts null for subject/text (SDK-typed) on create and update", async () => {
    const id = await createTemplate({
      name: "Nulls",
      subject: null,
      html: "<p>n</p>",
      text: null,
      alias: null,
    });
    expect((await getTemplate(id)).body).toMatchObject({ subject: null, text: null, alias: null });

    await call(fullKey, "PATCH", `/templates/${id}`, { subject: "S", text: "t" });
    expect((await getTemplate(id)).body).toMatchObject({ subject: "S", text: "t" });
    const res = await call(fullKey, "PATCH", `/templates/${id}`, { subject: null, text: null });
    expect(res.status).toBe(200);
    expect((await getTemplate(id)).body).toMatchObject({ subject: null, text: null });
  });

  it("drops the dashboard's block document when html or text is written, keeps it otherwise", async () => {
    const id = await createTemplate({ name: "Doc", subject: "s", html: "<p>doc</p>", text: "doc" });
    const document = { type: "doc", content: [] };
    const seed = () =>
      db.update(schema.templates).set({ document }).where(eq(schema.templates.id, id));
    const stored = async () =>
      (await db.select().from(schema.templates).where(eq(schema.templates.id, id)))[0];

    await seed();
    expect((await call(fullKey, "PATCH", `/templates/${id}`, { name: "Renamed" })).status).toBe(
      200,
    );
    expect((await stored())?.document).toEqual(document);
    expect((await call(fullKey, "PATCH", `/templates/${id}`, { subject: "x" })).status).toBe(200);
    expect((await stored())?.document).toEqual(document);

    expect((await call(fullKey, "PATCH", `/templates/${id}`, { html: "<p>new</p>" })).status).toBe(
      200,
    );
    expect(await stored()).toMatchObject({ html: "<p>new</p>", document: null });

    await seed();
    expect((await call(fullKey, "PATCH", `/templates/${id}`, { text: "" })).status).toBe(200);
    expect(await stored()).toMatchObject({ text: null, document: null });
  });

  it("422s unsupported fields and bad values, 409s a taken alias, 404s foreign ids", async () => {
    const id = await createTemplate({ name: "Patch bad", html: "<p>x</p>" });
    for (const field of ["from", "reply_to", "variables"] as const) {
      const res = await call(fullKey, "PATCH", `/templates/${id}`, {
        [field]: field === "variables" ? [{ key: "k", type: "string" }] : "x",
      });
      expect(res.status, field).toBe(422);
      expect(await res.json()).toEqual(UNSUPPORTED_ERROR(field));
    }
    for (const body of [{ html: "" }, { name: "" }, { alias: "bad alias" }]) {
      const res = await call(fullKey, "PATCH", `/templates/${id}`, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    const taken = await call(fullKey, "PATCH", `/templates/${id}`, { alias: "shared.alias_1" });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({
      statusCode: 409,
      name: "validation_error",
      message: "Template alias already exists",
    });
    expect((await call(otherTeamKey, "PATCH", `/templates/${id}`, { name: "x" })).status).toBe(404);
    expect((await call(otherTeamKey, "PATCH", `/templates/${id}`, {})).status).toBe(404);
    expect((await getTemplate(id)).body.name).toBe("Patch bad");
  });
});

describe("POST /templates/{id}/publish", () => {
  it("freezes the draft as the next version and is idempotent while it is unchanged", async () => {
    const id = await createTemplate({ name: "Publish", html: "<p>p</p>", alias: "publish-me" });
    const first = await call(fullKey, "POST", `/templates/publish-me/publish`);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      object: "template",
      id,
      version: 1,
      created: true,
      tags: [],
    });

    const published = await getTemplate(id);
    expect(published.body).toMatchObject({
      status: "published",
      version: 1,
      has_unpublished_versions: false,
    });
    expect(published.body.published_at).toEqual(expect.any(String));
    expect(published.body.current_version_id).not.toBe(id);

    for (const key of [id, "publish-me"]) {
      const again = await call(fullKey, "POST", `/templates/${key}/publish`);
      expect(again.status, key).toBe(200);
      expect(await again.json()).toEqual({
        object: "template",
        id,
        version: 1,
        created: false,
        tags: [],
      });
    }
    expect((await getTemplate(id)).body).toEqual(published.body);
    expect((await call(otherTeamKey, "POST", `/templates/${id}/publish`)).status).toBe(404);
    expect((await call(fullKey, "POST", `/templates/${crypto.randomUUID()}/publish`)).status).toBe(
      404,
    );
  });

  it("marks the template as having unpublished changes after an edit", async () => {
    const id = await createTemplate({ name: "Edited", html: "<p>one</p>" });
    await call(fullKey, "POST", `/templates/${id}/publish`);
    await call(fullKey, "PATCH", `/templates/${id}`, { html: "<p>two</p>" });
    expect((await getTemplate(id)).body).toMatchObject({
      status: "published",
      version: 1,
      has_unpublished_versions: true,
      html: "<p>two</p>",
    });
    const next = await call(fullKey, "POST", `/templates/${id}/publish`);
    expect(await next.json()).toMatchObject({ version: 2, created: true });
  });

  it("sets tags in the same call and 422s a bad tag name or body", async () => {
    const id = await createTemplate({ name: "Tagged", html: "<p>t</p>" });
    const ok = await call(fullKey, "POST", `/templates/${id}/publish`, {
      tags: ["production", "staging"],
    });
    expect(await ok.json()).toMatchObject({ version: 1, tags: ["production", "staging"] });
    expect((await getTemplate(id)).body.tags).toEqual(["production", "staging"]);

    for (const tags of [["has space"], ["123"], ["-x"], ["a".repeat(65)]]) {
      const res = await call(fullKey, "POST", `/templates/${id}/publish`, { tags });
      expect(res.status, tags[0]).toBe(422);
      expect(await res.json()).toMatchObject({
        name: "validation_error",
        message: expect.stringMatching(/^tags?[.:]/),
      });
    }
    const tooMany = await call(fullKey, "POST", `/templates/${id}/publish`, {
      tags: ["a", "b", "c", "d", "e", "f"],
    });
    expect(tooMany.status).toBe(422);
  });
});

describe("template versions", () => {
  async function twoVersions() {
    const id = await createTemplate({ name: "Versions", subject: "S1", html: "<p>one</p>" });
    await call(fullKey, "POST", `/templates/${id}/publish`);
    await call(fullKey, "PATCH", `/templates/${id}`, { subject: "S2", html: "<p>two</p>" });
    await call(fullKey, "POST", `/templates/${id}/publish`);
    return id;
  }

  it("lists versions newest first, without content, and reads one with its content", async () => {
    const id = await twoVersions();
    const list = await call(fullKey, "GET", `/templates/${id}/versions`);
    expect(list.status).toBe(200);
    const body = (await list.json()) as { object: string; data: Record<string, unknown>[] };
    expect(body.object).toBe("list");
    expect(body.data.map((v) => v.version)).toEqual([2, 1]);
    expect(body.data[0]).toMatchObject({
      object: "template_version",
      template_id: id,
      name: "Versions",
      tags: [],
    });
    expect(body.data[0]).not.toHaveProperty("html");

    const one = await call(fullKey, "GET", `/templates/${id}/versions/1`);
    expect(await one.json()).toMatchObject({
      object: "template_version",
      version: 1,
      subject: "S1",
      html: "<p>one</p>",
      text: null,
      preview_text: null,
    });
    expect((await call(fullKey, "GET", `/templates/${id}/versions/9`)).status).toBe(404);
    expect((await call(otherTeamKey, "GET", `/templates/${id}/versions`)).status).toBe(404);
    expect((await call(otherTeamKey, "GET", `/templates/${id}/versions/1`)).status).toBe(404);
  });

  it("keeps a version unchanged when the draft is edited or the template renamed", async () => {
    const id = await twoVersions();
    await call(fullKey, "PATCH", `/templates/${id}`, { name: "Renamed", html: "<p>three</p>" });
    const one = await call(fullKey, "GET", `/templates/${id}/versions/2`);
    expect(await one.json()).toMatchObject({ name: "Versions", html: "<p>two</p>" });
  });

  it("refuses to delete a tagged version, then deletes it once untagged", async () => {
    const id = await twoVersions();
    await call(fullKey, "PUT", `/templates/${id}/tags/production`, { version: 1 });
    const refused = await call(fullKey, "DELETE", `/templates/${id}/versions/1`);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      name: "template_version_tagged",
      message: expect.stringMatching(/tag production/),
    });
    await call(fullKey, "DELETE", `/templates/${id}/tags/production`);
    const gone = await call(fullKey, "DELETE", `/templates/${id}/versions/1`);
    expect(gone.status).toBe(200);
    expect(await gone.json()).toEqual({
      object: "template_version",
      version: 1,
      deleted: true,
    });
    expect((await call(fullKey, "DELETE", `/templates/${id}/versions/1`)).status).toBe(404);
  });

  it("goes away with the template", async () => {
    const id = await twoVersions();
    await call(fullKey, "PUT", `/templates/${id}/tags/production`, { version: 2 });
    expect((await call(fullKey, "DELETE", `/templates/${id}`)).status).toBe(200);
    expect((await call(fullKey, "GET", `/templates/${id}/versions`)).status).toBe(404);
  });
});

describe("template tags", () => {
  it("sets, moves, lists and deletes a tag, and shows it on the template and its version", async () => {
    const id = await createTemplate({ name: "Tags", html: "<p>one</p>" });
    await call(fullKey, "POST", `/templates/${id}/publish`);
    await call(fullKey, "PATCH", `/templates/${id}`, { html: "<p>two</p>" });
    await call(fullKey, "POST", `/templates/${id}/publish`);

    const set = await call(fullKey, "PUT", `/templates/${id}/tags/production`, { version: 1 });
    expect(set.status).toBe(200);
    expect(await set.json()).toMatchObject({
      object: "template_tag",
      name: "production",
      version: 1,
    });
    expect((await getTemplate(id)).body.tags).toEqual(["production"]);

    const moved = await call(fullKey, "PUT", `/templates/${id}/tags/production`, { version: 2 });
    expect(await moved.json()).toMatchObject({ name: "production", version: 2 });

    const list = await call(fullKey, "GET", `/templates/${id}/tags`);
    expect(await list.json()).toMatchObject({
      object: "list",
      data: [{ name: "production", version: 2 }],
    });
    const version = await call(fullKey, "GET", `/templates/${id}/versions/2`);
    expect(((await version.json()) as { tags: string[] }).tags).toEqual(["production"]);

    const removed = await call(fullKey, "DELETE", `/templates/${id}/tags/production`);
    expect(await removed.json()).toEqual({
      object: "template_tag",
      name: "production",
      deleted: true,
    });
    expect((await call(fullKey, "DELETE", `/templates/${id}/tags/production`)).status).toBe(404);
  });

  it("404s a tag on a version that does not exist or another team's template, 422s a bad name", async () => {
    const id = await createTemplate({ name: "Tag errors", html: "<p>x</p>" });
    await call(fullKey, "POST", `/templates/${id}/publish`);
    expect((await call(fullKey, "PUT", `/templates/${id}/tags/live`, { version: 7 })).status).toBe(
      404,
    );
    expect(
      (await call(otherTeamKey, "PUT", `/templates/${id}/tags/live`, { version: 1 })).status,
    ).toBe(404);
    const bad = await call(fullKey, "PUT", `/templates/${id}/tags/has%20space`, { version: 1 });
    expect(bad.status).toBe(422);
    const missingVersion = await call(fullKey, "PUT", `/templates/${id}/tags/live`, {});
    expect(missingVersion.status).toBe(422);
  });
});

describe("POST /templates/{id}/duplicate", () => {
  it("copies content and document into a new alias-less template", async () => {
    const id = await createTemplate({
      name: "Original",
      subject: "Sub",
      html: "<p>o</p>",
      text: "o",
      alias: "original",
    });
    const document = { type: "doc", content: [] };
    // Preview text is dashboard-only, so it is set on the row.
    await db
      .update(schema.templates)
      .set({ document, previewText: "Peek" })
      .where(eq(schema.templates.id, id));

    const res = await call(fullKey, "POST", "/templates/original/duplicate");
    expect(res.status).toBe(200);
    const copy = (await res.json()) as { object: string; id: string };
    expect(copy.object).toBe("template");
    expect(copy.id).not.toBe(id);

    const [row] = await db.select().from(schema.templates).where(eq(schema.templates.id, copy.id));
    expect(row).toMatchObject({
      teamId,
      name: "Original (copy)",
      alias: null,
      subject: "Sub",
      html: "<p>o</p>",
      text: "o",
      previewText: "Peek",
      document,
    });
    expect((await call(otherTeamKey, "POST", `/templates/${id}/duplicate`)).status).toBe(404);
  });
});

describe("DELETE /templates/{id}", () => {
  it("deletes by id or alias and 404s afterwards; a foreign team cannot delete", async () => {
    const id = await createTemplate({ name: "Doomed", html: "<p>d</p>", alias: "doomed" });
    expect((await call(otherTeamKey, "DELETE", `/templates/${id}`)).status).toBe(404);
    expect((await getTemplate(id)).status).toBe(200);

    const res = await call(fullKey, "DELETE", "/templates/doomed");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ object: "template", id, deleted: true });
    expect((await getTemplate(id)).status).toBe(404);
    expect((await call(fullKey, "DELETE", `/templates/${id}`)).status).toBe(404);
  });
});

describe("permission confinement", () => {
  it("403s a sending_access key on every /templates route", async () => {
    const id = crypto.randomUUID();
    for (const [method, path, body] of [
      ["GET", "/templates", undefined],
      ["POST", "/templates", { name: "x", html: "<p>x</p>" }],
      ["GET", `/templates/${id}`, undefined],
      ["PATCH", `/templates/${id}`, { name: "x" }],
      ["DELETE", `/templates/${id}`, undefined],
      ["POST", `/templates/${id}/publish`, undefined],
      ["POST", `/templates/${id}/duplicate`, undefined],
      ["GET", `/templates/${id}/versions`, undefined],
      ["GET", `/templates/${id}/versions/1`, undefined],
      ["DELETE", `/templates/${id}/versions/1`, undefined],
      ["GET", `/templates/${id}/tags`, undefined],
      ["PUT", `/templates/${id}/tags/production`, { version: 1 }],
      ["DELETE", `/templates/${id}/tags/production`, undefined],
    ] as const) {
      const res = await call(sendKey, method, path, body);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(await res.json()).toMatchObject({ statusCode: 403, name: "restricted_api_key" });
    }
  });
});
