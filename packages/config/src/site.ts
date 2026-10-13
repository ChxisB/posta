/**
 * The hosted product's public addresses, in one place. They are placeholders
 * (the reserved .example TLD) until the real domains are chosen; change them
 * here. No imports, so client components can use this module too.
 *
 * Copies that cannot import this file carry the same values and change with
 * it: the published CLI (packages/cli/src/meta.ts) and setup wizard
 * (packages/ses/src/setup-cli.ts), each SDK's default base URL, the docs app
 * (apps/docs: DOCS_ORIGIN, the CSP's connect-src), message strings and docs.
 */

/** The product domain: site, app, API and docs. */
export const SITE_DOMAIN = "posta.example";

/** Holds the cloud's MX and tracking hosts, apart from the product domain. */
export const DNS_DOMAIN = "posta-dns.example";

export const SITE_URL = `https://${SITE_DOMAIN}`;
export const CLOUD_APP_URL = `https://app.${SITE_DOMAIN}`;
export const CLOUD_API_URL = `https://api.${SITE_DOMAIN}`;
export const DOCS_URL = `https://docs.${SITE_DOMAIN}`;
