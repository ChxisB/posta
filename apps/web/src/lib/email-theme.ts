import { z } from "zod";
import { contrastRatio, TEXT_CONTRAST } from "./wcag";

/**
 * The email's own look: colours, font, corners and the space around it. This is
 * the email's theme, not the dashboard's (the Posta palette never reaches it).
 *
 * It is stored inside the template's `document`, as a top-level `theme` key on
 * the doc node, so it travels with the body everywhere the body goes: the
 * saved row, a duplicate, a broadcast made from the template, a local draft and
 * the dirty check. Tiptap drops unknown top-level keys when it serialises, so
 * the block editor hands the theme back on every change (see `withTheme`).
 *
 * Every value is validated: lowercase `#rrggbb`, a font from a short list of
 * families every mail client has, and three named sizes. Nothing the author
 * types reaches the html as a free string. This module is client-safe; the
 * render lives in email-render.ts.
 */

/** A colour as stored: lowercase `#rrggbb`. */
export const EMAIL_HEX = /^#[0-9a-f]{6}$/;

/** Fonts an email can use. Inter is today's look and the only one that loads a web font. */
export const EMAIL_FONTS = [
  { id: "inter", name: "Inter", fallback: "sans-serif" },
  { id: "arial", name: "Arial", fallback: "sans-serif" },
  { id: "verdana", name: "Verdana", fallback: "sans-serif" },
  { id: "trebuchet", name: "Trebuchet MS", fallback: "sans-serif" },
  { id: "georgia", name: "Georgia", fallback: "serif" },
  { id: "times", name: "Times New Roman", fallback: "serif" },
  { id: "courier", name: "Courier New", fallback: "monospace" },
] as const;

export type EmailFontId = (typeof EMAIL_FONTS)[number]["id"];

const FONT_IDS = EMAIL_FONTS.map((f) => f.id) as [EmailFontId, ...EmailFontId[]];

export const EMAIL_CORNERS = ["square", "soft", "round"] as const;
export type EmailCorners = (typeof EMAIL_CORNERS)[number];

export const EMAIL_SPACING = ["none", "medium", "large"] as const;
export type EmailSpacing = (typeof EMAIL_SPACING)[number];

/** The colour fields, in the order the panel lists them. */
export const EMAIL_COLOUR_KEYS = [
  "page",
  "email",
  "text",
  "heading",
  "link",
  "button",
  "buttonText",
] as const;
export type EmailColourKey = (typeof EMAIL_COLOUR_KEYS)[number];

const colour = z.string().regex(EMAIL_HEX);

/** What is stored: only the fields that differ from the default look. */
export const emailThemeSchema = z.strictObject({
  page: colour.optional(),
  email: colour.optional(),
  text: colour.optional(),
  heading: colour.optional(),
  link: colour.optional(),
  button: colour.optional(),
  buttonText: colour.optional(),
  font: z.enum(FONT_IDS).optional(),
  corners: z.enum(EMAIL_CORNERS).optional(),
  spacing: z.enum(EMAIL_SPACING).optional(),
});

export type EmailTheme = z.infer<typeof emailThemeSchema>;

/** Every field, filled in. */
export type EmailThemeValues = { [K in keyof EmailTheme]-?: NonNullable<EmailTheme[K]> };

/**
 * What an email looks like with no theme. These are Maily's own defaults, kept
 * here so the render never depends on them (see email-render.ts), and pinned by
 * a golden render in the tests.
 */
export const DEFAULT_EMAIL_THEME: EmailThemeValues = {
  page: "#ffffff",
  email: "#ffffff",
  text: "#374151",
  heading: "#111827",
  link: "#111827",
  button: "#000000",
  buttonText: "#ffffff",
  font: "inter",
  corners: "square",
  spacing: "none",
};

const THEME_KEYS = Object.keys(DEFAULT_EMAIL_THEME) as (keyof EmailThemeValues)[];

/** The theme with every field filled in; a field that is missing, or undefined, takes its default. */
export function effectiveTheme(theme: EmailTheme | undefined): EmailThemeValues {
  const values: Record<string, string> = { ...DEFAULT_EMAIL_THEME };
  if (theme) {
    for (const key of THEME_KEYS) {
      const value = theme[key];
      if (value !== undefined) values[key] = value;
    }
  }
  return values as EmailThemeValues;
}

/**
 * The theme without the fields that match the default look, or undefined when
 * nothing is left. Two themes that look alike store alike, so choosing the
 * default colour again leaves the template exactly as it was.
 */
export function canonicalTheme(theme: EmailTheme | undefined): EmailTheme | undefined {
  if (!theme) return undefined;
  const kept: Record<string, string> = {};
  for (const key of THEME_KEYS) {
    const value = theme[key];
    if (value !== undefined && value !== DEFAULT_EMAIL_THEME[key]) kept[key] = value;
  }
  return Object.keys(kept).length > 0 ? (kept as EmailTheme) : undefined;
}

export function sameTheme(a: EmailTheme | undefined, b: EmailTheme | undefined): boolean {
  const x = effectiveTheme(a);
  const y = effectiveTheme(b);
  return THEME_KEYS.every((key) => x[key] === y[key]);
}

/** The theme with one field set. The result is not canonical until it goes through `withTheme`. */
export function withField<K extends keyof EmailTheme>(
  theme: EmailTheme | undefined,
  key: K,
  value: NonNullable<EmailTheme[K]>,
): EmailTheme {
  return { ...theme, [key]: value } as EmailTheme;
}

