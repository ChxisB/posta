import { SITE_URL } from "@posta/config/site";

/** Escape a string for safe interpolation into HTML text or a "-quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Inverse of escapeHtml, plus the numeric references other escapers emit
 * (Handlebars writes `=` as `&#x3D;`, React `'` as `&#x27;`). Ampersand
 * last so `&amp;lt;` decodes to the literal `&lt;`, not `<`.
 */
export function unescapeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

/**
 * Named character references a mail body uses: the markup ones; the
 * invisible ones, which decode to their characters so they are counted and
 * stripped like them; and the punctuation a URL can be spelled with
 * (https&colon;&sol;&sol;), which a browser decodes in an href.
 */
const ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
  ["zwnj", "\u200c"],
  ["zwj", "\u200d"],
  ["shy", "\u00ad"],
  ["lrm", "\u200e"],
  ["rlm", "\u200f"],
  ["zerowidthspace", "\u200b"],
  ["colon", ":"],
  ["sol", "/"],
  ["bsol", "\\"],
  ["period", "."],
  ["comma", ","],
  ["quest", "?"],
  ["equals", "="],
  ["num", "#"],
  ["percnt", "%"],
  ["commat", "@"],
  ["excl", "!"],
  ["dollar", "$"],
  ["plus", "+"],
  ["ast", "*"],
  ["semi", ";"],
  ["lpar", "("],
  ["rpar", ")"],
  ["lsqb", "["],
  ["rsqb", "]"],
  ["lbrack", "["],
  ["rbrack", "]"],
  ["lcub", "{"],
  ["rcub", "}"],
  ["lbrace", "{"],
  ["rbrace", "}"],
  ["lowbar", "_"],
  ["grave", "`"],
  ["verbar", "|"],
  ["vert", "|"],
  ["tab", "\t"],
  ["newline", "\n"],
]);

/** Numeric character references and the named ones above, decoded; names match without case. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1]?.toLowerCase() === "x" ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES.get(body.toLowerCase()) ?? m;
  });
}

/** Whether `s` holds a named reference decodeEntities leaves as written: a browser may still decode it. */
export function hasUnknownReference(s: string): boolean {
  for (const m of s.matchAll(/&([a-z][a-z0-9]*);/gi)) {
    if (!ENTITIES.has((m[1] as string).toLowerCase())) return true;
  }
  return false;
}

