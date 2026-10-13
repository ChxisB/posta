import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import type {
  CreateTopicOptions,
  List,
  RemoveTopicResponse,
  Topic,
  TopicId,
  UpdateTopicOptions,
} from "../types.js";

/** Subscription topics — granular unsubscribe categories for a team. */
export class Topics {
  constructor(private readonly http: HttpClient) {}

  create(payload: CreateTopicOptions): Promise<Result<TopicId>> {
    return this.http.request({
      method: "POST",
      path: "/topics",
      body: {
        name: payload.name,
        description: payload.description,
        default_subscription: payload.defaultSubscription,
        visibility: payload.visibility,
      },
    });
  }

  get(id: string): Promise<Result<Topic>> {
    return this.http.request({ method: "GET", path: `/topics/${encodeURIComponent(id)}` });
  }

  /** GET /topics — the list envelope with `has_more` always false (topics are unpaginated). */
  list(): Promise<Result<List<Topic>>> {
    return this.http.request({ method: "GET", path: "/topics" });
  }

  update(id: string, payload: UpdateTopicOptions): Promise<Result<TopicId>> {
    return this.http.request({
      method: "PATCH",
      path: `/topics/${encodeURIComponent(id)}`,
      body: {
        name: payload.name,
        description: payload.description,
        visibility: payload.visibility,
      },
    });
  }

  remove(id: string): Promise<Result<RemoveTopicResponse>> {
    return this.http.request({ method: "DELETE", path: `/topics/${encodeURIComponent(id)}` });
  }
}
