import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import { listQuery } from "../query.js";
import type {
  ApiKeyListItem,
  CreateApiKeyOptions,
  CreateApiKeyResponse,
  List,
  ListOptions,
  RemoveApiKeyResponse,
} from "../types.js";

/** API keys. The token is returned once, on `create`. */
export class ApiKeys {
  constructor(private readonly http: HttpClient) {}

  create(payload: CreateApiKeyOptions): Promise<Result<CreateApiKeyResponse>> {
    return this.http.request({
      method: "POST",
      path: "/api-keys",
      body: {
        name: payload.name,
        permission: payload.permission,
        domain_id: payload.domainId ?? payload.domain_id,
      },
    });
  }

  list(options?: ListOptions): Promise<Result<List<ApiKeyListItem>>> {
    return this.http.request({ method: "GET", path: "/api-keys", query: listQuery(options) });
  }

  remove(id: string): Promise<Result<RemoveApiKeyResponse>> {
    return this.http.request({ method: "DELETE", path: `/api-keys/${encodeURIComponent(id)}` });
  }
}
