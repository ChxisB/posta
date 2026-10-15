import { defineI18n } from "fumadocs-core/i18n";

/**
 * English is the only language and stays unprefixed (/quickstart). The
 * locale routing is kept with that one entry, so adding a language later is
 * an entry here, a `[page].<locale>.mdx` file per page and a block in
 * lib/i18n-ui.ts, with no change to the English URLs. Pages without a file in
 * a language fall back to the English content (loader default:
 * fallbackLanguage = defaultLanguage).
 */
export const i18n = defineI18n({
  defaultLanguage: "en",
  languages: ["en"],
  hideLocale: "default-locale",
});

export function isLocale(value: string | undefined): value is (typeof i18n.languages)[number] {
  return value !== undefined && (i18n.languages as readonly string[]).includes(value);
}
