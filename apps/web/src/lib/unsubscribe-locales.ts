import en from "../../messages/unsubscribe/en.json";

/** Recipient-facing catalog shape; every locale's file carries these keys (i18n-parity test). */
export type UnsubscribeMessages = typeof en;

/**
 * The languages the hosted unsubscribe page speaks, each named in itself for
 * the preview's picker. Recipients are not dashboard users, so this list
 * can grow apart from the dashboard's locales.
 */
export const UNSUBSCRIBE_LOCALES = {
  en: { name: "English", messages: en },
} as const satisfies Record<string, { name: string; messages: UnsubscribeMessages }>;

export type UnsubscribeLocale = keyof typeof UNSUBSCRIBE_LOCALES;

export const DEFAULT_UNSUBSCRIBE_LOCALE: UnsubscribeLocale = "en";

const LOCALE_TAGS = Object.keys(UNSUBSCRIBE_LOCALES) as UnsubscribeLocale[];

/**
 * The page's locale for an Accept-Language header: tags in the order the
 * browser ranks them, an exact match first ("en"), then the language alone
 * ("en-GB" → "en"); English when nothing matches.
 */
export function pickUnsubscribeLocale(
  acceptLanguage: string | null | undefined,
): UnsubscribeLocale {
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().toLowerCase().split(";");
      const quality = Number(
        params
          .map((p) => p.trim())
          .find((p) => p.startsWith("q="))
          ?.slice(2),
      );
      return { tag: tag.trim(), q: Number.isFinite(quality) ? quality : 1, index };
    })
    .filter((entry) => entry.tag !== "" && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of ranked) {
    const exact = LOCALE_TAGS.find((locale) => locale.toLowerCase() === tag);
    if (exact) return exact;
    const language = tag.split("-")[0];
    const byLanguage = LOCALE_TAGS.find(
      (locale) => locale.toLowerCase().split("-")[0] === language,
    );
    if (byLanguage) return byLanguage;
  }
  return DEFAULT_UNSUBSCRIBE_LOCALE;
}
