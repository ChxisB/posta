import type { Db } from "@posta/db";
import { schema } from "@posta/db";
import { createTeam, createTestDb } from "@posta/test-utils";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteTemplateTag,
  deleteTemplateVersion,
  listTemplateVersions,
  MAX_TEMPLATE_TAGS,
  newestVersions,
  publishState,
  publishTemplate,
  renderTemplateContent,
  resolveTemplateRef,
  setTemplateTag,
  tagNameProblem,
} from "../src/template-versions.js";

let db: Db;
let close: () => Promise<void>;
let teamId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  teamId = await createTeam(db);
});
afterEach(() => close());

async function template(
  values: Partial<typeof schema.templates.$inferInsert> = {},
  team = teamId,
): Promise<string> {
  const [row] = await db
    .insert(schema.templates)
    .values({
      teamId: team,
      name: "Welcome",
      subject: "Hello {{{FIRST_NAME|there}}}",
      html: "<p>Hi {{{FIRST_NAME|there}}}</p>",
      ...values,
    })
    .returning({ id: schema.templates.id });
  if (!row) throw new Error("template insert failed");
  return row.id;
}

const edit = (id: string, html: string) =>
  db.update(schema.templates).set({ html }).where(eq(schema.templates.id, id));

describe("publishTemplate", () => {
  it("numbers versions from 1 and freezes the draft at publish time", async () => {
    const id = await template({ html: "<p>one</p>" });
    expect(await publishTemplate(db, teamId, id)).toEqual({
      ok: true,
      version: 1,
      created: true,
      tags: [],
    });
    await edit(id, "<p>two</p>");
    expect(await publishTemplate(db, teamId, id)).toMatchObject({ version: 2, created: true });

    const versions = await listTemplateVersions(db, id);
    expect(versions.map((v) => [v.version, v.html])).toEqual([
      [2, "<p>two</p>"],
      [1, "<p>one</p>"],
    ]);
    // A later edit never reaches a frozen version.
    await edit(id, "<p>three</p>");
    expect((await listTemplateVersions(db, id)).map((v) => v.html)).toEqual([
      "<p>two</p>",
      "<p>one</p>",
    ]);
  });

  it("is idempotent while the draft equals the newest version", async () => {
    const id = await template();
    await publishTemplate(db, teamId, id);
    expect(await publishTemplate(db, teamId, id)).toMatchObject({ version: 1, created: false });
    expect(await listTemplateVersions(db, id)).toHaveLength(1);
  });

  it("does not count a rename as an unpublished change", async () => {
    const id = await template();
    await publishTemplate(db, teamId, id);
    await db.update(schema.templates).set({ name: "Renamed" }).where(eq(schema.templates.id, id));
    expect(await publishTemplate(db, teamId, id)).toMatchObject({ version: 1, created: false });
  });

  it("reuses no number after a version is deleted", async () => {
    const id = await template({ html: "<p>one</p>" });
    await publishTemplate(db, teamId, id);
    await edit(id, "<p>two</p>");
    await publishTemplate(db, teamId, id);
    await deleteTemplateVersion(db, id, 2);
    await edit(id, "<p>three</p>");
    expect(await publishTemplate(db, teamId, id)).toMatchObject({ version: 3, created: true });
  });

  it("points each named tag at the new version, moving one that exists", async () => {
    const id = await template({ html: "<p>one</p>" });
    await publishTemplate(db, teamId, id, { tags: ["production", "staging"] });
    await edit(id, "<p>two</p>");
    const outcome = await publishTemplate(db, teamId, id, { tags: ["staging"] });
    expect(outcome).toMatchObject({ ok: true, version: 2 });
    const tags = await db.select().from(schema.templateTags);
    expect(Object.fromEntries(tags.map((t) => [t.name, t.version]))).toEqual({
      production: 1,
      staging: 2,
    });
  });

  it("refuses another team's template", async () => {
    const other = await createTeam(db, "other");
    const id = await template({}, other);
    expect(await publishTemplate(db, teamId, id)).toEqual({ ok: false, reason: "not_found" });
  });

  it("gives two concurrent publishes of one draft the same version", async () => {
    const id = await template();
    const [a, b] = await Promise.all([
      publishTemplate(db, teamId, id),
      publishTemplate(db, teamId, id),
    ]);
    expect(a).toMatchObject({ ok: true, version: 1 });
    expect(b).toMatchObject({ ok: true, version: 1 });
    expect(await listTemplateVersions(db, id)).toHaveLength(1);
  });
});

