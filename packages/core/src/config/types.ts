/**
 * TypeScript types for the Posta configuration.
 * Mirrors the Ruby config schema in lib/posta/config_schema.rb
 */
export interface PostaConfig {
  posta: {
    web_hostname: string;
    web_protocol: string;
    smtp_hostname: string;
    use_ip_pools: boolean;
    default_maximum_delivery_attempts: number;
    default_maximum_hold_expiry_days: number;
    default_suppression_list_automatic_removal_days: number;
    default_spam_threshold: number;
    default_spam_failure_threshold: number;
    use_local_ns_for_domain_verification: boolean;
    use_resent_sender_header: boolean;
    signing_key_path: string;
    smtp_relays?: Array<{ host: string; port: number; ssl_mode: string }>;
    trusted_proxies?: string[];
    allowed_request_destinations?: string[];
    queued_message_lock_stale_days: number;
    batch_queued_messages: boolean;
  };

  web_server: {
    default_port: number;
    default_bind_address: string;
    max_threads: number;
  };

  worker: {
    default_health_server_port: number;
    default_health_server_bind_address: string;
    threads: number;
  };

  main_db: {
    /** SQLite path for the main database (replaces MariaDB host/port/username/password/database) */
    path: string;
  };

  message_db: {
    /** Directory where per-server SQLite files are stored */
    directory: string;
    /** Prefix for per-server database filenames */
    database_name_prefix: string;
  };

  logging: {
    enabled: boolean;
    level: string;
    sentry_dsn?: string;
  };

  gelf?: {
    host?: string;
    port: number;
    facility: string;
  };

  smtp_server: {
    default_port: number;
    default_bind_address: string;
    default_health_server_port: number;
    default_health_server_bind_address: string;
    tls_enabled: boolean;
    tls_certificate_path: string;
    tls_private_key_path: string;
    tls_ciphers?: string;
    ssl_version: string;
    proxy_protocol: boolean;
    log_connections: boolean;
    max_message_size: number;
  };

  dns: {
    mx_records: string[];
    spf_include: string;
    return_path_domain: string;
    route_domain: string;
    track_domain: string;
    helo_hostname?: string;
    dkim_identifier: string;
    domain_verify_prefix: string;
    custom_return_path_prefix: string;
    timeout: number;
  };

  smtp: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    authentication_type: string;
    enable_starttls: boolean;
    enable_starttls_auto: boolean;
    openssl_verify_mode: string;
    from_name: string;
    from_address: string;
  };

  rspamd?: {
    enabled: boolean;
    host: string;
    port: number;
    ssl: boolean;
    password?: string;
    flags?: string;
  };

  spamd?: {
    enabled: boolean;
    host: string;
    port: number;
  };

  clamav?: {
    enabled: boolean;
    host: string;
    port: number;
  };

  smtp_client: {
    open_timeout: number;
    read_timeout: number;
  };
}

export interface RawConfig {
  version?: number;
  posta?: Record<string, unknown>;
  web_server?: Record<string, unknown>;
  worker?: Record<string, unknown>;
  main_db?: Record<string, unknown>;
  message_db?: Record<string, unknown>;
  logging?: Record<string, unknown>;
  gelf?: Record<string, unknown>;
  smtp_server?: Record<string, unknown>;
  dns?: Record<string, unknown>;
  smtp?: Record<string, unknown>;
  rspamd?: Record<string, unknown>;
  spamd?: Record<string, unknown>;
  clamav?: Record<string, unknown>;
  smtp_client?: Record<string, unknown>;
}
