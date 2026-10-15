import type { Db } from "@posta/db";
import { schema } from "@posta/db";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { applyMergeFields, injectPreheader } from "./broadcast-content.js";
import { UNSUBSCRIBE_URL_TOKENS } from "./unsubscribe.js";

/** Published versions kept per template. Delete old ones to publish more. */
export const MAX_TEMPLATE_VERSIONS = 200;
/** Named tags per template. */
export const MAX_TEMPLATE_TAGS = 20;
/** Tags that one publish call may set. */
export const MAX_PUBLISH_TAGS = 5;

/**
 * Letters, digits, dot, dash and underscore; starts with a letter or digit.
 * Case-sensitive. A name made of digits only is refused so that a tag can
 * never be mistaken for a version number in a URL or a log line.
 */
const TAG_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** The reason a tag name is refused, or null when it is fine. */
export function tagNameProblem(name: string): string | null {
  if (!TAG_NAME.test(name)) {
    return "tag names use letters, digits, dots, dashes and underscores, start with a letter or digit, and run to 64 characters";
  }
  if (/^[0-9]+$/.test(name))
    return "tag names cannot be only digits, since those are version numbers";
  return null;
}

type TemplateRow = typeof schema.templates.$inferSelect;
export type TemplateVersionRow = typeof schema.templateVersions.$inferSelect;
export type TemplateTagRow = typeof schema.templateTags.$inferSelect;

/** What a version freezes, and what the working draft is compared against. */
export interface TemplateContent {
  subject: string | null;
  previewText: string | null;
  html: string;
  text: string | null;
  document: unknown;
}

/**
 * Whether two contents would send the same mail. The name is left out: a
 * rename changes nothing a recipient sees, so it is not an unpublished edit.
 */
export function sameTemplateContent(a: TemplateContent, b: TemplateContent): boolean {
  return (
    (a.subject ?? null) === (b.subject ?? null) &&
    (a.previewText ?? null) === (b.previewText ?? null) &&
    a.html === b.html &&
    (a.text ?? null) === (b.text ?? null) &&
    JSON.stringify(a.document ?? null) === JSON.stringify(b.document ?? null)
  );
}

export interface PublishState {
  status: "draft" | "published";
  /** Highest version number still present; null while nothing is published. */
  version: number | null;
  publishedAt: Date | null;
  /** The working draft differs from the newest published version. */
  hasUnpublishedChanges: boolean;
}

export function publishState(
  draft: TemplateContent,
  newest: (Pick<TemplateVersionRow, "version" | "createdAt"> & TemplateContent) | undefined,
): PublishState {
  if (!newest) {
    return { status: "draft", version: null, publishedAt: null, hasUnpublishedChanges: true };
  }
  return {
    status: "published",
    version: newest.version,
    publishedAt: newest.createdAt,
    hasUnpublishedChanges: !sameTemplateContent(draft, newest),
  };
}

/** The newest version of each template, keyed by template id. One query. */
export async function newestVersions(
  db: Db,
  templateIds: readonly string[],
): Promise<Map<string, TemplateVersionRow>> {
  const out = new Map<string, TemplateVersionRow>();
  if (templateIds.length === 0) return out;
  const v = schema.templateVersions;
  const rows = await db
    .selectDistinctOn([v.templateId])
    .from(v)
    .where(inArray(v.templateId, [...templateIds]))
    .orderBy(v.templateId, desc(v.version));
  for (const row of rows) out.set(row.templateId, row);
  return out;
}

