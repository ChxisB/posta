import { HttpClient, type MillionSendOptions } from "./http.js";
import { ApiKeys } from "./resources/api-keys.js";
import { Broadcasts } from "./resources/broadcasts.js";
import { ContactProperties } from "./resources/contact-properties.js";
import { Contacts } from "./resources/contacts.js";
import { Deliverability } from "./resources/deliverability.js";
import { Domains } from "./resources/domains.js";
import { Batch, Emails } from "./resources/emails.js";
import { Segments } from "./resources/segments.js";
import { Suppressions } from "./resources/suppressions.js";
import { Templates } from "./resources/templates.js";
import { Topics } from "./resources/topics.js";
import { Usage } from "./resources/usage.js";
import { Webhooks } from "./resources/webhooks.js";

/**
 * The MillionSend client. Construct once and reuse.
 *
 * ```ts
 * import { MillionSend } from "millionsend";
 * const ms = new MillionSend("ms_..."); // Cloud; self-hosted: { baseUrl: "https://mail.acme.dev" }
 * const { data, error } = await ms.emails.send({
 *   from: "Acme <onboarding@acme.dev>",
 *   to: "success@simulator.amazonses.com",
 *   subject: "Hello",
 *   html: "<strong>it works</strong>",
 * });
 * ```
 *
 * No method throws for an API error — each resolves to `{ data, error }`, with
 * `error` being an {@link ErrorResponse} discriminated by `error.name`. The only
 * throw is a missing API key at construction.
 */
export class MillionSend {
  readonly emails: Emails;
  readonly batch: Batch;
  readonly contacts: Contacts;
  readonly contactProperties: ContactProperties;
  readonly broadcasts: Broadcasts;
  readonly topics: Topics;
  readonly segments: Segments;
  readonly suppressions: Suppressions;
  readonly domains: Domains;
  readonly webhooks: Webhooks;
  readonly apiKeys: ApiKeys;
  readonly templates: Templates;
  readonly deliverability: Deliverability;
  readonly usage: Usage;

  constructor(apiKey?: string, options?: MillionSendOptions) {
    const key = apiKey ?? process.env.MILLIONSEND_API_KEY;
    if (!key) {
      throw new Error(
        "Missing API key. Pass it to new MillionSend(apiKey) or set MILLIONSEND_API_KEY.",
      );
    }
    const http = new HttpClient(key, options);
    this.emails = new Emails(http);
    this.batch = new Batch(http);
    this.contacts = new Contacts(http);
    this.contactProperties = new ContactProperties(http);
    this.broadcasts = new Broadcasts(http);
    this.topics = new Topics(http);
    this.segments = new Segments(http);
    this.suppressions = new Suppressions(http);
    this.domains = new Domains(http);
    this.webhooks = new Webhooks(http);
    this.apiKeys = new ApiKeys(http);
    this.templates = new Templates(http);
    this.deliverability = new Deliverability(http);
    this.usage = new Usage(http);
  }
}

export default MillionSend;

export type { ErrorResponse, Result } from "./error.js";
export type { BatchRequestOptions, MillionSendOptions, RequestOptions } from "./http.js";
export type * from "./types.js";
