/**
 * Public request/response types. Inputs are camelCase (mapped to the wire's
 * snake_case by each resource); responses are the wire shape verbatim, so the
 * `object`/`created_at`/`first_name` fields read exactly as the API returns.
 */

export type Recipients = string | string[];

export interface Tag {
  name: string;
  value: string;
}

/** `x-batch-validation` header value for POST /emails/batch and POST /contacts/batch. */
export type BatchValidation = "strict" | "permissive";

/** Permissive-mode batch failure: the request index of the item and why it was rejected. */
export interface BatchError {
  index: number;
  message: string;
}

// ---- shared list envelope ------------------------------------------------
export interface ListOptions {
  limit?: number;
  /** Keyset cursor: return items after this id. Mutually exclusive with `before`. */
  after?: string;
  before?: string;
}

export interface List<T> {
  object: "list";
  data: T[];
  has_more: boolean;
}

// ---- emails --------------------------------------------------------------
export interface Attachment {
  filename: string;
  /** File bytes as a base64 string, or a Buffer (base64-encoded for you). */
  content?: string | Buffer;
  contentType?: string;
  /** Content-ID for inline references (`<img src="cid:...">`). */
  contentId?: string;
  path?: string;
}

export interface SendEmailOptions {
  from: string;
  to: Recipients;
  subject: string;
  html?: string;
  text?: string;
  cc?: Recipients;
  bcc?: Recipients;
  replyTo?: Recipients;
  /** ISO 8601 with offset, or relative ("in 2 hours"); up to 30 days ahead. */
  scheduledAt?: string;
  tags?: Tag[];
  /** Recipients opted out of the topic are skipped and an unsubscribe link is added. */
  topicId?: string | null;
  attachments?: Attachment[];
  /** Extra message headers; transport headers are rejected by the API. */
  headers?: Record<string, string>;
  /** Sent through as-is; MillionSend answers 422 until templates can be sent. */
  template?: { id: string; variables?: Record<string, string | number> };
}

export interface CreateEmailResponse {
  id: string;
}

export interface EmailListItem {
  id: string;
  from: string;
  to: string[];
  cc: string[] | null;
  bcc: string[] | null;
  reply_to: string[] | null;
  subject: string;
  created_at: string;
  scheduled_at: string | null;
  last_event: string;
}

export interface Email extends EmailListItem {
  object: "email";
  html: string | null;
  text: string | null;
  message_id: string;
  /** Best-practice score (0–10, one decimal); null when the email has no insights. */
  score: number | null;
}

export interface UpdateEmailOptions {
  id: string;
  /** New delivery time; only scheduled, unsent emails can be rescheduled. */
  scheduledAt: string;
}

export interface UpdateEmailResponse {
  object: "email";
  id: string;
}

export interface CancelEmailResponse {
  object: "email";
  id: string;
}

export interface RemoveEmailResponse {
  object: "email";
  id: string;
  deleted: true;
}

export interface BatchResponse {
  data: CreateEmailResponse[];
  /** Present in permissive mode: the items that were not accepted. */
  errors?: BatchError[];
}

// ---- insights & deliverability -------------------------------------------
// Open sets: the API grows these across score versions, so each union keeps a
// `(string & {})` escape hatch — known values autocomplete, future ones still
// assign without a type error.
export type ScoreBand = "excellent" | "good" | "needs_attention" | "at_risk" | (string & {});
export type CheckSeverity = "critical" | "major" | "minor" | "info" | (string & {});
export type CheckStatus =
  | "pass"
  | "fail"
  | "passed_by_design"
  | "not_applicable"
  | "unknown"
  | (string & {});
export type GuardrailStatus = "ok" | "warning" | "paused" | (string & {});

export interface InsightsCheck {
  /** Check id from the MillionSend check catalog — an open set. */
  id: string;
  severity: CheckSeverity;
  status: CheckStatus;
  /** Points deducted from the score; 0 unless status is "fail". */
  penalty: number;
  detail?: Record<string, unknown>;
}

export interface EmailInsights {
  object: "email_insights";
  email_id: string;
  /** Best-practice score, 0–10, one decimal. */
  score: number;
  score_version: number;
  band: ScoreBand;
  marketing: boolean;
  html_size_bytes: number | null;
  computed_at: string;
  checks: InsightsCheck[];
}