/** Tag names per template, each list sorted. One query. */
export async function tagNamesByTemplate(
  db: Db,
  templateIds: readonly string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (templateIds.length === 0) return out;
  const g = schema.templateTags;
  const rows = await db
    .select({ templateId: g.templateId, name: g.name })
    .from(g)
    .where(inArray(g.templateId, [...templateIds]))
    .orderBy(asc(g.name));
  for (const row of rows) {
    const list = out.get(row.templateId) ?? [];
    list.push(row.name);
    out.set(row.templateId, list);
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A template of this team by id or alias, or undefined. */
export async function findTemplateByRef(
  db: Db,
  teamId: string,
  idOrAlias: string,
): Promise<TemplateRow | undefined> {
  const t = schema.templates;
  const match = UUID.test(idOrAlias) ? eq(t.id, idOrAlias) : eq(t.alias, idOrAlias);
  return (
    await db
      .select()
      .from(t)
      .where(and(eq(t.teamId, teamId), match))
  )[0];
}

export type PublishOutcome =
  | { ok: true; version: number; created: boolean; tags: string[] }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "version_limit" }
  | { ok: false; reason: "tag_limit" };

/**
 * Freezes the working draft as the next numbered version and points each of
 * `tags` at it. Idempotent: when the draft equals the newest version nothing
 * new is made and that version is returned with `created: false`, so a retried
 * publish or a double click never burns a number. The template row is locked
 * for the whole call, so two concurrent publishes get distinct numbers.
 */
export async function publishTemplate(
  db: Db,
  teamId: string,
  templateId: string,
  opts: { tags?: readonly string[] | undefined } = {},
): Promise<PublishOutcome> {
  const t = schema.templates;
  const v = schema.templateVersions;
  const g = schema.templateTags;
  const tags = [...new Set(opts.tags ?? [])];
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(t)
      .where(and(eq(t.id, templateId), eq(t.teamId, teamId)))
      .for("update");
    if (!row) return { ok: false, reason: "not_found" } as const;

    const [newest] = await tx
      .select()
      .from(v)
      .where(eq(v.templateId, row.id))
      .orderBy(desc(v.version))
      .limit(1);

    let version: number;
    let created = false;
    if (newest && sameTemplateContent(row, newest)) {
      version = newest.version;
    } else {
      const [{ n = 0 } = {}] = await tx
        .select({ n: count() })
        .from(v)
        .where(eq(v.templateId, row.id));
      if (n >= MAX_TEMPLATE_VERSIONS) return { ok: false, reason: "version_limit" } as const;
      version = row.latestVersion + 1;
      await tx.insert(v).values({
        templateId: row.id,
        version,
        name: row.name,
        subject: row.subject,
        previewText: row.previewText,
        html: row.html,
        text: row.text,
        document: row.document,
      });
      await tx.update(t).set({ latestVersion: version }).where(eq(t.id, row.id));
      created = true;
    }

    if (tags.length > 0) {
      const existing = await tx.select({ name: g.name }).from(g).where(eq(g.templateId, row.id));
      const known = new Set(existing.map((e) => e.name));
      const added = tags.filter((name) => !known.has(name)).length;
      if (known.size + added > MAX_TEMPLATE_TAGS)
        return { ok: false, reason: "tag_limit" } as const;
      const now = new Date();
      for (const name of tags) {
        await tx
          .insert(g)
          .values({ templateId: row.id, name, version })
          .onConflictDoUpdate({
            target: [g.templateId, g.name],
            set: { version, updatedAt: now },
          });
      }
    }
    return { ok: true, version, created, tags } as const;
  });
}

/** Versions of a template, newest first. */
export async function listTemplateVersions(
  db: Db,
  templateId: string,
): Promise<TemplateVersionRow[]> {
  const v = schema.templateVersions;
  return db.select().from(v).where(eq(v.templateId, templateId)).orderBy(desc(v.version));
}

export async function getTemplateVersion(
  db: Db,
  templateId: string,
  version: number,
): Promise<TemplateVersionRow | undefined> {
  const v = schema.templateVersions;
  return (
    await db
      .select()
      .from(v)
      .where(and(eq(v.templateId, templateId), eq(v.version, version)))
  )[0];
}

export type DeleteVersionOutcome =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "tagged"; tags: string[] };

/**
 * Removes one version. Refused while a tag points at it: moving or deleting
 * the tag first is a deliberate step, never a side effect that makes a
 * production send start failing.
 */