/** A preset is a whole look; choosing one replaces every field. */
export interface EmailThemePreset {
  id: "default" | "dark" | "soft";
  theme: EmailTheme;
}

export const EMAIL_THEME_PRESETS: readonly EmailThemePreset[] = [
  { id: "default", theme: {} },
  {
    id: "dark",
    theme: {
      page: "#0b0b0e",
      email: "#18181b",
      text: "#e4e4e7",
      heading: "#ffffff",
      link: "#93c5fd",
      button: "#ffffff",
      buttonText: "#111827",
    },
  },
  {
    id: "soft",
    theme: {
      page: "#f4f4f5",
      email: "#ffffff",
      link: "#1d4ed8",
      button: "#18181b",
      corners: "soft",
      spacing: "medium",
    },
  },
];

/** The preset a theme is exactly equal to, if any. */
export function presetOf(theme: EmailTheme | undefined): EmailThemePreset["id"] | null {
  return EMAIL_THEME_PRESETS.find((p) => sameTheme(p.theme, theme))?.id ?? null;
}

/** `#abc` and `#ABCDEF` (with or without the hash) as stored `#aabbcc`, or null if it is not a colour. */
export function normaliseHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) return `#${[...raw].map((c) => c + c).join("")}`;
  return /^[0-9a-f]{6}$/.test(raw) ? `#${raw}` : null;
}

// ---- in the document ------------------------------------------------------

function isDocNode(value: unknown): value is { type: "doc" } & Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && (value as { type?: unknown }).type === "doc"
  );
}

/** The valid theme a document carries, or undefined (none, empty, or malformed). */
export function themeOf(document: unknown): EmailTheme | undefined {
  if (!isDocNode(document) || document.theme === undefined) return undefined;
  const parsed = emailThemeSchema.safeParse(document.theme);
  return parsed.success ? canonicalTheme(parsed.data) : undefined;
}

/** True when a document carries no `theme`, or one that is valid. */
export function hasValidTheme(document: unknown): boolean {
  if (!isDocNode(document) || document.theme === undefined) return true;
  return emailThemeSchema.safeParse(document.theme).success;
}

/** The document with its theme set (or removed, for the default look). The input is not changed. */
export function withTheme<T>(document: T, theme: EmailTheme | undefined): T {
  if (!isDocNode(document)) return document;
  const { theme: _old, ...rest } = document;
  const next = canonicalTheme(theme);
  return (next ? { ...rest, theme: next } : rest) as T;
}

/** The document as the editor takes it: without the theme, which Tiptap would drop anyway. */
export function withoutTheme<T>(document: T): T {
  return withTheme(document, undefined);
}

// ---- the renderer ---------------------------------------------------------

const CORNER_RADIUS: Record<EmailCorners, string> = { square: "0px", soft: "10px", round: "20px" };
const SPACING_PX: Record<EmailSpacing, string> = { none: "0px", medium: "24px", large: "48px" };

const INTER_WEB_FONT = {
  url: "https://rsms.me/inter/font-files/Inter-Regular.woff2?v=3.19",
  format: "woff2",
} as const;

/** The part of Maily's renderer theme a person can change. */
export interface RendererThemeFields {
  colors: { heading: string; paragraph: string };
  container: { backgroundColor: string; borderRadius: string };
  body: { backgroundColor: string; paddingTop: string; paddingBottom: string };
  button: { backgroundColor: string; color: string };
  link: { color: string };
  font: {
    fontFamily: string;
    fallbackFontFamily: string;
    webFont: { url: string; format: string } | undefined;
  };
}

/**
 * Maily's render options for a theme. It is always complete, never just the
 * fields that changed: `Maily#setTheme` merges into a module-level default that
 * every later render shares, so a partial theme would leak into the next email
 * rendered without one. Giving every field every time keeps that shared object
 * overwritten with the same values on each render.
 */
export function themeToRenderOptions(theme: EmailTheme | undefined): RendererThemeFields {
  const v = effectiveTheme(theme);
  const font = EMAIL_FONTS.find((f) => f.id === v.font) ?? EMAIL_FONTS[0];
  return {
    colors: { heading: v.heading, paragraph: v.text },
    container: { backgroundColor: v.email, borderRadius: CORNER_RADIUS[v.corners] },
    body: {
      backgroundColor: v.page,
      paddingTop: SPACING_PX[v.spacing],
      paddingBottom: SPACING_PX[v.spacing],
    },
    button: { backgroundColor: v.button, color: v.buttonText },
    link: { color: v.link },
    font: {
      fontFamily: font.name,
      fallbackFontFamily: font.fallback,
      webFont: font.id === "inter" ? { ...INTER_WEB_FONT } : undefined,
    },
  };
}

// ---- readability ----------------------------------------------------------

/** The pairs of colours an email puts one on the other. */
export type ThemePair = "text" | "heading" | "link" | "button";

export interface ThemeContrastIssue {
  pair: ThemePair;
  ratio: number;
}

/** The pairs in a theme that fall below 4.5:1, worst first. Advice only: nothing blocks a save. */
export function themeContrastIssues(theme: EmailTheme | undefined): ThemeContrastIssue[] {
  const v = effectiveTheme(theme);
  const pairs: [ThemePair, string, string][] = [
    ["text", v.text, v.email],
    ["heading", v.heading, v.email],
    ["link", v.link, v.email],
    ["button", v.buttonText, v.button],
  ];
  return pairs
    .map(([pair, fg, bg]) => ({ pair, ratio: contrastRatio(fg, bg) }))
    .filter((p) => p.ratio < TEXT_CONTRAST)
    .sort((a, b) => a.ratio - b.ratio);
}