/** Account score over the trailing window; null scores mean not enough data. */
export interface Deliverability {
  object: "deliverability";
  score: number | null;
  band: ScoreBand | null;
  content_score: number | null;
  outcome_score: number | null;
  complaint_rate: number;
  hard_bounce_rate: number;
  emails_sent: number;
  scored_recipients: number;
  window_days: number;
  insufficient_outcome_data: boolean;
  guardrail_status: GuardrailStatus;
  score_version: number;
}

// ---- contacts ------------------------------------------------------------
export type TopicSubscription = "opt_in" | "opt_out";

export interface ContactTopicUpdate {
  id: string;
  subscription: TopicSubscription;
}

export interface CreateContactOptions {
  email: string;
  firstName?: string;
  lastName?: string;
  unsubscribed?: boolean;
  properties?: Record<string, string | number | boolean | null>;
  /** Segments to add the contact to on creation. */
  segments?: { id: string }[];
  /** Initial per-topic subscription choices. */
  topics?: ContactTopicUpdate[];
}

/** Address a contact by id or email (email wins if both are given). */
export interface ContactAddress {
  id?: string;
  email?: string;
}

export interface UpdateContactOptions extends ContactAddress {
  firstName?: string | null;
  lastName?: string | null;
  unsubscribed?: boolean;
  properties?: Record<string, string | number | boolean | null>;
}

/** Facets a contact read can attach (MillionSend extension). */
export type ContactInclude = "properties" | "topics";

export interface ListContactsOptions extends ListOptions {
  /** List only the contacts matching this segment (GET /segments/:id/contacts). */
  segmentId?: string;
  /** Attach `properties` and/or `topics` to every item (`?include=properties,topics`). */
  include?: ContactInclude[];
}

export interface BatchGetContactsOptions {
  /** Attach `properties` and/or `topics` to every contact returned. */
  include?: ContactInclude[];
}

export interface BatchGetContactsResponse {
  object: "list";
  /** The contacts found, in request order. */
  data: BatchGetContact[];
  /** Request entries that matched no contact, by their position in the request. */
  missing: { index: number; id?: string; email?: string }[];
}

export interface ContactId {
  object: "contact";
  id: string;
}

/** A custom property as returned by GET /contacts/:id — typed by the property definition. */
export type ContactPropertyValue =
  | { type: "string"; value: string }
  | { type: "number"; value: number };

export interface Contact {
  object: "contact";
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  unsubscribed: boolean;
  properties: Record<string, ContactPropertyValue>;
}

/** One contact as `batch.get` returns it: the list item plus the facets `include` asked for. */
export type BatchGetContact = ContactListItem & { object: "contact" };

export interface ContactListItem {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  unsubscribed: boolean;
  /** Only with `include: ["properties"]`. */
  properties?: Record<string, ContactPropertyValue>;
  /** Only with `include: ["topics"]`. */
  topics?: ContactTopic[];
}

export interface RemoveContactResponse {
  object: "contact";
  contact: string;
  deleted: true;
}

export interface RemoveContactOptions {
  /**
   * Also scrub the address from email history, event payloads and API logs
   * (`erase=true`, a GDPR/LGPD erasure). Without it the contact's emails stay
   * in the send log.
   */
  erase?: boolean;
}

export type BatchRemoveContactsOptions = RemoveContactOptions &
  ({ ids: string[]; emails?: never } | { emails: string[]; ids?: never });

/** The contact's hosted preference page (POST /contacts/:id/preferences-link). */
export interface ContactPreferencesLink {
  object: "preferences_link";
  contact: string;
  /** Signed, contact-scoped and non-expiring: hand it only to the contact. */
  url: string;
}

export interface UpdateContactTopicsOptions extends ContactAddress {
  topics: ContactTopicUpdate[];
}

export interface UpdateContactTopicsResponse {
  id: string;
}

export type ListContactTopicsOptions = ContactAddress;

/** One of the team's topics as seen by a contact (GET /contacts/:id/topics). */
export interface ContactTopic {
  id: string;
  name: string;
  description: string | null;
  /** Effective choice: the contact's explicit one, else the topic's default. */
  subscription: TopicSubscription;
  /** False when `subscription` is only the topic's default. */
  explicit: boolean;
  /** The hosted preference page lists public topics only. */
  visibility: TopicVisibility;
}

