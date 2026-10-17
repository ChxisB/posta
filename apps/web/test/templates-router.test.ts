import type { Db } from "@posta/db";
import { schema } from "@posta/db";
import { createTeam, createTestDb } from "@posta/test-utils";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_TEXT_MAX } from "@/lib/preview-text";
import { createCaller } from "@/server/routers";

vi.mock("@posta/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@posta/db")>();
  return { ...mod, getDb: () => db };
});

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});

afterEach(async () => {
  await close();
});

function callerFor(teamId: string) {
  return createCaller({
    db,
    session: { user: { id: "u1", email: "u1@example.com", name: "u1" } },
    teamId,
    role: "owner",
  });
}

const TEMPLATE_INPUT = {
  name: "Welcome",
  subject: "Hello {{{FIRST_NAME|there}}}",
  html: "<p>Hi {{{FIRST_NAME|there}}}</p>",
  text: "Hi {{{FIRST_NAME|there}}}",
};

// A Maily/Tiptap doc: a paragraph carrying a variable node. The variable
// serializes to the worker's {{{FIRST_NAME|there}}} token when rendered.
const SAMPLE_DOC = {
  type: "doc" as const,
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Hi " },
        { type: "variable", attrs: { id: "FIRST_NAME", fallback: "there" } },
      ],
    },
  ],
};

async function templateRow(id: string) {
  const [row] = await db.select().from(schema.templates).where(eq(schema.templates.id, id));
  return row ?? null;
}

