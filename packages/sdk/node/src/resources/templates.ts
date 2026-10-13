import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import { listQuery } from "../query.js";
import type {
  CreateTemplateOptions,
  List,
  ListOptions,
  RemoveTemplateResponse,
  Template,
  TemplateId,
  TemplateListItem,
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
 * Email templates. Every save is live, so `publish` is a no-op kept for
 * Resend compatibility. `id` arguments accept the template id or its alias.
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

  /** PATCH /templates/:idOrAlias — `alias`/`subject`/`text: null` clear the field. */
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

  /** POST /templates/:idOrAlias/publish — no-op (templates are always live). */
  publish(idOrAlias: string): Promise<Result<TemplateId>> {
    return this.http.request({
      method: "POST",
      path: `/templates/${encodeURIComponent(idOrAlias)}/publish`,
    });
  }

  /** POST /templates/:idOrAlias/duplicate — copies into a new template (id of the copy). */
  duplicate(idOrAlias: string): Promise<Result<TemplateId>> {
    return this.http.request({
      method: "POST",
      path: `/templates/${encodeURIComponent(idOrAlias)}/duplicate`,
    });
  }
}