export async function deleteTemplateVersion(
  db: Db,
  templateId: string,
  version: number,
): Promise<DeleteVersionOutcome> {
  const v = schema.templateVersions;
  const g = schema.templateTags;
  const tagged = await db
    .select({ name: g.name })
    .from(g)
    .where(and(eq(g.templateId, templateId), eq(g.version, version)))
    .orderBy(asc(g.name));
  if (tagged.length > 0) return { ok: false, reason: "tagged", tags: tagged.map((r) => r.name) };
  try {
    const gone = await db
      .delete(v)
      .where(and(eq(v.templateId, templateId), eq(v.version, version)))
      .returning({ id: v.id });
    return gone.length > 0 ? { ok: true } : { ok: false, reason: "not_found" };
  } catch (error) {
    // A tag was set between the check and the delete: the FK refuses it.
    if (isForeignKeyViolation(error)) {
      const now = await db
        .select({ name: g.name })
        .from(g)
        .where(and(eq(g.templateId, templateId), eq(g.version, version)));
      return { ok: false, reason: "tagged", tags: now.map((r) => r.name) };
    }
    throw error;
  }
}

function isForeignKeyViolation(err: unknown): boolean {
  let e: unknown = err;
  while (e instanceof Error) {
    if ((e as { code?: string }).code === "23503") return true;
    e = e.cause;
  }
  return false;
}

export async function listTemplateTags(db: Db, templateId: string): Promise<TemplateTagRow[]> {
  const g = schema.templateTags;
  return db.select().from(g).where(eq(g.templateId, templateId)).orderBy(asc(g.name));
}

export type SetTagOutcome =
  | { ok: true; tag: TemplateTagRow }
  | { ok: false; reason: "version_not_found" }
  | { ok: false; reason: "tag_limit" };

/** Points the tag at `version`, creating the tag on first use. */
export async function setTemplateTag(
  db: Db,
  templateId: string,
  name: string,
  version: number,
): Promise<SetTagOutcome> {
  const g = schema.templateTags;
  const v = schema.templateVersions;
  const t = schema.templates;
  return db.transaction(async (tx) => {
    // The template row is the lock: it serializes this against a publish and
    // against a second tag write, so the count below cannot be raced past.
    await tx.select({ id: t.id }).from(t).where(eq(t.id, templateId)).for("update");
    const [exists] = await tx
      .select({ id: v.id })
      .from(v)
      .where(and(eq(v.templateId, templateId), eq(v.version, version)));
    if (!exists) return { ok: false, reason: "version_not_found" } as const;
    const [current] = await tx
      .select({ id: g.id })
      .from(g)
      .where(and(eq(g.templateId, templateId), eq(g.name, name)));
    if (!current) {
      const [{ n = 0 } = {}] = await tx
        .select({ n: count() })
        .from(g)
        .where(eq(g.templateId, templateId));
      if (n >= MAX_TEMPLATE_TAGS) return { ok: false, reason: "tag_limit" } as const;
    }
    const [tag] = await tx
      .insert(g)
      .values({ templateId, name, version })
      .onConflictDoUpdate({
        target: [g.templateId, g.name],
        set: { version, updatedAt: new Date() },
      })
      .returning();
    if (!tag) throw new Error("template tag upsert returned no row");
    return { ok: true, tag } as const;
  });
}

export async function deleteTemplateTag(
  db: Db,
  templateId: string,
  name: string,
): Promise<boolean> {
  const g = schema.templateTags;
  const gone = await db
    .delete(g)
    .where(and(eq(g.templateId, templateId), eq(g.name, name)))
    .returning({ id: g.id });
  return gone.length > 0;
}

/** A template reference as a send request names it. */
export interface TemplateRef {
  /** Template id or alias. */
  id: string;
  version?: number | undefined;
  tag?: string | undefined;
}

export type ResolveOutcome =
  | {
      ok: true;
      templateId: string;
      version: number;
      tag: string | null;
      content: TemplateContent & { name: string };
    }
  | { ok: false; reason: "template_not_found" }
  | { ok: false; reason: "not_published" }
  | { ok: false; reason: "version_not_found"; version: number }
  | { ok: false; reason: "tag_not_found"; tag: string };

