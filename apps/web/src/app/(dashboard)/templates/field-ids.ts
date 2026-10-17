import type { EmailColourKey } from "@/lib/email-theme";

/** The template editor's fields by DOM id, so the preflight strip can take a person to one. */
export const SUBJECT_FIELD_ID = "tpl-subject";
export const PREVIEW_TEXT_FIELD_ID = "tpl-preview-text";

/** A colour's hex field in the theme panel. */
export const themeFieldId = (key: EmailColourKey) => `tpl-theme-${key}`;
