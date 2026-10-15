import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  deleteTemplateTag,
  deleteTemplateVersion,
  getTemplateVersion,
  listTemplateTags,
  listTemplateVersions,
  MAX_TEMPLATE_TAGS,
  MAX_TEMPLATE_VERSIONS,
  newestVersions,
  publishState,
  publishTemplate,
  setTemplateTag,
  type TemplateVersionRow,
  tagNameProblem,
  tagNamesByTemplate,
} from "@posta/core";
import type { Db } from "@posta/db";
import { schema } from "@posta/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { type Env, errorBody, isUniqueViolation, keysetPage } from "../app.js";
import {
  createTemplateRequestSchema,
  errorSchema,
  getTemplateResponseSchema,
  getTemplateVersionResponseSchema,
  listQuerySchema,
  listTemplatesResponseSchema,
  listTemplateTagsResponseSchema,
  listTemplateVersionsResponseSchema,
  publishTemplateRequestSchema,
  publishTemplateResponseSchema,
  removeTemplateResponseSchema,
  removeTemplateTagResponseSchema,
  removeTemplateVersionResponseSchema,
  setTemplateTagRequestSchema,
  templateIdResponseSchema,
  templateTagSchema,
  updateTemplateRequestSchema,
} from "../schemas.js";

const DRAFT_PUBLISH_CYCLE =
  "A template row is the working draft: edits are not sent anywhere until POST /templates/{id}/publish freezes it as the next numbered version.";

