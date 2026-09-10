import { z } from 'zod';

// ─── Users ───────────────────────────────────────────────

export const UserSchema = z.object({
  id: z.number().int().optional(),
  uuid: z.string(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email_address: z.string().nullable().optional(),
  password_digest: z.string().nullable().optional(),
  time_zone: z.string().nullable().optional(),
  email_verification_token: z.string().nullable().optional(),
  email_verified_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  password_reset_token: z.string().nullable().optional(),
  password_reset_token_valid_until: z.string().nullable().optional(),
  admin: z.boolean().default(false),
  oidc_uid: z.string().nullable().optional(),
  oidc_issuer: z.string().nullable().optional(),
});
export type User = z.infer<typeof UserSchema>;

// ─── Organizations ────────────────────────────────────────

export const OrganizationSchema = z.object({
  id: z.number().int().optional(),
  uuid: z.string(),
  name: z.string().nullable().optional(),
  permalink: z.string().nullable().optional(),
  time_zone: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  ip_pool_id: z.number().int().nullable().optional(),
  owner_id: z.number().int().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
  suspended_at: z.string().nullable().optional(),
  suspension_reason: z.string().nullable().optional(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const OrganizationUserSchema = z.object({
  id: z.number().int().optional(),
  organization_id: z.number().int().nullable().optional(),
  user_id: z.number().int().nullable().optional(),
  created_at: z.string().optional(),
  admin: z.boolean().default(false),
  all_servers: z.boolean().default(true),
  user_type: z.string().nullable().optional(),
});
export type OrganizationUser = z.infer<typeof OrganizationUserSchema>;

// ─── Servers ──────────────────────────────────────────────

export const ServerSchema = z.object({
  id: z.number().int().optional(),
  organization_id: z.number().int().nullable().optional(),
  uuid: z.string(),
  name: z.string().nullable().optional(),
  mode: z.string().nullable().optional(),
  ip_pool_id: z.number().int().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  permalink: z.string().nullable().optional(),
  send_limit: z.number().int().nullable().optional(),
  send_limit_approaching_at: z.string().nullable().optional(),
  send_limit_approaching_notified_at: z.string().nullable().optional(),
  send_limit_exceeded_at: z.string().nullable().optional(),
  send_limit_exceeded_notified_at: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
  message_retention_days: z.number().int().nullable().optional(),
  raw_message_retention_days: z.number().int().nullable().optional(),
  raw_message_retention_size: z.number().int().nullable().optional(),
  allow_sender: z.boolean().default(false),
  token: z.string().nullable().optional(),
  spam_threshold: z.number().nullable().optional(),
  spam_failure_threshold: z.number().nullable().optional(),
  postmaster_address: z.string().nullable().optional(),
  suspended_at: z.string().nullable().optional(),
  outbound_spam_threshold: z.number().nullable().optional(),
  domains_not_to_click_track: z.string().nullable().optional(),
  suspension_reason: z.string().nullable().optional(),
  log_smtp_data: z.boolean().default(false),
  privacy_mode: z.boolean().default(false),
});
export type Server = z.infer<typeof ServerSchema>;

// ─── Credentials (API Keys) ───────────────────────────────

export const CredentialSchema = z.object({
  id: z.number().int().optional(),
  server_id: z.number().int().nullable().optional(),
  key: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  options: z.string().nullable().optional(),
  last_used_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  hold: z.boolean().default(false),
  uuid: z.string().nullable().optional(),
});
export type Credential = z.infer<typeof CredentialSchema>;

// ─── Domains ──────────────────────────────────────────────

export const DomainSchema = z.object({
  id: z.number().int().optional(),
  server_id: z.number().int().nullable().optional(),
  uuid: z.string(),
  name: z.string().nullable().optional(),
  verification_token: z.string().nullable().optional(),
  verification_method: z.string().nullable().optional(),
  verified_at: z.string().nullable().optional(),
  dkim_private_key: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  dns_checked_at: z.string().nullable().optional(),
  spf_status: z.string().nullable().optional(),
  spf_error: z.string().nullable().optional(),
  dkim_status: z.string().nullable().optional(),
  dkim_error: z.string().nullable().optional(),
  mx_status: z.string().nullable().optional(),
  mx_error: z.string().nullable().optional(),
  return_path_status: z.string().nullable().optional(),
  return_path_error: z.string().nullable().optional(),
  outgoing: z.boolean().default(true),
  incoming: z.boolean().default(true),
  owner_type: z.string().nullable().optional(),
  owner_id: z.number().int().nullable().optional(),
  dkim_identifier_string: z.string().nullable().optional(),
  use_for_any: z.boolean().nullable().optional(),
});
export type Domain = z.infer<typeof DomainSchema>;

// ─── Routes ───────────────────────────────────────────────

export const RouteSchema = z.object({
  id: z.number().int().optional(),
  uuid: z.string().nullable().optional(),
  server_id: z.number().int().nullable().optional(),
  domain_id: z.number().int().nullable().optional(),
  endpoint_id: z.number().int().nullable().optional(),
  endpoint_type: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  spam_mode: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  token: z.string().nullable().optional(),
  mode: z.string().nullable().optional(),
});
export type Route = z.infer<typeof RouteSchema>;

// ─── Endpoints ────────────────────────────────────────────

export const HttpEndpointSchema = z.object({
  id: z.number().int().optional(),
  server_id: z.number().int().nullable().optional(),
  uuid: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  encoding: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  strip_replies: z.boolean().default(false),
  error: z.string().nullable().optional(),
  disabled_until: z.string().nullable().optional(),
  last_used_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  include_attachments: z.boolean().default(true),
  timeout: z.number().int().nullable().optional(),
});
export type HttpEndpoint = z.infer<typeof HttpEndpointSchema>;

export const SmtpEndpointSchema = z.object({
  id: z.number().int().optional(),
  server_id: z.number().int().nullable().optional(),
  uuid: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  hostname: z.string().nullable().optional(),
  ssl_mode: z.string().nullable().optional(),
  port: z.number().int().nullable().optional(),
  error: z.string().nullable().optional(),
  disabled_until: z.string().nullable().optional(),
  last_used_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});
export type SmtpEndpoint = z.infer<typeof SmtpEndpointSchema>;

export const AddressEndpointSchema = z.object({
  id: z.number().int().optional(),
  server_id: z.number().int().nullable().optional(),
  uuid: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  last_used_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});
export type AddressEndpoint = z.infer<typeof AddressEndpointSchema>;

// ─── IP Pools ─────────────────────────────────────────────

export const IpPoolSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().nullable().optional(),
  uuid: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  default_pool: z.boolean().default(false),
});
export type IpPool = z.infer<typeof IpPoolSchema>;

export const IpPoolRuleSchema = z.object({
  id: z.number().int().optional(),
  uuid: z.string().nullable().optional(),
  owner_type: z.string().nullable().optional(),
  owner_id: z.number().int().nullable().optional(),
  ip_pool_id: z.number().int().nullable().optional(),
  from_text: z.string().nullable().optional(),
  to_text: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});
export type IpPoolRule = z.infer<typeof IpPoolRuleSchema>;

export const IpAddressSchema = z.object({
  id: z.number().int().optional(),
  ip_pool_id: z.number().int().nullable().optional(),
  ipv4: z.string().nullable().optional(),
  ipv6: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  hostname: z.string().nullable().optional(),
  priority: z.number().int().nullable().optional(),
});
export type IpAddress = z.infer<typeof IpAddressSchema>;

export const OrganizationIpPoolSchema = z.object({
  id: z.number().int().optional(),
  organization_id: z.number().int().nullable().optional(),
  ip_pool_id: z.number().int().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});
export type OrganizationIpPool = z.infer<typeof OrganizationIpPoolSchema>;

// ─── Queued Messages ─────────────────────────────────────

export const QueuedMessageSchema = z.object({
  id: z.number().int().optional(),
  server_id: z.number().int().nullable().optional(),
  message_id: z.number().int().nullable().optional(),
  domain: z.string().nullable().optional(),
  locked_by: z.string().nullable().optional(),
  locked_at: z.string().nullable().optional(),
  retry_after: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  ip_address_id: z.number().int().nullable().optional(),
  attempts: z.number().int().default(0),
  route_id: z.number().int().nullable().optional(),
  manual: z.boolean().default(false),
  batch_key: z.string().nullable().optional(),
});
export type QueuedMessage = z.infer<typeof QueuedMessageSchema>;

// ─── Messages ─────────────────────────────────────────────

export const BounceMessageSchema = z.object({
  id: z.number().int().optional(),
  message_id: z.number().int().nullable().optional(),
  server_id: z.number().int().nullable().optional(),
  bounce_type: z.string().nullable().optional(),
  bounce_reason: z.string().nullable().optional(),
  bounced_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});
export type BounceMessage = z.infer<typeof BounceMessageSchema>;

export const IncomingMessagePrototypeSchema = z.object({
  id: z.number().int().optional(),
  server_id: z.number().int().nullable().optional(),
  uuid: z.string().nullable().optional(),
  raw_message: z.string().nullable().optional(),
  rcpt_to: z.string().nullable().optional(),
  mail_from: z.string().nullable().optional(),
  received_with_ssl: z.boolean().default(false),
  created_at: z.string().nullable().optional(),
});
export type IncomingMessagePrototype = z.infer<typeof IncomingMessagePrototypeSchema>;

export const OutgoingMessagePrototypeSchema = z.object({
  id: z.number().int().optional(),
  server_id: z.number().int().nullable().optional(),
  uuid: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
  rcpt_to: z.string().nullable().optional(),
  mail_from: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  bounce: z.boolean().default(false),
  tag: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});
export type OutgoingMessagePrototype = z.infer<typeof OutgoingMessagePrototypeSchema>;

// ─── Webhooks ────────────────────────────────────────────

export const WebhookSchema = z.object({
  id: z.number().int().optional(),
  server_id: z.number().int().nullable().optional(),
  uuid: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  last_used_at: z.string().nullable().optional(),
  all_events: z.boolean().default(false),
  enabled: z.boolean().default(true),
  sign: z.boolean().default(true),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});
export type Webhook = z.infer<typeof WebhookSchema>;

export const WebhookEventSchema = z.object({
  id: z.number().int().optional(),
  webhook_id: z.number().int().nullable().optional(),
  event: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export const WebhookRequestSchema = z.object({
  id: z.number().int().optional(),
  server_id: z.number().int().nullable().optional(),
  webhook_id: z.number().int().nullable().optional(),
  url: z.string().nullable().optional(),
  event: z.string().nullable().optional(),
  uuid: z.string().nullable().optional(),
  payload: z.string().nullable().optional(),
  attempts: z.number().int().default(0),
  retry_after: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  locked_by: z.string().nullable().optional(),
  locked_at: z.string().nullable().optional(),
});
export type WebhookRequest = z.infer<typeof WebhookRequestSchema>;

// ─── Worker / Scheduled Tasks ─────────────────────────────

export const WorkerRoleSchema = z.object({
  id: z.number().int().optional(),
  role: z.string(),
  worker: z.string().nullable().optional(),
  acquired_at: z.string().nullable().optional(),
});
export type WorkerRole = z.infer<typeof WorkerRoleSchema>;

export const ScheduledTaskSchema = z.object({
  id: z.number().int().optional(),
  name: z.string(),
  next_run_after: z.string().nullable().optional(),
});
export type ScheduledTask = z.infer<typeof ScheduledTaskSchema>;

// ─── Tracking ────────────────────────────────────────────

export const TrackCertificateSchema = z.object({
  id: z.number().int().optional(),
  domain: z.string().nullable().optional(),
  certificate: z.string().nullable().optional(),
  intermediaries: z.string().nullable().optional(),
  key: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  renew_after: z.string().nullable().optional(),
  verification_path: z.string().nullable().optional(),
  verification_string: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});
export type TrackCertificate = z.infer<typeof TrackCertificateSchema>;

export const TrackDomainSchema = z.object({
  id: z.number().int().optional(),
  uuid: z.string().nullable().optional(),
  server_id: z.number().int().nullable().optional(),
  domain_id: z.number().int().nullable().optional(),
  name: z.string().nullable().optional(),
  dns_checked_at: z.string().nullable().optional(),
  dns_status: z.string().nullable().optional(),
  dns_error: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  ssl_enabled: z.boolean().default(true),
  track_clicks: z.boolean().default(true),
  track_loads: z.boolean().default(true),
  excluded_click_domains: z.string().nullable().optional(),
});
export type TrackDomain = z.infer<typeof TrackDomainSchema>;

// ─── Misc ─────────────────────────────────────────────────

export const UserInviteSchema = z.object({
  id: z.number().int().optional(),
  uuid: z.string().nullable().optional(),
  email_address: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});
export type UserInvite = z.infer<typeof UserInviteSchema>;

export const StatisticsSchema = z.object({
  id: z.number().int().optional(),
  total_messages: z.number().int().default(0),
  total_outgoing: z.number().int().default(0),
  total_incoming: z.number().int().default(0),
});
export type Statistics = z.infer<typeof StatisticsSchema>;

// ─── Additional Route Endpoints (join) ────────────────────

export const AdditionalRouteEndpointSchema = z.object({
  id: z.number().int().optional(),
  route_id: z.number().int().nullable().optional(),
  endpoint_type: z.string().nullable().optional(),
  endpoint_id: z.number().int().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});
export type AdditionalRouteEndpoint = z.infer<typeof AdditionalRouteEndpointSchema>;

// ─── Retry / Backoff / DLQ types ────
export * from './retry';
