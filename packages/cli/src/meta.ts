declare const __CLI_VERSION__: string | undefined;

/** Injected by esbuild's --define from package.json; "0.0.0-dev" when run from source. */
export const VERSION: string = typeof __CLI_VERSION__ === "string" ? __CLI_VERSION__ : "0.0.0-dev";

export const REPO_URL = "https://github.com/ChxisB/posta";

/** Sent on every request: Resend rejects requests without a User-Agent. */
export const USER_AGENT = `millionsend-cli/${VERSION} (+${REPO_URL})`;

// Published standalone, so these copy packages/config/src/site.ts.
export const CLOUD_API_URL = "https://api.posta.example";
export const CLOUD_BILLING_URL = "https://app.posta.example/settings/billing";

export const TRADEMARK_NOTICE =
  "Resend is a trademark of Plus Five Five, Inc. MillionSend is not affiliated with or endorsed by Resend.";
