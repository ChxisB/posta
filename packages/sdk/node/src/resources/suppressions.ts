import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import { listQuery } from "../query.js";
import type {
  AddSuppressionOptions,
  BatchAddSuppressionsOptions,
  BatchRemoveSuppressionsOptions,
  List,
  ListSuppressionsOptions,
  RemoveSuppressionResponse,
  Suppression,
  SuppressionId,
  SuppressionListItem,
} from "../types.js";

/** Bulk suppression add/remove (up to 1000 per call). */
export class SuppressionsBatch {
  constructor(private readonly http: HttpClient) {}

  /** POST /suppressions/batch/add */
  add(options: BatchAddSuppressionsOptions): Promise<Result<{ data: SuppressionId[] }>> {
    return this.http.request({
      method: "POST",
      path: "/suppressions/batch/add",
      body: { emails: options.emails, origin: options.origin },
    });
  }

  /** POST /suppressions/batch/remove — by `emails` or by `ids`. */
  remove(
    options: BatchRemoveSuppressionsOptions,
  ): Promise<Result<{ data: RemoveSuppressionResponse[] }>> {
    return this.http.request({
      method: "POST",
      path: "/suppressions/batch/remove",
      body: { emails: options.emails, ids: options.ids },
    });
  }
}

/** The team's suppression list: addresses that are never sent to. */
export class Suppressions {
  readonly batch: SuppressionsBatch;

  constructor(private readonly http: HttpClient) {
    this.batch = new SuppressionsBatch(http);
  }

  /** POST /suppressions */
  add(options: AddSuppressionOptions): Promise<Result<SuppressionId>> {
    return this.http.request({
      method: "POST",
      path: "/suppressions",
      body: { email: options.email, origin: options.origin },
    });
  }

  /** Alias of {@link add}. */
  create(options: AddSuppressionOptions): Promise<Result<SuppressionId>> {
    return this.add(options);
  }

  /** GET /suppressions — optionally filtered by `origin`. */
  list(options?: ListSuppressionsOptions): Promise<Result<List<SuppressionListItem>>> {
    return this.http.request({
      method: "GET",
      path: "/suppressions",
      query: { ...listQuery(options), origin: options?.origin },
    });
  }

  /** GET /suppressions/:idOrEmail */
  get(idOrEmail: string): Promise<Result<Suppression>> {
    return this.http.request({
      method: "GET",
      path: `/suppressions/${encodeURIComponent(idOrEmail)}`,
    });
  }

  /** DELETE /suppressions/:idOrEmail */
  remove(idOrEmail: string): Promise<Result<RemoveSuppressionResponse>> {
    return this.http.request({
      method: "DELETE",
      path: `/suppressions/${encodeURIComponent(idOrEmail)}`,
    });
  }
}