// `[^<>]`, not `[^>]`: an unclosed tag then stops the scan at the next `<`
// instead of rescanning to the end from every one, quadratic on a crafted
// body. An unclosed style/script swallows the rest, as a browser does.
export function visibleText(html: string): string {
  return html
    .replace(/<(style|script)\b(?:[\s\S]*?<\/\1\s*>|[\s\S]*)/gi, "")
    .replace(/<[^<>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Wordmarks for system emails, hosted by the product site rather than the
 * instance: most self-hosted deployments sit on private or loopback hosts
 * that recipients' mail clients cannot fetch from. Ink glyphs for the light
 * card, bone glyphs for a dark one, both on a transparent ground and wide
 * enough that Gmail for Android, which recolours images drawn at 64×64 CSS px
 * or smaller, leaves them alone.
 */
export const EMAIL_WORDMARK_INK_URL = `${SITE_URL}/email/wordmark-ink.png`;
export const EMAIL_WORDMARK_BONE_URL = `${SITE_URL}/email/wordmark-bone.png`;

/**
 * A solid white tile: the Gmail button's fill. Gmail for Android darkens
 * bright colour stops even inside a background gradient (observed
 * 2026-09-13: a white-to-white gradient came back as its dark grey), but it
 * never repaints an image, so the one white surface that survives there is
 * a picture of white.
 */
export const EMAIL_WHITE_TILE_URL = `${SITE_URL}/email/white.png`;

/**
 * Fills `{key}` placeholders. A replacer function, not a replacement string:
 * user-controlled values such as names may contain `$'` / `$$`, which
 * String.replace would otherwise interpret. Every occurrence is filled.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/**
 * The account mail's colours as literals, because email clients do not read
 * CSS variables. Each one is a dashboard token (apps/web/src/styles/tokens/
 * colors.css): page is --po-void, card --po-panel, text --po-bone, muted
 * --po-muted, link --po-accent-text, button --po-accent and onButton
 * --po-on-accent. apps/web/test/brand-rules.test.ts ties them to the tokens
 * and holds the text pairs to 4.5:1. Light is the look a client with no
 * theme gets; dark is what the rules below swap in.
 */
export const EMAIL_COLOURS = {
  light: {
    page: "#f8f8fa",
    card: "#ffffff",
    text: "#16161d",
    muted: "#62626e",
    link: "#7046e8",
    button: "#7046e8",
    onButton: "#ffffff",
  },
  dark: {
    page: "#09090b",
    card: "#111115",
    text: "#f4f4f6",
    muted: "#9b9ba6",
    link: "#a98bff",
    button: "#7046e8",
    onButton: "#ffffff",
  },
} as const;

const LIGHT = EMAIL_COLOURS.light;
const DARK = EMAIL_COLOURS.dark;

const MUTED = `class="po-muted" style="font-size:13px;line-height:1.5;color:${LIGHT.muted};margin:24px 0 0"`;

/** The dark theme: the button stays flat violet with white text, as in the dashboard. */
const DARK_RULES = [
  `.po-page{background:${DARK.page} !important}`,
  `.po-card{background:${DARK.card} !important}`,
  `.po-text{color:${DARK.text} !important}`,
  `.po-muted{color:${DARK.muted} !important}`,
  `.po-link{color:${DARK.link} !important}`,
  `.po-btn{background:${DARK.button} !important;color:${DARK.onButton} !important}`,
  ".po-ink{display:none !important}",
  ".po-bone{display:block !important}",
];

/**
 * Mail clients go dark in three ways, and the sheet answers each. Apple Mail,
 * iOS Mail, Outlook for Mac, Samsung and Thunderbird honour the media query
 * once the color-scheme meta opts the email in. Outlook.com and the Outlook
 * apps recolour on their own and stamp data-ogsc / data-ogsb on what they
 * touched, so the same rules hang off those. Gmail with a Google account
 * honours neither: it only repaints the card (Android darkens light
 * backgrounds and keeps dark ones, iOS inverts every colour) and wraps the
 * body so that `u + .body` matches there alone. There the wordmark and the
 * button are painted as the difference from the card instead: the bone
 * glyphs and the white tile come out ink on the light card and bone on a
 * dark one. The button's label sits in nested black wrappers that keep it
 * white whatever Gmail does to colours (Rémi Parmentier's screen-over-
 * difference pair), and one more difference against the white tile turns
 * it black inside the button's layer, so it reads as the fill's negative.
 */
const STYLE = [
  ":root{color-scheme:light dark;supported-color-schemes:light dark}",
  `@media (prefers-color-scheme:dark){${DARK_RULES.join("")}}`,
  ...DARK_RULES.flatMap((rule) => [`[data-ogsc] ${rule}`, `[data-ogsb] ${rule}`]),
  "u + .body .po-ink{display:none !important}",
  "u + .body .po-bone{display:block !important}",
  "u + .body .po-btn{display:none !important}",
  "u + .body .po-gmail{display:inline-block !important}",
].join("\n");

const WORDMARK = `<a href="${SITE_URL}" style="display:block;margin:0 0 24px;line-height:0">
      <img class="po-ink" src="${EMAIL_WORDMARK_INK_URL}" width="174" height="24" alt="Posta" style="display:block;height:24px;width:auto;border:0;color:${LIGHT.text};font:700 20px/24px -apple-system,'Segoe UI',Roboto,sans-serif">
      <!--[if !mso]><!--><img class="po-bone" src="${EMAIL_WORDMARK_BONE_URL}" width="174" height="24" alt="Posta" style="display:none;height:24px;width:auto;border:0;mix-blend-mode:difference;color:${DARK.text};font:700 20px/24px -apple-system,'Segoe UI',Roboto,sans-serif"><!--<![endif]-->
    </a>`;

/**
 * Word (classic Outlook for Windows) ignores display:none on images and
 * inline anchors, so the alternates it must never see sit behind a
 * conditional comment instead.
 */
function buttons(url: string, label: string): string {
  const text = "font-size:14px;font-weight:600";
  return `<a class="po-btn" href="${url}" style="display:inline-block;background:${LIGHT.button};color:${LIGHT.onButton};${text};text-decoration:none;border-radius:8px;padding:12px 20px;margin-top:12px">${label}</a>
    <!--[if !mso]><!--><a class="po-gmail" href="${url}" style="display:none;${text};background:#ffffff url(${EMAIL_WHITE_TILE_URL});mix-blend-mode:difference;border-radius:8px;padding:12px 20px;margin-top:12px;text-decoration:none"><span style="mix-blend-mode:difference"><span style="background:#000000;mix-blend-mode:screen"><span style="background:#000000;mix-blend-mode:difference"><span style="color:#ffffff">${label}</span></span></span></span></a><!--<![endif]-->`;
}

/**
 * The one account-mail layout, for every email the instance sends about
 * itself: wordmark, card, an optional heading, paragraphs, a button, then
 * muted footers, as a full document so the theme sheet reaches the clients
 * that read one. The card is neutral white on purpose: Yahoo's dark theme
 * lowers lightness rather than inverting, and a hue-tinted off-white comes
 * out as a saturated mustard there. `linkFallback` adds
 * the button's URL as text under it, for the mails whose link is the point
 * (a reset, a verification); without it the text version names the button
 * instead. Everything is escaped here, so catalogs stay plain text.
 */
export function accountMailCard(input: {
  heading?: string;
  paragraphs: string[];
  button?: string;
  url?: string | undefined;
  linkFallback?: string;
  muted: string[];
}): { html: string; text: string } {
  const url = input.url === undefined ? undefined : escapeHtml(input.url);
  const heading = input.heading
    ? `<p class="po-text" style="font-size:22px;line-height:1.3;font-weight:700;color:${LIGHT.text};margin:0 0 12px;font-variant-numeric:tabular-nums">${escapeHtml(input.heading)}</p>\n    `
    : "";
  const paragraphs = input.paragraphs
    .map(
      (p) =>
        `<p class="po-text" style="font-size:14px;line-height:1.5;color:${LIGHT.text};margin:0 0 12px">${escapeHtml(p)}</p>`,
    )
    .join("\n    ");
  const button =
    url !== undefined && input.button ? `\n    ${buttons(url, escapeHtml(input.button))}` : "";
  const fallback =
    url !== undefined && input.linkFallback
      ? `\n    <p ${MUTED}>${escapeHtml(input.linkFallback)}<br><a class="po-link" href="${url}" style="color:${LIGHT.link};word-break:break-all">${url}</a></p>`
      : "";
  const muted = input.muted.map((m) => `<p ${MUTED}>${escapeHtml(m)}</p>`).join("\n    ");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
${STYLE}
</style>
</head>
<body class="body" style="margin:0;padding:0">
<div class="po-page" style="background:${LIGHT.page};padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,sans-serif">
  <div class="po-card" style="max-width:440px;margin:0 auto;background:${LIGHT.card};border-radius:12px;padding:32px">
    ${WORDMARK}
    ${heading}${paragraphs}${button}${fallback}
    ${muted}
  </div>
</div>
</body>
</html>`;
  const link =
    input.url === undefined ? "" : input.linkFallback ? input.url : `${input.button}: ${input.url}`;
  const lines = input.heading ? [input.heading, ...input.paragraphs] : input.paragraphs;
  const text = `${lines.join("\n\n")}\n\n${link}\n\n${input.muted.join("\n\n")}\n`;
  return { html, text };
}