/**
 * Turns a reference into one frozen version. With neither `version` nor `tag`
 * the newest published version is used, never the draft: a send must not pick
 * up an edit nobody has published yet.
 */
export async function resolveTemplateRef(
  db: Db,
  teamId: string,
  ref: TemplateRef,
): Promise<ResolveOutcome> {
  const template = await findTemplateByRef(db, teamId, ref.id);
  if (!template) return { ok: false, reason: "template_not_found" };
  const v = schema.templateVersions;
  const g = schema.templateTags;

  let row: TemplateVersionRow | undefined;
  let tag: string | null = null;
  if (ref.tag !== undefined) {
    const [hit] = await db
      .select({ version: v })
      .from(g)
      .innerJoin(v, and(eq(v.templateId, g.templateId), eq(v.version, g.version)))
      .where(and(eq(g.templateId, template.id), eq(g.name, ref.tag)));
    if (!hit) return { ok: false, reason: "tag_not_found", tag: ref.tag };
    row = hit.version;
    tag = ref.tag;
  } else if (ref.version !== undefined) {
    row = await getTemplateVersion(db, template.id, ref.version);
    if (!row) return { ok: false, reason: "version_not_found", version: ref.version };
  } else {
    row = (
      await db
        .select()
        .from(v)
        .where(eq(v.templateId, template.id))
        .orderBy(desc(v.version))
        .limit(1)
    )[0];
    if (!row) return { ok: false, reason: "not_published" };
  }
  return {
    ok: true,
    templateId: template.id,
    version: row.version,
    tag,
    content: {
      name: row.name,
      subject: row.subject,
      previewText: row.previewText,
      html: row.html,
      text: row.text,
      document: row.document,
    },
  };
}

// Private-use characters stand in for the unsubscribe tokens while merge
// fields run: those tokens belong to the worker, which fills them per
// recipient, and the merge step would otherwise empty them as unknown names.
const HOLD_OPEN = "";
const HOLD_CLOSE = "";

function holdTokens(content: string): string {
  let out = content;
  UNSUBSCRIBE_URL_TOKENS.forEach((token, i) => {
    out = out.replaceAll(token, `${HOLD_OPEN}${i}${HOLD_CLOSE}`);
  });
  return out;
}

function releaseTokens(content: string): string {
  let out = content;
  UNSUBSCRIBE_URL_TOKENS.forEach((token, i) => {
    out = out.replaceAll(`${HOLD_OPEN}${i}${HOLD_CLOSE}`, token);
  });
  return out;
}

export type TemplateVariables = Record<string, string | number>;

/**
 * Fills a version's `{{{NAME}}}` and `{{{NAME|fallback}}}` fields from the
 * send's `variables`. Same rules as broadcast merge fields: a missing value
 * takes the fallback or "", html bodies get values escaped, and a value that
 * opens a link must be an http(s) or mailto URL. The preview text becomes a
 * hidden preheader; unsubscribe tokens pass through for the worker.
 */
export function renderTemplateContent(
  content: Pick<TemplateContent, "subject" | "previewText" | "html" | "text">,
  variables: TemplateVariables = {},
): { subject: string | null; html: string; text: string | null } {
  const properties: Record<string, string> = {};
  for (const [name, value] of Object.entries(variables)) properties[name] = String(value);
  const contact = {
    email: properties.EMAIL ?? "",
    firstName: properties.FIRST_NAME ?? null,
    lastName: properties.LAST_NAME ?? null,
    properties,
  };
  const fill = (source: string, html: boolean) =>
    releaseTokens(applyMergeFields(holdTokens(source), contact, { html }));

  let html = fill(content.html, true);
  if (content.previewText) {
    const preview = fill(content.previewText, false).trim();
    if (preview) html = injectPreheader(html, preview);
  }
  return {
    // A value cannot carry a line break into the Subject header.
    subject:
      content.subject === null ? null : fill(content.subject, false).replace(/[\r\n]+/g, " "),
    html,
    text: content.text === null ? null : fill(content.text, false),
  };
}