describe("publishState", () => {
  it("reads draft until the first publish, then compares the draft to the newest version", async () => {
    const id = await template();
    const [row] = await db.select().from(schema.templates).where(eq(schema.templates.id, id));
    if (!row) throw new Error("missing");
    expect(publishState(row, undefined)).toMatchObject({
      status: "draft",
      version: null,
      hasUnpublishedChanges: true,
    });

    await publishTemplate(db, teamId, id);
    const newest = (await newestVersions(db, [id])).get(id);
    expect(publishState(row, newest)).toMatchObject({
      status: "published",
      version: 1,
      hasUnpublishedChanges: false,
    });
    expect(publishState({ ...row, html: "<p>edited</p>" }, newest).hasUnpublishedChanges).toBe(
      true,
    );
  });
});

describe("tags", () => {
  it("validates names", () => {
    expect(tagNameProblem("production")).toBeNull();
    expect(tagNameProblem("v1.2-rc_1")).toBeNull();
    expect(tagNameProblem("")).not.toBeNull();
    expect(tagNameProblem("has space")).not.toBeNull();
    expect(tagNameProblem("-leading")).not.toBeNull();
    expect(tagNameProblem("12")).not.toBeNull();
    expect(tagNameProblem("a".repeat(65))).not.toBeNull();
  });

  it("sets, moves and deletes a tag", async () => {
    const id = await template({ html: "<p>one</p>" });
    await publishTemplate(db, teamId, id);
    await edit(id, "<p>two</p>");
    await publishTemplate(db, teamId, id);

    expect(await setTemplateTag(db, id, "production", 1)).toMatchObject({ ok: true });
    expect(await setTemplateTag(db, id, "production", 2)).toMatchObject({
      ok: true,
      tag: { version: 2 },
    });
    expect(await setTemplateTag(db, id, "production", 9)).toEqual({
      ok: false,
      reason: "version_not_found",
    });
    expect(await deleteTemplateTag(db, id, "production")).toBe(true);
    expect(await deleteTemplateTag(db, id, "production")).toBe(false);
  });

  it("caps tags per template", async () => {
    const id = await template();
    await publishTemplate(db, teamId, id);
    for (let i = 0; i < MAX_TEMPLATE_TAGS; i++) await setTemplateTag(db, id, `t${i}`, 1);
    expect(await setTemplateTag(db, id, "one-too-many", 1)).toEqual({
      ok: false,
      reason: "tag_limit",
    });
    // Moving an existing tag is not a new one.
    expect(await setTemplateTag(db, id, "t0", 1)).toMatchObject({ ok: true });
  });

  it("keeps a tagged version from being deleted", async () => {
    const id = await template();
    await publishTemplate(db, teamId, id, { tags: ["production"] });
    expect(await deleteTemplateVersion(db, id, 1)).toEqual({
      ok: false,
      reason: "tagged",
      tags: ["production"],
    });
    await deleteTemplateTag(db, id, "production");
    expect(await deleteTemplateVersion(db, id, 1)).toEqual({ ok: true });
    expect(await deleteTemplateVersion(db, id, 1)).toEqual({ ok: false, reason: "not_found" });
  });

  it("goes with the template when it is deleted", async () => {
    const id = await template();
    await publishTemplate(db, teamId, id, { tags: ["production"] });
    await db.delete(schema.templates).where(eq(schema.templates.id, id));
    expect(await db.select().from(schema.templateVersions)).toEqual([]);
    expect(await db.select().from(schema.templateTags)).toEqual([]);
  });
});