/** What POST /contacts/batch does with an email that already belongs to a contact. */
export type ContactOnConflict = "error" | "skip" | "upsert";

export interface CreateContactsBatchOptions {
  /** `error` (default) fails the item, `skip` reports the existing id, `upsert` merges into it. */
  onConflict?: ContactOnConflict;
  batchValidation?: BatchValidation;
}

export interface BatchContactResult {
  object: "contact";
  /** Position of the item in the request array. */
  index: number;
  /** The contact's id (the existing one for skipped/updated). */
  id: string;
  status: "created" | "updated" | "skipped";
}

export interface BatchContactsResponse {
  data: BatchContactResult[];
  counts: { created: number; updated: number; skipped: number; failed: number };
  /** Present in permissive mode: the items that were not written. */
  errors?: BatchError[];
}

/** Address a contact by id, email or Resend's `contactId` (email wins). */
export interface ContactSegmentOptions extends ContactAddress {
  contactId?: string;
  segmentId: string;
}

export interface AddContactSegmentResponse {
  id: string;
}

export interface RemoveContactSegmentResponse {
  id: string;
  audienceId: string;
  deleted: true;
}

// ---- contact properties --------------------------------------------------
export type ContactPropertyType = "string" | "number";

export interface CreateContactPropertyOptions {
  key: string;
  type: ContactPropertyType;
  /** Value used when a contact has no value for the key; null means none. */
  fallbackValue?: string | number | null;
}

export interface UpdateContactPropertyOptions {
  id: string;
  fallbackValue?: string | number | null;
}

export interface ContactPropertyListItem {
  id: string;
  created_at: string;
  key: string;
  type: ContactPropertyType;
  fallback_value: string | number | null;
}

export interface ContactProperty extends ContactPropertyListItem {
  object: "contact_property";
}

export interface ContactPropertyId {
  object: "contact_property";
  id: string;
}

export interface RemoveContactPropertyResponse {
  object: "contact_property";
  id: string;
  deleted: true;
}

// ---- topics --------------------------------------------------------------
export type TopicVisibility = "private" | "public";

export interface CreateTopicOptions {
  name: string;
  description?: string;
  defaultSubscription: TopicSubscription;
  visibility?: TopicVisibility;
}

export interface UpdateTopicOptions {
  name?: string;
  description?: string;
  visibility?: TopicVisibility;
}

export interface Topic {
  id: string;
  name: string;
  description?: string;
  default_subscription: TopicSubscription;
  visibility: TopicVisibility;
  created_at: string;
}

export interface TopicId {
  id: string;
}

export interface RemoveTopicResponse {
  id: string;
  object: "topic";
  deleted: true;
}

// ---- broadcasts ----------------------------------------------------------
export interface CreateBroadcastOptions {
  name?: string;
  segmentId?: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: Recipients;
  /** Inbox preview (preheader) text. */
  previewText?: string;
  topicId?: string | null;
  /** true sends (or schedules) immediately instead of saving a draft. */
  send?: boolean;
  /** Deliver later (requires `send: true`); ISO 8601 with offset or relative. */
  scheduledAt?: string;
}

export interface UpdateBroadcastOptions {
  name?: string;
  segmentId?: string;
  from?: string;
  subject?: string;
  html?: string;
  text?: string;
  replyTo?: Recipients;
  previewText?: string;
  /** null clears the topic. */
  topicId?: string | null;
}

export interface SendBroadcastOptions {
  /** ISO 8601 with offset; omit to send now. */
  scheduledAt?: string;
}

export interface BroadcastId {
  id: string;
}

export interface BroadcastListItem {
  id: string;
  name: string | null;
  segment_id: string | null;
  status: string;
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
}

export interface Broadcast extends BroadcastListItem {
  object: "broadcast";
  from: string;
  subject: string;
  reply_to: string[] | null;
  preview_text: string | null;
  topic_id: string | null;
  html: string | null;
  text: string | null;
}

export interface CancelBroadcastResponse {
  object: "broadcast";
  id: string;
}

export interface RemoveBroadcastResponse {
  object: "broadcast";
  id: string;
  deleted: true;
}

