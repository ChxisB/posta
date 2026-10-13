import { DOCS_URL, SITE_URL } from "@posta/config/site";

const BODY = `# Posta

> This host is the Posta dashboard (sign-in required). Documentation and product information live on the public hosts below.

- Documentation index: ${DOCS_URL}/llms.txt
- Full documentation in one file: ${DOCS_URL}/llms-full.txt
- Product site: ${SITE_URL}/llms.txt
`;

export function GET(): Response {
  return new Response(BODY, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
