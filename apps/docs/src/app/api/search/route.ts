import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

// i18n loader → one index per locale; the client sends its locale automatically.
export const { GET } = createFromSource(source);