export function registerTemplateRoutes(app: OpenAPIHono<Env>, db: Db): void {
  const jsonErr = (description: string) => ({
    content: { "application/json": { schema: errorSchema } },
    description,
  });
  // The resend SDK passes one "identifier" (id or alias) to every
  // single-template call.
  const idParam = z.object({ id: z.string().min(1).describe("Template id or alias") });
  const t = schema.templates;

  type Newest = TemplateVersionRow | undefined;

  const listItem = (row: typeof t.$inferSelect, newest: Newest, tags: readonly string[]) => {
    const state = publishState(row, newest);
    return {
      id: row.id,
      name: row.name,
      alias: row.alias,
      status: state.status,
      published_at: state.publishedAt?.toISOString() ?? null,
      version: state.version,
      tags: [...tags],
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  };

  const wire = (row: typeof t.$inferSelect, newest: Newest, tags: readonly string[]) => ({
    object: "template" as const,
    ...listItem(row, newest, tags),
    // The id of the newest published version; a draft has none yet, so the
    // template's own id stands in (the SDK types this as a string).
    current_version_id: newest?.id ?? row.id,
    from: null,
    subject: row.subject,
    reply_to: null,
    preview_text: row.previewText,
    html: row.html,
    text: row.text,
    variables: [],
    has_unpublished_versions: publishState(row, newest).hasUnpublishedChanges,
  });

  const byIdOrAlias = (teamId: string, idOrAlias: string) =>
    and(
      eq(t.teamId, teamId),
      z.uuid().safeParse(idOrAlias).success ? eq(t.id, idOrAlias) : eq(t.alias, idOrAlias),
    );

  const findTemplate = async (teamId: string, idOrAlias: string) =>
    (await db.select().from(t).where(byIdOrAlias(teamId, idOrAlias)))[0];

  const versionParam = idParam.extend({
    version: z.coerce.number().int().min(1).describe("Version number"),
  });
  const tagParam = idParam.extend({ name: z.string().min(1).max(200).describe("Tag name") });

  const notFound = () => errorBody(404, "not_found", "Template not found");

  // null carries nothing to drop, so it is not an unsupported value.
  const unsupportedField = (body: {
    from?: unknown;
    reply_to?: unknown;
    variables?: unknown[] | undefined;
  }): string | null =>
    body.from != null
      ? "from"
      : body.reply_to != null
        ? "reply_to"
        : body.variables?.length
          ? "variables"
          : null;

  const aliasTaken = () => errorBody(409, "validation_error", "Template alias already exists");

  app.openapi(
    createRoute({
      method: "post",
      path: "/templates",
      request: {
        body: { content: { "application/json": { schema: createTemplateRequestSchema } } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: templateIdResponseSchema } },
          description: `Template created as a draft. ${DRAFT_PUBLISH_CYCLE}`,
        },
        409: jsonErr("Alias already in use"),
        422: jsonErr("Validation error, including from/reply_to/variables (not supported yet)"),
      },
    }),
    async (c) => {
      const auth = c.get("auth");
      const body = c.req.valid("json");
      const unsupported = unsupportedField(body);
      if (unsupported) {
        return c.json(
          errorBody(422, "validation_error", `${unsupported} is not supported on templates yet`),
          422,
        );
      }
      try {
        const [row] = await db
          .insert(t)
          .values({
            teamId: auth.teamId,
            name: body.name,
            alias: body.alias ?? null,
            subject: body.subject || null,
            html: body.html,
            text: body.text || null,
          })
          .returning({ id: t.id });
        if (!row) throw new Error("template insert returned no row");
        return c.json({ object: "template" as const, id: row.id }, 200);
      } catch (error) {
        if (isUniqueViolation(error)) return c.json(aliasTaken(), 409);
        throw error;
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/templates",
      request: { query: listQuerySchema },
      responses: {
        200: {
          content: { "application/json": { schema: listTemplatesResponseSchema } },
          description: "Templates",
        },
        422: jsonErr("Validation error"),
      },
    }),
    async (c) => {
      const auth = c.get("auth");
      const page = await keysetPage({
        query: c.req.valid("query"),
        createdAt: t.createdAt,
        id: t.id,
        loadCursor: async (id) =>
          (
            await db
              .select({ createdAt: t.createdAt, id: t.id })
              .from(t)
              .where(and(eq(t.id, id), eq(t.teamId, auth.teamId)))
          )[0],
        loadRows: (cond, descending, take) =>
          db
            .select()
            .from(t)
            .where(and(eq(t.teamId, auth.teamId), cond))
            .orderBy(
              ...(descending ? [desc(t.createdAt), desc(t.id)] : [asc(t.createdAt), asc(t.id)]),
            )
            .limit(take),
      });
      if (page === "bad_cursor") {
        return c.json(
          errorBody(
            422,
            "validation_error",
            "invalid pagination cursor: after and before take the id of an item this list returned",
          ),
          422,
        );
      }
      const ids = page.rows.map((row) => row.id);
      const [newest, tags] = await Promise.all([
        newestVersions(db, ids),
        tagNamesByTemplate(db, ids),
      ]);
      return c.json(
        {
          object: "list" as const,
          data: page.rows.map((row) => listItem(row, newest.get(row.id), tags.get(row.id) ?? [])),
          has_more: page.hasMore,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/templates/{id}",
      request: { params: idParam },
      responses: {
        200: {
          content: { "application/json": { schema: getTemplateResponseSchema } },
          description: `Template by id or alias, with the working draft's content. ${DRAFT_PUBLISH_CYCLE} from, reply_to and variables are not supported yet and read as null, null and [].`,
        },
        404: jsonErr("Not found"),
      },
    }),
    async (c) => {
      const auth = c.get("auth");
      const row = await findTemplate(auth.teamId, c.req.valid("param").id);
      if (!row) return c.json(notFound(), 404);
      const [newest, tags] = await Promise.all([
        newestVersions(db, [row.id]),
        tagNamesByTemplate(db, [row.id]),
      ]);
      return c.json(wire(row, newest.get(row.id), tags.get(row.id) ?? []), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/templates/{id}",
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: updateTemplateRequestSchema } } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: templateIdResponseSchema } },
          description: `Template draft updated. ${DRAFT_PUBLISH_CYCLE}`,
        },
        404: jsonErr("Not found"),
        409: jsonErr("Alias already in use"),
        422: jsonErr("Validation error, including from/reply_to/variables (not supported yet)"),
      },
    }),
    async (c) => {
      const auth = c.get("auth");
      const body = c.req.valid("json");
      const unsupported = unsupportedField(body);
      if (unsupported) {
        return c.json(
          errorBody(422, "validation_error", `${unsupported} is not supported on templates yet`),
          422,
        );
      }
      const set: Partial<typeof t.$inferInsert> = {};
      if (body.name !== undefined) set.name = body.name;
      if (body.alias !== undefined) set.alias = body.alias;
      if (body.subject !== undefined) set.subject = body.subject || null;
      if (body.html !== undefined) set.html = body.html;
      if (body.text !== undefined) set.text = body.text || null;
      // The dashboard editor treats `document` as the source of truth and
      // re-renders html/text from it on every save, so a raw html/text write
      // must drop it or be silently overwritten on the next dashboard save.
      if (set.html !== undefined || set.text !== undefined) set.document = null;
      const scope = byIdOrAlias(auth.teamId, c.req.valid("param").id);
      // An empty PATCH body is a valid no-op, like the other resources.
      if (Object.keys(set).length === 0) {
        const [row] = await db.select({ id: t.id }).from(t).where(scope);
        if (!row) return c.json(notFound(), 404);
        return c.json({ object: "template" as const, id: row.id }, 200);
      }
      try {
        const [row] = await db
          .update(t)
          .set({ ...set, updatedAt: new Date() })
          .where(scope)
          .returning({ id: t.id });
        if (!row) return c.json(notFound(), 404);
        return c.json({ object: "template" as const, id: row.id }, 200);
      } catch (error) {
        if (isUniqueViolation(error)) return c.json(aliasTaken(), 409);
        throw error;
      }
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/templates/{id}",
      request: { params: idParam },
      responses: {
        200: {
          content: { "application/json": { schema: removeTemplateResponseSchema } },
          description:
            "Template deleted with its versions and tags. Broadcasts keep their own copy of the content.",
        },
        404: jsonErr("Not found"),
      },
    }),
    async (c) => {
      const auth = c.get("auth");
      const [row] = await db
        .delete(t)
        .where(byIdOrAlias(auth.teamId, c.req.valid("param").id))
        .returning({ id: t.id });
      if (!row) return c.json(notFound(), 404);
      return c.json({ object: "template" as const, id: row.id, deleted: true as const }, 200);
    },
  );

  const versionLimit = () =>
    errorBody(
      422,
      "template_version_limit",
      `A template holds at most ${MAX_TEMPLATE_VERSIONS} versions: delete an old one first`,
    );
  const tagLimit = () =>
    errorBody(
      422,
      "template_tag_limit",
      `A template holds at most ${MAX_TEMPLATE_TAGS} tags: delete one first`,
    );
  const badTag = (problem: string) => errorBody(422, "validation_error", `tag: ${problem}`);

  app.openapi(
    createRoute({
      method: "post",
      path: "/templates/{id}/publish",
      // The body is optional and read by hand: the resend SDK posts an empty
      // body under a JSON content type, which a declared body would refuse as
      // malformed JSON. A body of {"tags": ["production"]} points those tags
      // at the version.
      request: { params: idParam },
      responses: {
        200: {
          content: { "application/json": { schema: publishTemplateResponseSchema } },
          description:
            "Version published, or the newest one returned with created: false when the draft has not changed since it. Optional JSON body: { tags: string[] } (up to 5) to point those tags at the version",
        },
        400: jsonErr("Malformed JSON body"),
        404: jsonErr("Not found"),
        422: jsonErr("Validation error, or the version or tag limit is reached"),
      },
    }),
    async (c) => {
      const auth = c.get("auth");
      const raw = (await c.req.text()).trim();
      let tags: string[] = [];
      if (raw !== "") {
        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch {
          return c.json(errorBody(400, "invalid_parameter", "Malformed JSON in request body"), 400);
        }
        const parsed = publishTemplateRequestSchema.safeParse(json);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const where = issue?.path.join(".");
          return c.json(
            errorBody(
              422,
              "validation_error",
              where ? `${where}: ${issue?.message}` : (issue?.message ?? "Invalid body"),
            ),
            422,
          );
        }
        tags = parsed.data.tags ?? [];
      }
      for (const name of tags) {
        const problem = tagNameProblem(name);
        if (problem) return c.json(badTag(problem), 422);
      }
      const row = await findTemplate(auth.teamId, c.req.valid("param").id);
      if (!row) return c.json(notFound(), 404);
      const out = await publishTemplate(db, auth.teamId, row.id, { tags });
      if (!out.ok) {
        if (out.reason === "not_found") return c.json(notFound(), 404);
        return c.json(out.reason === "version_limit" ? versionLimit() : tagLimit(), 422);
      }
      return c.json(
        {
          object: "template" as const,
          id: row.id,
          version: out.version,
          created: out.created,
          tags: out.tags,
        },
        200,
      );
    },
  );

  const versionNotFound = () => errorBody(404, "not_found", "Template version not found");

  const versionWire = (
    row: Awaited<ReturnType<typeof listTemplateVersions>>[number],
    tagNames: readonly string[],
  ) => ({
    object: "template_version" as const,
    id: row.id,
    template_id: row.templateId,
    version: row.version,
    name: row.name,
    tags: [...tagNames],
    created_at: row.createdAt.toISOString(),
  });

  const tagsByVersion = async (templateId: string) => {
    const out = new Map<number, string[]>();
    for (const tag of await listTemplateTags(db, templateId)) {
      const list = out.get(tag.version) ?? [];
      list.push(tag.name);
      out.set(tag.version, list);
    }
    return out;
  };

  app.openapi(
    createRoute({
      method: "get",
      path: "/templates/{id}/versions",
      request: { params: idParam },
      responses: {
        200: {
          content: { "application/json": { schema: listTemplateVersionsResponseSchema } },
          description: "Published versions, newest first, without their content",
        },
        404: jsonErr("Not found"),
      },
    }),
    async (c) => {
      const row = await findTemplate(c.get("auth").teamId, c.req.valid("param").id);
      if (!row) return c.json(notFound(), 404);
      const [versions, tags] = await Promise.all([
        listTemplateVersions(db, row.id),
        tagsByVersion(row.id),
      ]);
      return c.json(
        {
          object: "list" as const,
          data: versions.map((v) => versionWire(v, tags.get(v.version) ?? [])),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/templates/{id}/versions/{version}",
      request: { params: versionParam },
      responses: {
        200: {
          content: { "application/json": { schema: getTemplateVersionResponseSchema } },
          description: "One published version with its frozen content",
        },
        404: jsonErr("Template or version not found"),
      },
    }),
    async (c) => {
      const { id, version } = c.req.valid("param");
      const row = await findTemplate(c.get("auth").teamId, id);
      if (!row) return c.json(notFound(), 404);
      const found = await getTemplateVersion(db, row.id, version);
      if (!found) return c.json(versionNotFound(), 404);
      const tags = await tagsByVersion(row.id);
      return c.json(
        {
          ...versionWire(found, tags.get(found.version) ?? []),
          subject: found.subject,
          preview_text: found.previewText,
          html: found.html,
          text: found.text,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/templates/{id}/versions/{version}",
      request: { params: versionParam },
      responses: {
        200: {
          content: { "application/json": { schema: removeTemplateVersionResponseSchema } },
          description: "Version deleted. Its number is not reused",
        },
        404: jsonErr("Template or version not found"),
        409: jsonErr("A tag still points at the version"),
      },
    }),
    async (c) => {
      const { id, version } = c.req.valid("param");
      const row = await findTemplate(c.get("auth").teamId, id);
      if (!row) return c.json(notFound(), 404);
      const out = await deleteTemplateVersion(db, row.id, version);
      if (!out.ok) {
        if (out.reason === "not_found") return c.json(versionNotFound(), 404);
        return c.json(
          errorBody(
            409,
            "template_version_tagged",
            `Version ${version} is used by ${out.tags.length === 1 ? "tag" : "tags"} ${out.tags.join(", ")}: move or delete ${out.tags.length === 1 ? "it" : "them"} first`,
          ),
          409,
        );
      }
      return c.json({ object: "template_version" as const, version, deleted: true as const }, 200);
    },
  );

  const tagWire = (tag: Awaited<ReturnType<typeof listTemplateTags>>[number]) => ({
    object: "template_tag" as const,
    name: tag.name,
    version: tag.version,
    created_at: tag.createdAt.toISOString(),
    updated_at: tag.updatedAt.toISOString(),
  });

  app.openapi(
    createRoute({
      method: "get",
      path: "/templates/{id}/tags",
      request: { params: idParam },
      responses: {
        200: {
          content: { "application/json": { schema: listTemplateTagsResponseSchema } },
          description: "Tags of the template, by name",
        },
        404: jsonErr("Not found"),
      },
    }),
    async (c) => {
      const row = await findTemplate(c.get("auth").teamId, c.req.valid("param").id);
      if (!row) return c.json(notFound(), 404);
      const tags = await listTemplateTags(db, row.id);
      return c.json({ object: "list" as const, data: tags.map(tagWire) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/templates/{id}/tags/{name}",
      request: {
        params: tagParam,
        body: { content: { "application/json": { schema: setTemplateTagRequestSchema } } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: templateTagSchema } },
          description:
            "Tag created, or moved to the version. Sends that name the tag use the new version from their next request",
        },
        404: jsonErr("Template or version not found"),
        422: jsonErr("Invalid tag name, or the tag limit is reached"),
      },
    }),
    async (c) => {
      const { id, name } = c.req.valid("param");
      const problem = tagNameProblem(name);
      if (problem) return c.json(badTag(problem), 422);
      const row = await findTemplate(c.get("auth").teamId, id);
      if (!row) return c.json(notFound(), 404);
      const out = await setTemplateTag(db, row.id, name, c.req.valid("json").version);
      if (!out.ok) {
        if (out.reason === "version_not_found") return c.json(versionNotFound(), 404);
        return c.json(tagLimit(), 422);
      }
      return c.json(tagWire(out.tag), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/templates/{id}/tags/{name}",
      request: { params: tagParam },
      responses: {
        200: {
          content: { "application/json": { schema: removeTemplateTagResponseSchema } },
          description: "Tag deleted. The version it pointed at stays",
        },
        404: jsonErr("Template or tag not found"),
      },
    }),
    async (c) => {
      const { id, name } = c.req.valid("param");
      const row = await findTemplate(c.get("auth").teamId, id);
      if (!row) return c.json(notFound(), 404);
      if (!(await deleteTemplateTag(db, row.id, name))) {
        return c.json(errorBody(404, "not_found", "Template tag not found"), 404);
      }
      return c.json({ object: "template_tag" as const, name, deleted: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/templates/{id}/duplicate",
      request: { params: idParam },
      responses: {
        200: {
          content: { "application/json": { schema: templateIdResponseSchema } },
          description: 'Copy named "<name> (copy)" with no alias; returns the new template id',
        },
        404: jsonErr("Not found"),
      },
    }),
    async (c) => {
      const auth = c.get("auth");
      const source = await findTemplate(auth.teamId, c.req.valid("param").id);
      if (!source) return c.json(notFound(), 404);
      const [row] = await db
        .insert(t)
        .values({
          teamId: auth.teamId,
          name: `${source.name} (copy)`,
          subject: source.subject,
          previewText: source.previewText,
          html: source.html,
          text: source.text,
          document: source.document,
        })
        .returning({ id: t.id });
      if (!row) throw new Error("template insert returned no row");
      return c.json({ object: "template" as const, id: row.id }, 200);
    },
  );
}
