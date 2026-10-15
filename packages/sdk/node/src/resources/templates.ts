import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import { listQuery } from "../query.js";
import type {
  CreateTemplateOptions,
  List,
  ListOptions,
  PublishTemplateOptions,
  PublishTemplateResponse,
  RemoveTemplateResponse,
  RemoveTemplateTagResponse,
  RemoveTemplateVersionResponse,
  Template,
  TemplateId,
  TemplateListItem,
  TemplateTag,
  TemplateVersion,
  TemplateVersionListItem,
  UpdateTemplateOptions,
} from "../types.js";

function toWire(o: CreateTemplateOptions | UpdateTemplateOptions) {
  return {
    name: o.name,
    html: o.html,
    subject: o.subject,
    text: o.text,
    alias: o.alias,
    from: o.from,
    reply_to: o.replyTo,
    variables: o.variables,
  };
}

/**
 * Email templates. A template is a working draft until `publish` freezes it as
 * the next numbered version; sends and broadcasts name a version or a tag.
 * `id` arguments accept the template id or its alias.
 */
export class Templates {
  constructor(private readonly http: HttpClient) {}

  create(payload: CreateTemplateOptions): Promise<Result<TemplateId>> {
    return this.http.request({ method: "POST", path: "/templates", body: toWire(payload) });
  }

  list(options?: ListOptions): Promise<Result<List<TemplateListItem>>> {
    return this.http.request({ method: "GET", path: "/templates", query: listQuery(options) });
  }

  get(idOrAlias: string): Promise<Result<Template>> {
    return this.http.request({
      method: "GET",
      path: `/templates/${encodeURIComponent(idOrAlias)}`,
    });
  }

  /** PATCH /templates/:idOrAlias: `alias`/`subject`/`text: null` clear the field. */
  update(idOrAlias: string, payload: UpdateTemplateOptions): Promise<Result<TemplateId>> {
    return this.http.request({
      method: "PATCH",
      path: `/templates/${encodeURIComponent(idOrAlias)}`,
      body: toWire(payload),
    });
  }

  remove(idOrAlias: string): Promise<Result<RemoveTemplateResponse>> {
    return this.http.request({
      method: "DELETE",
      path: `/templates/${encodeURIComponent(idOrAlias)}`,
    });
  }

  /**
   * POST /templates/:idOrAlias/publish: freezes the draft as the next version,
   * or returns the newest one with `created: false` when nothing changed.
   */
  publish(
    idOrAlias: string,
    options: PublishTemplateOptions = {},
  ): Promise<Result<PublishTemplateResponse>> {
    return this.http.request({
      method: "POST",
      path: `/templates/${encodeURIComponent(idOrAlias)}/publish`,
      ...(options.tags ? { body: { tags: options.tags } } : {}),
    });
  }

  /** GET /templates/:idOrAlias/versions: newest first, without content. */
  listVersions(
    idOrAlias: string,
  ): Promise<Result<{ object: "list"; data: TemplateVersionListItem[] }>> {
    return this.http.request({
      method: "GET",
      path: `/templates/${encodeURIComponent(idOrAlias)}/versions`,
    });
  }

  /** GET /templates/:idOrAlias/versions/:version: one version with its frozen content. */
  getVersion(idOrAlias: string, version: number): Promise<Result<TemplateVersion>> {
    return this.http.request({
      method: "GET",
      path: `/templates/${encodeURIComponent(idOrAlias)}/versions/${version}`,
    });
  }

  /** DELETE /templates/:idOrAlias/versions/:version: refused with 409 while a tag points at it. */
  removeVersion(
    idOrAlias: string,
    version: number,
  ): Promise<Result<RemoveTemplateVersionResponse>> {
    return this.http.request({
      method: "DELETE",
      path: `/templates/${encodeURIComponent(idOrAlias)}/versions/${version}`,
    });
  }

  /** GET /templates/:idOrAlias/tags */
  listTags(idOrAlias: string): Promise<Result<{ object: "list"; data: TemplateTag[] }>> {
    return this.http.request({
      method: "GET",
      path: `/templates/${encodeURIComponent(idOrAlias)}/tags`,
    });
  }

  /** PUT /templates/:idOrAlias/tags/:name: creates the tag or moves it to `version`. */
  setTag(idOrAlias: string, name: string, version: number): Promise<Result<TemplateTag>> {
    return this.http.request({
      method: "PUT",
      path: `/templates/${encodeURIComponent(idOrAlias)}/tags/${encodeURIComponent(name)}`,
      body: { version },
    });
  }

  /** DELETE /templates/:idOrAlias/tags/:name: the version it pointed at stays. */
  removeTag(idOrAlias: string, name: string): Promise<Result<RemoveTemplateTagResponse>> {
    return this.http.request({
      method: "DELETE",
      path: `/templates/${encodeURIComponent(idOrAlias)}/tags/${encodeURIComponent(name)}`,
    });
  }

  /** POST /templates/:idOrAlias/duplicate: copies into a new template (id of the copy). */
  duplicate(idOrAlias: string): Promise<Result<TemplateId>> {
    return this.http.request({
      method: "POST",
      path: `/templates/${encodeURIComponent(idOrAlias)}/duplicate`,
    });
  }
}