// ---- segments (MillionSend dynamic segments) -----------------------------
export type SegmentMatch = "all" | "any";

export interface SegmentCondition {
  field: string;
  op: string;
  value?: string | null;
}

export interface SegmentFilter {
  match: SegmentMatch;
  conditions: SegmentCondition[];
}

export interface CreateSegmentOptions {
  name: string;
  filter: SegmentFilter;
}

export interface UpdateSegmentOptions {
  name?: string;
  filter?: SegmentFilter;
}

export interface Segment {
  object: "segment";
  id: string;
  name: string;
  filter: SegmentFilter;
  created_at: string;
  /** Present on `get` only — the live count of matching contacts. */
  contact_count?: number;
}

export interface RemoveSegmentResponse {
  object: "segment";
  id: string;
  deleted: true;
}

// ---- suppressions --------------------------------------------------------
export type SuppressionOrigin = "bounce" | "complaint" | "manual" | "unsubscribe";

export interface AddSuppressionOptions {
  email: string;
  /** Origin recorded on the new row (default manual); an already suppressed address keeps its origin. */
  origin?: SuppressionOrigin;
}

export interface ListSuppressionsOptions extends ListOptions {
  origin?: SuppressionOrigin;
}

export interface SuppressionId {
  object: "suppression";
  id: string;
}

export interface SuppressionListItem {
  id: string;
  email: string;
  origin: SuppressionOrigin;
  /** Email id whose bounce/complaint created the entry. */
  source_id: string | null;
  created_at: string;
}

export interface Suppression extends SuppressionListItem {
  object: "suppression";
}

export interface RemoveSuppressionResponse {
  object: "suppression";
  id: string;
  deleted: true;
}

export interface BatchAddSuppressionsOptions {
  /** Up to 1000 addresses; duplicates collapse. */
  emails: string[];
  origin?: SuppressionOrigin;
}

export type BatchRemoveSuppressionsOptions =
  | { emails: string[]; ids?: never }
  | { ids: string[]; emails?: never };

// ---- domains -------------------------------------------------------------
export type DomainRegion = "us-east-1" | "eu-west-1" | "sa-east-1" | "ap-northeast-1";

export interface DomainCapabilities {
  sending: string;
  receiving: string;
}

export interface CreateDomainOptions {
  name: string;
  /** Each deployment serves one region and rejects any other; omit to use it. */
  region?: DomainRegion;
  /** Return-path subdomain label (default "send"). */
  customReturnPath?: string;
  openTracking?: boolean;
  clickTracking?: boolean;
  /** DNS label of the branded tracking host, e.g. "links" for links.<domain>. */
  trackingSubdomain?: string;
}

export interface UpdateDomainOptions {
  id: string;
  openTracking?: boolean;
  clickTracking?: boolean;
  /** Empty string or null clears it. */
  trackingSubdomain?: string | null;
  /** Accepted for Resend payload compatibility; MillionSend ignores them. */
  tls?: "enforced" | "opportunistic";
  capabilities?: Partial<DomainCapabilities>;
}

export interface DomainRecord {
  record: string;
  name: string;
  type: string;
  ttl: string;
  status: string;
  value: string;
  priority?: number;
}

export interface DomainListItem {
  id: string;
  name: string;
  status: string;
  created_at: string;
  region: string;
  open_tracking: boolean;
  click_tracking: boolean;
  tracking_subdomain: string | null;
  capabilities: DomainCapabilities;
}

export interface CreateDomainResponse extends DomainListItem {
  records: DomainRecord[];
}

export interface Domain extends CreateDomainResponse {
  object: "domain";
}

export interface RemoveDomainResponse {
  object: "domain";
  id: string;
  deleted: true;
}

// ---- webhooks ------------------------------------------------------------
export type WebhookEvent =
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.bounced"
  | "email.complained"
  | "email.opened"
  | "email.clicked"
  | "deliverability.warning"
  | "deliverability.paused"
  | "quota.warning"
  | "quota.reached"
  | "quota.paused"
  | "contact.created"
  | "contact.updated"
  | "contact.deleted"
  | "contact.unsubscribed"
  | "contact.resubscribed"
  | "contact.topic_opt_in"
  | "contact.topic_opt_out"
  | "suppression.added"
  | "suppression.removed"
  | (string & {});

