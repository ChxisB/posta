import { loader } from "fumadocs-core/source";
import { openapiPlugin } from "fumadocs-openapi/server";
import { docs } from "../../.source/server";
import { i18n } from "./i18n";

export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
  // Locale variants would use the dot convention (page.<locale>.mdx, meta.<locale>.json).
  i18n,
  // Adds HTTP-method badges to generated API reference pages in the page tree.
  plugins: [openapiPlugin()],
});
