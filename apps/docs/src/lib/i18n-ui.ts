// Kept apart from lib/i18n.ts so proxy.ts (middleware bundle) never pulls in
// fumadocs-ui.
import { defineI18nUI } from "fumadocs-ui/i18n";
import { i18n } from "./i18n";

export const i18nUI = defineI18nUI(i18n, {
  en: { displayName: "English" },
});