export type WebhookStatus = "enabled" | "disabled";

export interface CreateWebhookOptions {
  endpoint: string;
  events: WebhookEvent[];
  /** Carry over an existing `whsec_…` secret so the receiver keeps verifying unchanged; omit to mint one. */
  signingSecret?: string;
}

export interface UpdateWebhookOptions {
  endpoint?: string;
  events?: WebhookEvent[];
  status?: WebhookStatus;
}

export interface CreateWebhookResponse {
  object: "webhook";
  id: string;
  signing_secret: string;
}

export interface WebhookListItem {
  id: string;
  endpoint: string;
  created_at: string;
  status: WebhookStatus;
  events: string[] | null;
}

export interface Webhook extends WebhookListItem {
  object: "webhook";
  signing_secret: string;
  /** While set, deliveries are also signed with the secret this one replaced. */
  previous_secret_expires_at: string | null;
}

export interface RotateWebhookSecretOptions {
  /** New `whsec_…` secret to sign with; omit to mint one. */
  signingSecret?: string;
  /** Hours the previous secret keeps signing alongside the new one (0–72; the API defaults to 24). */
  overlapHours?: number;
}

export interface RotateWebhookSecretResponse {
  object: "webhook";
  id: string;
  signing_secret: string;
  previous_secret_expires_at: string | null;
}

export interface WebhookId {
  object: "webhook";
  id: string;
}

export interface RemoveWebhookResponse {
  object: "webhook";
  id: string;
  deleted: true;
}

// ---- api keys ------------------------------------------------------------
export type ApiKeyPermission = "full_access" | "sending_access";

export interface CreateApiKeyOptions {
  name: string;
  /** Defaults to full_access. */
  permission?: ApiKeyPermission;
  /** Restrict a sending_access key to one domain. */
  domainId?: string | null;
  /** Resend's spelling of `domainId`; either works. */
  domain_id?: string | null;
}

export interface CreateApiKeyResponse {
  id: string;
  /** The secret, shown once. */
  token: string;
}

export interface ApiKeyListItem {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export interface RemoveApiKeyResponse {
  object: "api_key";
  id: string;
  deleted: true;
}

// ---- templates -----------------------------------------------------------
export interface CreateTemplateOptions {
  name: string;
  html: string;
  /** "" or null clears the subject. */
  subject?: string | null;
  /** "" or null clears the text part. */
  text?: string | null;
  /** Case-sensitive handle, unique per team; `get(alias)` resolves it. */
  alias?: string | null;
  /** Sent through as-is; MillionSend answers 422 for any value. */
  from?: string | null;
  /** Sent through as-is; MillionSend answers 422 for any value. */
  replyTo?: Recipients | null;
  /** Sent through as-is; MillionSend answers 422 for a non-empty list. */
  variables?: unknown[];
}

export interface UpdateTemplateOptions {
  name?: string;
  html?: string;
  subject?: string | null;
  text?: string | null;
  /** null clears the alias. */
  alias?: string | null;
  from?: string | null;
  replyTo?: Recipients | null;
  variables?: unknown[];
}

export interface TemplateId {
  object: "template";
  id: string;
}

export interface TemplateListItem {
  id: string;
  name: string;
  alias: string | null;
  /** Always "published": every save is live. */
  status: "published";
  published_at: string;
  created_at: string;
  updated_at: string;
}

export interface Template extends TemplateListItem {
  object: "template";
  current_version_id: string;
  from: string | null;
  subject: string | null;
  reply_to: string | string[] | null;
  html: string;
  text: string | null;
  variables: unknown[];
  has_unpublished_versions: false;
}

export interface RemoveTemplateResponse {
  object: "template";
  id: string;
  deleted: true;
}

// ---- usage (MillionSend extension) ---------------------------------------
export interface Usage {
  object: "usage";
  /** True on MillionSend Cloud, where plan limits apply. */
  cloud: boolean;
  /** Effective plan; null when self-hosted. */
  plan: "free" | "pro" | "scale" | null;
  /** null = unlimited or self-hosted. */
  limits: { emails_per_day: number | null; domains: number | null };
  today: { emails_sent: number; resets_at: string };
  team: { id: string; name: string };
  /** Dashboard origin, for building links; null when unset. */
  app_url: string | null;
}
