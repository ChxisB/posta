import {
  deleteTemplateTag,
  deleteTemplateVersion,
  getTemplateVersion,
  listTemplateTags,
  MAX_TEMPLATE_TAGS,
  MAX_TEMPLATE_VERSIONS,
  newestVersions,
  publishState,
  publishTemplate,
  setTemplateTag,
  tagNameProblem,
  tagNamesByTemplate,
} from "@posta/core";
import type { Db } from "@posta/db";
import { schema } from "@posta/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";
import { mailyDocumentSchema } from "@/lib/email-doc";
import { PREVIEW_TEXT_MAX } from "@/lib/preview-text";
import { resolveEditorSave } from "../email-content";
import { beforeCursor, createdAtCursorField, cursorSchema, paginate } from "../keyset";
import { router, teamProcedure } from "../trpc";

const nameSchema = z.string().trim().min(1).max(200);
// "" clears the field: stored as null, never as an empty string.
const subjectSchema = z.string().trim().max(998);
const previewTextSchema = z.string().trim().max(PREVIEW_TEXT_MAX);
const bodySchema = z.string().max(500_000);
// Maily editor source of truth; null clears it back to a legacy raw-HTML row.
const documentSchema = mailyDocumentSchema.nullable();

const versionSchema = z.number().int().min(1);
const tagNameSchema = z
  .string()
  .trim()
  .superRefine((name, ctx) => {
    const problem = tagNameProblem(name);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

type TemplateRow = typeof schema.templates.$inferSelect;

async function getOwnTemplate(ctx: { db: Db; teamId: string }, id: string): Promise<TemplateRow> {
  const t = schema.templates;
  const [row] = await ctx.db
    .select()
    .from(t)
    .where(and(eq(t.id, id), eq(t.teamId, ctx.teamId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  return row;
}

export const templatesRouter = router({
  list: teamProcedure
    .input(
      z.object({
        cursor: cursorSchema.optional(),
        limit: z.number().int().min(1).max(50).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      const t = schema.templates;
      // Templates page on (updatedAt desc, id desc): a template you just
      // edited surfaces first. The keyset helpers are column-agnostic, so
      // updatedAt rides in their createdAt slot.
      const keys = { createdAt: t.updatedAt, id: t.id };
      const filters = [eq(t.teamId, ctx.teamId)];
      if (input.cursor) {
        const cursorFilter = beforeCursor(keys, input.cursor);
        if (cursorFilter) filters.push(cursorFilter);
      }
      const rows = await ctx.db
        .select({
          id: t.id,
          name: t.name,
          updatedAt: t.updatedAt,
          // Mirrors lib/email-doc isMailyDoc: anything but a Tiptap doc node
          // is html authored outside the block editor, shown as such in the list.
          htmlAuthored: sql<boolean>`${t.document} is null or ${t.document}->>'type' is distinct from 'doc'`,
          cursorCreatedAt: createdAtCursorField(keys),
        })
        .from(t)
        .where(and(...filters))
        .orderBy(desc(t.updatedAt), desc(t.id))
        .limit(input.limit + 1);
      const page = paginate(rows, input.limit);
      // The newest version number and the tags of each row shown, in two small
      // queries (no version content is read for a list).
      const ids = page.items.map((item) => item.id);
      const newest = new Map<string, number>();
      if (ids.length > 0) {
        const v = schema.templateVersions;
        const latest = await ctx.db
          .select({ templateId: v.templateId, version: max(v.version) })
          .from(v)
          .where(inArray(v.templateId, ids))
          .groupBy(v.templateId);
        for (const row of latest) if (row.version !== null) newest.set(row.templateId, row.version);
      }
      const tags = await tagNamesByTemplate(ctx.db, ids);
      return {
        ...page,
        items: page.items.map((item) => ({
          ...item,
          version: newest.get(item.id) ?? null,
          tags: tags.get(item.id) ?? [],
        })),
      };
    }),

  get: teamProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const template = await getOwnTemplate(ctx, input.id);
    // The composer copies a template's body into the broadcast it sends, and
    // no column records which template a broadcast came from, so a template's
    // text cannot be told apart from the text of mail already delivered. A
    // support view, which never sees sent content, therefore sees none of it.
    // The preview text is copied with the body and becomes its preheader.
    if (!ctx.supportView) return { ...template, hiddenBySupportView: false };
    return {
      ...template,
      previewText: null,
      html: null,
      text: null,
      document: null,
      hiddenBySupportView: true,
    };
  }),

  /**
   * Where a template stands: unpublished, or the newest version and whether the
   * saved draft has moved on from it, plus its tags. Carries no content, so a
   * support view reads it as it is.
   */
  state: teamProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const template = await getOwnTemplate(ctx, input.id);
    const newest = (await newestVersions(ctx.db, [template.id])).get(template.id);
    const state = publishState(template, newest);
    const tags = await listTemplateTags(ctx.db, template.id);
    return {
      status: state.status,
      version: state.version,
      publishedAt: state.publishedAt,
      hasUnpublishedChanges: state.hasUnpublishedChanges,
      tags: tags.map((tag) => ({ name: tag.name, version: tag.version })),
    };
  }),

  /** The versions of a template, newest first, with the tags that point at each. No content. */
  versions: teamProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    await getOwnTemplate(ctx, input.id);
    const v = schema.templateVersions;
    const rows = await ctx.db
      .select({ version: v.version, name: v.name, subject: v.subject, createdAt: v.createdAt })
      .from(v)
      .where(eq(v.templateId, input.id))
      .orderBy(desc(v.version));
    const tags = await listTemplateTags(ctx.db, input.id);
    return rows.map((row) => ({
      ...row,
      tags: tags.filter((tag) => tag.version === row.version).map((tag) => tag.name),
    }));
  }),

  /** One version's content, for loading it into the editor. Hidden in a support view like the draft. */
  version: teamProcedure
    .input(z.object({ id: z.uuid(), version: versionSchema }))
    .query(async ({ ctx, input }) => {
      await getOwnTemplate(ctx, input.id);
      const row = await getTemplateVersion(ctx.db, input.id, input.version);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const content = {
        version: row.version,
        subject: row.subject,
        createdAt: row.createdAt,
      };
      if (!ctx.supportView) {
        return {
          ...content,
          previewText: row.previewText,
          html: row.html,
          text: row.text,
          document: row.document,
          hiddenBySupportView: false,
        };
      }
      return {
        ...content,
        previewText: null,
        html: null,
        text: null,
        document: null,
        hiddenBySupportView: true,
      };
    }),

  /** Freezes the saved draft as the next version. A draft equal to the newest version makes none. */
  publish: teamProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const out = await publishTemplate(ctx.db, ctx.teamId, input.id);
    if (!out.ok) {
      if (out.reason === "not_found") throw new TRPCError({ code: "NOT_FOUND" });
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `A template can have at most ${MAX_TEMPLATE_VERSIONS} versions; delete an old one first.`,
      });
    }
    return { version: out.version, created: out.created };
  }),

  /** Points a tag at a version, making the tag on first use and moving it after that. */
  setTag: teamProcedure
    .input(z.object({ id: z.uuid(), name: tagNameSchema, version: versionSchema }))
    .mutation(async ({ ctx, input }) => {
      await getOwnTemplate(ctx, input.id);
      const out = await setTemplateTag(ctx.db, input.id, input.name, input.version);
      if (!out.ok) {
        if (out.reason === "version_not_found") throw new TRPCError({ code: "NOT_FOUND" });
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `A template can have at most ${MAX_TEMPLATE_TAGS} tags; remove one first.`,
        });
      }
      return { name: out.tag.name, version: out.tag.version };
    }),

  removeTag: teamProcedure
    .input(z.object({ id: z.uuid(), name: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      await getOwnTemplate(ctx, input.id);
      if (!(await deleteTemplateTag(ctx.db, input.id, input.name))) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return { name: input.name };
    }),

  /** Deletes one version. Refused while a tag points at it. */
  deleteVersion: teamProcedure
    .input(z.object({ id: z.uuid(), version: versionSchema }))
    .mutation(async ({ ctx, input }) => {
      await getOwnTemplate(ctx, input.id);
      const out = await deleteTemplateVersion(ctx.db, input.id, input.version);
      if (!out.ok) {
        if (out.reason === "not_found") throw new TRPCError({ code: "NOT_FOUND" });
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Version ${input.version} is tagged ${out.tags.join(", ")}. Move or remove the tags first.`,
        });
      }
      return { version: input.version };
    }),

  create: teamProcedure
    .input(
      z.object({
        name: nameSchema,
        subject: subjectSchema.optional(),
        previewText: previewTextSchema.optional(),
        html: bodySchema.min(1),
        text: bodySchema.optional(),
        document: documentSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const saved = await resolveEditorSave(input);
      const t = schema.templates;
      const [row] = await ctx.db
        .insert(t)
        .values({
          teamId: ctx.teamId,
          name: saved.name,
          subject: saved.subject || null,
          previewText: saved.previewText || null,
          html: saved.html,
          text: saved.text || null,
          document: saved.document ?? null,
        })
        .returning({ id: t.id });
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return { id: row.id };
    }),

  update: teamProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: nameSchema.optional(),
        subject: subjectSchema.optional(),
        previewText: previewTextSchema.optional(),
        html: bodySchema.min(1).optional(),
        text: bodySchema.optional(),
        document: documentSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getOwnTemplate(ctx, input.id);
      const saved = await resolveEditorSave(input);
      const t = schema.templates;
      await ctx.db
        .update(t)
        .set({
          ...(saved.name !== undefined ? { name: saved.name } : {}),
          ...(saved.subject !== undefined ? { subject: saved.subject || null } : {}),
          ...(saved.previewText !== undefined ? { previewText: saved.previewText || null } : {}),
          ...(saved.html !== undefined ? { html: saved.html } : {}),
          ...(saved.text !== undefined ? { text: saved.text || null } : {}),
          ...(saved.document !== undefined ? { document: saved.document } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(t.id, input.id), eq(t.teamId, ctx.teamId)));
      return { id: input.id };
    }),

  delete: teamProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    await getOwnTemplate(ctx, input.id);
    const t = schema.templates;
    await ctx.db.delete(t).where(and(eq(t.id, input.id), eq(t.teamId, ctx.teamId)));
    return { id: input.id };
  }),

  duplicate: teamProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const source = await getOwnTemplate(ctx, input.id);
    const t = schema.templates;
    const [row] = await ctx.db
      .insert(t)
      .values({
        teamId: ctx.teamId,
        name: `${source.name} (copy)`,
        subject: source.subject,
        previewText: source.previewText,
        html: source.html,
        text: source.text,
        document: source.document,
      })
      .returning({ id: t.id });
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return { id: row.id };
  }),
});
