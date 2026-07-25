import { z } from 'zod';

/**
 * Zod schema for validating Posta configuration.
 */
export const PostaConfigSchema = z.object({
  posta: z.object({
    web_hostname: z.string().default('posta.example.com'),
    web_protocol: z.string().default('https'),
    smtp_hostname: z.string().default('posta.example.com'),
    use_ip_pools: z.boolean().default(false),
    default_maximum_delivery_attempts: z.number().int().default(18),
    default_maximum_hold_expiry_days: z.number().int().default(7),
    default_suppression_list_automatic_removal_days: z.number().int().default(30),
    default_spam_threshold: z.number().int().default(5),
    default_spam_failure_threshold: z.number().int().default(20),
    use_local_ns_for_domain_verification: z.boolean().default(false),
    use_resent_sender_header: z.boolean().default(true),
    signing_key_path: z.string().default('config/posta/signing.key'),
    smtp_relays: z.array(
      z.object({
        host: z.string(),
        port: z.number().int().default(25),
        ssl_mode: z.string().default('Auto'),
      }),
    ).optional(),
    trusted_proxies: z.array(z.string()).optional(),
    allowed_request_destinations: z.array(z.string()).optional(),
    queued_message_lock_stale_days: z.number().int().default(1),
    batch_queued_messages: z.boolean().default(true),
  }).default({}),

  web_server: z.object({
    default_port: z.number().int().default(5000),
    default_bind_address: z.string().default('127.0.0.1'),
    max_threads: z.number().int().default(5),
  }).default({}),

  worker: z.object({
    default_health_server_port: z.number().int().default(9090),
    default_health_server_bind_address: z.string().default('127.0.0.1'),
    threads: z.number().int().default(2),
  }).default({}),

  main_db: z.object({
    path: z.string().default('data/posta-main.db'),
  }).default({}),

  message_db: z.object({
    directory: z.string().default('data/message-db'),
    database_name_prefix: z.string().default('posta'),
  }).default({}),

  logging: z.object({
    enabled: z.boolean().default(true),
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    sentry_dsn: z.string().optional(),
  }).default({}),

  gelf: z.object({
    host: z.string().optional(),
    port: z.number().int().default(12201),
    facility: z.string().default('posta'),
  }).optional(),

  smtp_server: z.object({
    default_port: z.number().int().default(25),
    default_bind_address: z.string().default('::'),
    default_health_server_port: z.number().int().default(9091),
    default_health_server_bind_address: z.string().default('127.0.0.1'),
    tls_enabled: z.boolean().default(false),
    tls_certificate_path: z.string().default('config/posta/smtp.cert'),
    tls_private_key_path: z.string().default('config/posta/smtp.key'),
    tls_ciphers: z.string().optional(),
    ssl_version: z.string().default('SSLv23'),
    proxy_protocol: z.boolean().default(false),
    log_connections: z.boolean().default(false),
    max_message_size: z.number().int().default(14),
  }).default({}),

  dns: z.object({
    mx_records: z.array(z.string()).default(['mx1.posta.example.com', 'mx2.posta.example.com']),
    spf_include: z.string().default('spf.posta.example.com'),
    return_path_domain: z.string().default('rp.posta.example.com'),
    route_domain: z.string().default('routes.posta.example.com'),
    track_domain: z.string().default('track.posta.example.com'),
    helo_hostname: z.string().optional(),
    dkim_identifier: z.string().default('posta'),
    domain_verify_prefix: z.string().default('posta-verification'),
    custom_return_path_prefix: z.string().default('psrp'),
    timeout: z.number().int().default(5),
  }).default({}),

  smtp: z.object({
    host: z.string().default('127.0.0.1'),
    port: z.number().int().default(25),
    username: z.string().optional(),
    password: z.string().optional(),
    authentication_type: z.string().default('login'),
    enable_starttls: z.boolean().default(false),
    enable_starttls_auto: z.boolean().default(true),
    openssl_verify_mode: z.string().default('peer'),
    from_name: z.string().default('Posta'),
    from_address: z.string().default('posta@example.com'),
  }).default({}),

  rspamd: z.object({
    enabled: z.boolean().default(false),
    host: z.string().default('127.0.0.1'),
    port: z.number().int().default(11334),
    ssl: z.boolean().default(false),
    password: z.string().optional(),
    flags: z.string().optional(),
  }).optional(),

  spamd: z.object({
    enabled: z.boolean().default(false),
    host: z.string().default('127.0.0.1'),
    port: z.number().int().default(783),
  }).optional(),

  clamav: z.object({
    enabled: z.boolean().default(false),
    host: z.string().default('127.0.0.1'),
    port: z.number().int().default(2000),
  }).optional(),

  smtp_client: z.object({
    open_timeout: z.number().int().default(30),
    read_timeout: z.number().int().default(30),
  }).default({}),
});
