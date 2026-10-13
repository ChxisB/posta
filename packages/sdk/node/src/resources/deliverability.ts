import type { Result } from "../error.js";
import type { HttpClient } from "../http.js";
import type { Deliverability as DeliverabilityReport } from "../types.js";

/**
 * Account-level deliverability score over the trailing window (MillionSend
 * extension, no Resend equivalent).
 */
export class Deliverability {
  constructor(private readonly http: HttpClient) {}

  /** GET /deliverability */
  get(): Promise<Result<DeliverabilityReport>> {
    return this.http.request({ method: "GET", path: "/deliverability" });
  }
}
