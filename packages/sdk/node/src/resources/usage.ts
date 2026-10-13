import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import type { Usage as UsageReport } from "../types.js";

/** Plan limits and today's send count (MillionSend extension, no Resend equivalent). */
export class Usage {
  constructor(private readonly http: HttpClient) {}

  /** GET /usage */
  get(): Promise<Result<UsageReport>> {
    return this.http.request({ method: "GET", path: "/usage" });
  }
}