describe("templates.create / get / update / delete", () => {
  it("round-trips a template through create, get, and update", async () => {
    const teamId = await createTeam(db, "team-a");
    const caller = callerFor(teamId);

    const { id } = await caller.templates.create(TEMPLATE_INPUT);
    expect(await caller.templates.get({ id })).toMatchObject({ id, teamId, ...TEMPLATE_INPUT });

    await caller.templates.update({ id, name: "Welcome v2", subject: "" });
    // "" clears nullable fields: stored as null, never as an empty string.
    expect(await templateRow(id)).toMatchObject({ name: "Welcome v2", subject: null });
  });

  it("stores omitted optional fields as null", async () => {
    const teamId = await createTeam(db, "team-a");
    const caller = callerFor(teamId);
    const { id } = await caller.templates.create({ name: "Bare", html: "<p>x</p>" });
    expect(await templateRow(id)).toMatchObject({ subject: null, previewText: null, text: null });
  });

  it("stores preview text trimmed, clears it with an empty string, and caps it", async () => {
    const teamId = await createTeam(db, "team-a");
    const caller = callerFor(teamId);
    const { id } = await caller.templates.create({
      ...TEMPLATE_INPUT,
      previewText: "  Your receipt is inside  ",
    });
    expect(await caller.templates.get({ id })).toMatchObject({
      previewText: "Your receipt is inside",
    });
    // Kept apart from the body: the html is stored as sent, with no preheader.
    expect((await templateRow(id))?.html).toBe(TEMPLATE_INPUT.html);

    // An update that leaves it out keeps it.
    await caller.templates.update({ id, name: "Receipt" });
    expect((await templateRow(id))?.previewText).toBe("Your receipt is inside");

    await caller.templates.update({ id, previewText: "" });
    expect((await templateRow(id))?.previewText).toBeNull();

    await expect(
      caller.templates.update({ id, previewText: "a".repeat(PREVIEW_TEXT_MAX + 1) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("deletes a template", async () => {
    const teamId = await createTeam(db, "team-a");
    const caller = callerFor(teamId);
    const { id } = await caller.templates.create(TEMPLATE_INPUT);
    await caller.templates.delete({ id });
    expect(await templateRow(id)).toBeNull();
  });
});

describe("templates.duplicate", () => {
  it('inserts an independent copy named "<name> (copy)"', async () => {
    const teamId = await createTeam(db, "team-a");
    const caller = callerFor(teamId);
    const { id } = await caller.templates.create({ ...TEMPLATE_INPUT, previewText: "Peek" });

    const { id: copyId } = await caller.templates.duplicate({ id });
    expect(copyId).not.toBe(id);
    expect(await caller.templates.get({ id: copyId })).toMatchObject({
      ...TEMPLATE_INPUT,
      previewText: "Peek",
      name: "Welcome (copy)",
      teamId,
    });

    // Independent rows: editing the copy leaves the original alone.
    await caller.templates.update({ id: copyId, html: "<p>changed</p>" });
    expect((await templateRow(id))?.html).toBe(TEMPLATE_INPUT.html);
  });
});

describe("templates.list keyset paging", () => {
  it("pages on (updatedAt, id) desc without duplicates, most recently updated first", async () => {
    const teamId = await createTeam(db, "team-a");
    const caller = callerFor(teamId);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { id } = await caller.templates.create({ name: `t${i}`, html: "<p>x</p>" });
      ids.push(id);
    }
    const oldest = ids[0];
    if (!oldest) throw new Error("expected a created template id");
    // Distinct updatedAt so the recency ordering itself is observable. The
    // gap is stamped directly: inserts default to the DB's microsecond clock
    // while updates carry a millisecond JS Date, so real clocks can order an
    // update BEFORE a same-millisecond insert.
    await caller.templates.update({ id: oldest, name: "t0 edited" });
    await db
      .update(schema.templates)
      .set({ updatedAt: new Date(Date.now() + 60_000) })
      .where(eq(schema.templates.id, oldest));

    const page1 = await caller.templates.list({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.items[0]?.name).toBe("t0 edited");
    expect(page1.nextCursor).not.toBeNull();
    if (!page1.nextCursor) throw new Error("expected a next cursor");
    const page2 = await caller.templates.list({ limit: 2, cursor: page1.nextCursor });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    const seen = [...page1.items, ...page2.items].map((t) => t.id);
    expect(new Set(seen).size).toBe(3);
  });

  it("flags rows whose html was authored outside the block editor", async () => {
    const teamId = await createTeam(db, "team-a");
    const caller = callerFor(teamId);
    const { id: htmlId } = await caller.templates.create(TEMPLATE_INPUT);
    const { id: docId } = await caller.templates.create({
      name: "Doc",
      html: "<p>ignored</p>",
      document: SAMPLE_DOC,
    });
    const { items } = await caller.templates.list({});
    expect(items.find((t) => t.id === htmlId)?.htmlAuthored).toBe(true);
    expect(items.find((t) => t.id === docId)?.htmlAuthored).toBe(false);
  });
});

describe("templates.document", () => {
  it("round-trips a Maily document and renders send html with the token", async () => {
    const teamId = await createTeam(db, "team-a");
    const caller = callerFor(teamId);
    // A Maily document is the source: the client-sent html is ignored and the
    // send html is re-rendered from the document server-side.
    const { id } = await caller.templates.create({
      name: "Doc",
      html: "<p>ignored</p>",
      document: SAMPLE_DOC,
    });
    const got = await caller.templates.get({ id });
    expect(got.document).toEqual(SAMPLE_DOC);
    expect(got.html).toContain("{{{FIRST_NAME|there}}}");
    // A legacy row (no document) stays null and still opens.
    const { id: legacyId } = await caller.templates.create(TEMPLATE_INPUT);
    expect((await caller.templates.get({ id: legacyId })).document).toBeNull();
  });

  it("re-renders html from the document on update", async () => {
    const teamId = await createTeam(db, "team-a");
    const caller = callerFor(teamId);
    const { id } = await caller.templates.create({ name: "Doc", html: "<p>old</p>" });
    // Update carries only the document; html is re-derived from it, not sent.
    await caller.templates.update({ id, document: SAMPLE_DOC });
    expect((await templateRow(id))?.html).toContain("{{{FIRST_NAME|there}}}");
  });

  it("clears the document back to legacy raw-HTML when updated to null", async () => {
    const teamId = await createTeam(db, "team-a");
    const caller = callerFor(teamId);
    const { id } = await caller.templates.create({ ...TEMPLATE_INPUT, document: SAMPLE_DOC });
    await caller.templates.update({ id, document: null, html: "<p>raw</p>" });
    const row = await templateRow(id);
    expect(row?.document).toBeNull();
    expect(row?.html).toBe("<p>raw</p>");
  });

  it("rejects a non-Maily document via the zod guard", async () => {
    const teamId = await createTeam(db, "team-a");
    const caller = callerFor(teamId);
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: deliberately wrong shape
      caller.templates.create({ ...TEMPLATE_INPUT, document: { version: 2, blocks: [] } as any }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("templates publish, versions and tags", () => {
  async function published(caller: ReturnType<typeof callerFor>, html = "<p>one</p>") {
    const { id } = await caller.templates.create({ ...TEMPLATE_INPUT, html });
    await caller.templates.publish({ id });
    return id;
  }

  it("reports a template as unpublished, then as its newest version", async () => {
    const caller = callerFor(await createTeam(db, "team-a"));
    const { id } = await caller.templates.create(TEMPLATE_INPUT);
    expect(await caller.templates.state({ id })).toEqual({
      status: "draft",
      version: null,
      publishedAt: null,
      hasUnpublishedChanges: true,
      tags: [],
    });

    expect(await caller.templates.publish({ id })).toEqual({ version: 1, created: true });
    expect(await caller.templates.state({ id })).toMatchObject({
      status: "published",
      version: 1,
      hasUnpublishedChanges: false,
    });

    // An edit is a change to the draft: version 1 stays as it was published.
    await caller.templates.update({ id, html: "<p>two</p>" });
    expect(await caller.templates.state({ id })).toMatchObject({
      version: 1,
      hasUnpublishedChanges: true,
    });
    expect(await caller.templates.version({ id, version: 1 })).toMatchObject({
      html: TEMPLATE_INPUT.html,
    });
  });

  it("makes a new version only when the draft changed", async () => {
    const caller = callerFor(await createTeam(db, "team-a"));
    const id = await published(caller);
    // Same content: a second click names the same version and burns no number.
    expect(await caller.templates.publish({ id })).toEqual({ version: 1, created: false });
    // A rename is not a content change.
    await caller.templates.update({ id, name: "Renamed" });
    expect(await caller.templates.publish({ id })).toEqual({ version: 1, created: false });
    await caller.templates.update({ id, html: "<p>two</p>" });
    expect(await caller.templates.publish({ id })).toEqual({ version: 2, created: true });
  });

  it("lists versions newest first, without content, with the tags on each", async () => {
    const caller = callerFor(await createTeam(db, "team-a"));
    const id = await published(caller);
    await caller.templates.update({ id, html: "<p>two</p>" });
    await caller.templates.publish({ id });
    await caller.templates.setTag({ id, name: "production", version: 1 });

    const rows = await caller.templates.versions({ id });
    expect(rows.map((row) => [row.version, row.tags])).toEqual([
      [2, []],
      [1, ["production"]],
    ]);
    expect(rows[0]).not.toHaveProperty("html");
    expect(rows[0]).not.toHaveProperty("document");
  });

  it("sets, moves and removes a tag", async () => {
    const caller = callerFor(await createTeam(db, "team-a"));
    const id = await published(caller);
    await caller.templates.update({ id, html: "<p>two</p>" });
    await caller.templates.publish({ id });

    await caller.templates.setTag({ id, name: "production", version: 1 });
    // The same name again moves it.
    await caller.templates.setTag({ id, name: "production", version: 2 });
    expect((await caller.templates.state({ id })).tags).toEqual([
      { name: "production", version: 2 },
    ]);

    await caller.templates.removeTag({ id, name: "production" });
    expect((await caller.templates.state({ id })).tags).toEqual([]);
    await expect(caller.templates.removeTag({ id, name: "production" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses a bad tag name and a tag on a version that does not exist", async () => {
    const caller = callerFor(await createTeam(db, "team-a"));
    const id = await published(caller);
    for (const name of ["", "has space", "123", "-lead", "a".repeat(65)]) {
      await expect(caller.templates.setTag({ id, name, version: 1 })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
    await expect(
      caller.templates.setTag({ id, name: "production", version: 9 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes an untagged version and refuses a tagged one", async () => {
    const caller = callerFor(await createTeam(db, "team-a"));
    const id = await published(caller);
    await caller.templates.update({ id, html: "<p>two</p>" });
    await caller.templates.publish({ id });
    await caller.templates.setTag({ id, name: "production", version: 1 });

    await expect(caller.templates.deleteVersion({ id, version: 1 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("production"),
    });
    await caller.templates.deleteVersion({ id, version: 2 });
    expect((await caller.templates.versions({ id })).map((row) => row.version)).toEqual([1]);
    await expect(caller.templates.deleteVersion({ id, version: 2 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    // A number is never reused: the next publish is 3, not 2.
    await caller.templates.update({ id, html: "<p>three</p>" });
    expect(await caller.templates.publish({ id })).toEqual({ version: 3, created: true });
  });

  it("shows the newest version and tags on the list", async () => {
    const caller = callerFor(await createTeam(db, "team-a"));
    const id = await published(caller);
    await caller.templates.setTag({ id, name: "production", version: 1 });
    const { id: bare } = await caller.templates.create({ name: "Bare", html: "<p>x</p>" });

    const items = (await caller.templates.list({})).items;
    expect(items.find((row) => row.id === id)).toMatchObject({
      version: 1,
      tags: ["production"],
    });
    expect(items.find((row) => row.id === bare)).toMatchObject({ version: null, tags: [] });
  });

  it("keeps a duplicate unpublished and deletes versions and tags with the template", async () => {
    const caller = callerFor(await createTeam(db, "team-a"));
    const id = await published(caller);
    await caller.templates.setTag({ id, name: "production", version: 1 });

    const { id: copy } = await caller.templates.duplicate({ id });
    expect(await caller.templates.state({ id: copy })).toMatchObject({
      status: "draft",
      version: null,
      tags: [],
    });

    await caller.templates.delete({ id });
    expect(await db.select().from(schema.templateVersions)).toEqual([]);
    expect(await db.select().from(schema.templateTags)).toEqual([]);
  });

  it("is scoped to the team", async () => {
    const id = await published(callerFor(await createTeam(db, "team-a")));
    const b = callerFor(await createTeam(db, "team-b"));
    await expect(b.templates.state({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.templates.versions({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.templates.version({ id, version: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(b.templates.publish({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.templates.setTag({ id, name: "x", version: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(b.templates.removeTag({ id, name: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(b.templates.deleteVersion({ id, version: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("email.render", () => {
  it("renders a Maily document to html + text with the worker token, unresolved", async () => {
    const teamId = await createTeam(db, "team-a");
    const { html, text } = await callerFor(teamId).email.render({ document: SAMPLE_DOC });
    expect(html).toContain("{{{FIRST_NAME|there}}}");
    expect(text).toContain("Hi");
  });
});

describe("tenant isolation", () => {
  it("blocks every cross-team read and write", async () => {
    const teamA = await createTeam(db, "team-a");
    const teamB = await createTeam(db, "team-b");
    const { id } = await callerFor(teamA).templates.create(TEMPLATE_INPUT);

    const b = callerFor(teamB);
    await expect(b.templates.get({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.templates.update({ id, name: "hijack" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(b.templates.delete({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.templates.duplicate({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // list is scoped, not errored; the template survives all of it.
    expect((await b.templates.list({})).items).toEqual([]);
    expect((await templateRow(id))?.name).toBe(TEMPLATE_INPUT.name);
  });
});