describe("resolveTemplateRef", () => {
  it("defaults to the newest published version, never the draft", async () => {
    const id = await template({ html: "<p>one</p>", alias: "welcome" });
    await publishTemplate(db, teamId, id);
    await edit(id, "<p>draft only</p>");
    const byAlias = await resolveTemplateRef(db, teamId, { id: "welcome" });
    expect(byAlias).toMatchObject({
      ok: true,
      templateId: id,
      version: 1,
      tag: null,
      content: { html: "<p>one</p>" },
    });
  });

  it("resolves an exact version and a tag", async () => {
    const id = await template({ html: "<p>one</p>" });
    await publishTemplate(db, teamId, id, { tags: ["production"] });
    await edit(id, "<p>two</p>");
    await publishTemplate(db, teamId, id);

    expect(await resolveTemplateRef(db, teamId, { id, version: 1 })).toMatchObject({
      version: 1,
      content: { html: "<p>one</p>" },
    });
    expect(await resolveTemplateRef(db, teamId, { id, tag: "production" })).toMatchObject({
      version: 1,
      tag: "production",
    });
    expect(await resolveTemplateRef(db, teamId, { id })).toMatchObject({ version: 2 });
  });

  it("reports what is missing", async () => {
    const id = await template();
    expect(await resolveTemplateRef(db, teamId, { id })).toEqual({
      ok: false,
      reason: "not_published",
    });
    await publishTemplate(db, teamId, id);
    expect(await resolveTemplateRef(db, teamId, { id, version: 7 })).toEqual({
      ok: false,
      reason: "version_not_found",
      version: 7,
    });
    expect(await resolveTemplateRef(db, teamId, { id, tag: "nope" })).toEqual({
      ok: false,
      reason: "tag_not_found",
      tag: "nope",
    });
    expect(await resolveTemplateRef(db, teamId, { id: "missing-alias" })).toEqual({
      ok: false,
      reason: "template_not_found",
    });
  });

  it("does not resolve another team's template", async () => {
    const other = await createTeam(db, "other");
    const id = await template({}, other);
    await publishTemplate(db, other, id);
    expect(await resolveTemplateRef(db, teamId, { id })).toEqual({
      ok: false,
      reason: "template_not_found",
    });
  });
});

describe("renderTemplateContent", () => {
  const content = {
    subject: "Hello {{{FIRST_NAME|there}}}",
    previewText: "For {{{FIRST_NAME|you}}}",
    html: '<body><p>Order {{{ORDER}}}</p><a href="{{{LINK}}}">Open</a></body>',
    text: "Order {{{ORDER|none}}}",
  };

  it("fills variables, builtins included, and escapes them in the html", () => {
    const out = renderTemplateContent(content, {
      FIRST_NAME: "Ada",
      ORDER: "<b>42</b>",
      LINK: "https://example.com/o/42",
    });
    expect(out.subject).toBe("Hello Ada");
    expect(out.html).toContain("<p>Order &lt;b&gt;42&lt;/b&gt;</p>");
    expect(out.html).toContain('href="https://example.com/o/42"');
    expect(out.html).toContain("For Ada");
    expect(out.text).toBe("Order <b>42</b>");
  });

  it("takes the fallback, or nothing, for a variable that was not sent", () => {
    const out = renderTemplateContent(content, {});
    expect(out.subject).toBe("Hello there");
    expect(out.text).toBe("Order none");
    expect(out.html).toContain("<p>Order </p>");
  });

  it("accepts numbers", () => {
    expect(renderTemplateContent({ ...content, subject: "No. {{{N}}}" }, { N: 7 }).subject).toBe(
      "No. 7",
    );
  });

  it("refuses a script URL in a link", () => {
    const out = renderTemplateContent(content, { LINK: "javascript:alert(1)" });
    expect(out.html).toContain('href=""');
  });

  it("keeps a line break out of the subject", () => {
    const out = renderTemplateContent(
      { ...content, subject: "Hi {{{NAME}}}" },
      {
        NAME: "Ada\r\nBcc: x@example.com",
      },
    );
    expect(out.subject).toBe("Hi Ada Bcc: x@example.com");
  });

  it("leaves the unsubscribe tokens for the worker", () => {
    const out = renderTemplateContent(
      {
        subject: null,
        previewText: null,
        html: '<a href="{{{UNSUBSCRIBE_URL}}}">Out</a> <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Out</a>',
        text: "Out: {{{UNSUBSCRIBE_URL}}}",
      },
      {},
    );
    expect(out.html).toBe(
      '<a href="{{{UNSUBSCRIBE_URL}}}">Out</a> <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Out</a>',
    );
    expect(out.text).toBe("Out: {{{UNSUBSCRIBE_URL}}}");
    expect(out.subject).toBeNull();
  });
});
