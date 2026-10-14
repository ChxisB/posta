/**
 * The brand rules as functions over text, so test/brand-rules.test.ts can run
 * each one on the real tree and again on a deliberate violation to show it
 * fails. Colour contrast lives in contrast.ts; the token reader is shared.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root: this file is apps/web/src/test-support/. */
export const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", ".git", "out", "coverage"]);

export function repoPath(...parts: string[]): string {
  return join(REPO, ...parts);
}

export function readRepoFile(path: string): string {
  return readFileSync(repoPath(path), "utf8");
}

/** Repo-relative paths of every file under `dir` with one of the extensions. */
export function filesUnder(dir: string, extensions: string[]): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(current, entry.name));
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        found.push(relative(REPO, join(current, entry.name)));
      }
    }
  };
  walk(repoPath(dir));
  return found.sort();
}

/* ---------------------------------------------------------------- old brand */

/**
 * Code still names the previous product's logo files until RB18 replaces them
 * (it needs the Brand Book). These paths are the only old-brand strings the
 * scan lets through; RB18 deletes this pattern and the files together.
 */
const PENDING_LOGO_FILES =
  /millionsend-(?:avatar-512|avatar|banner|favicon|mark|wordmark-light|wordmark)\.(?:svg|png)/g;

/** The previous product's name, and its display font, wherever they survive. */
export function oldBrandHits(text: string): string[] {
  const rest = text.replace(PENDING_LOGO_FILES, "");
  return [...rest.matchAll(/millionsend|\bErode\b/gi)]
    .map((match) => match[0])
    .filter((hit) => hit.toLowerCase() === "millionsend" || hit === "Erode");
}

/* -------------------------------------------------------- colours, in text */

/**
 * #rrggbb and #rrggbbaa. Three-digit forms are not scanned: the brand colours
 * are always six digits, and #000 / #fff are mask and filter plumbing. The
 * lookbehind skips numeric character references such as &#128512;.
 */
const HEX = /(?<!&)#(?:[0-9a-f]{8}|[0-9a-f]{6})(?![0-9a-z_-])/gi;

export function hexLiterals(text: string): string[] {
  return [...text.matchAll(HEX)].map((match) => match[0].toLowerCase());
}

export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every hex colour colors.css declares: the values the rest of the repo may copy. */
export function tokenHexes(colorsCss: string): Set<string> {
  return new Set(hexLiterals(stripCssComments(colorsCss)));
}

/** Pure black and white are plumbing (masks, filters, a label on a fill), not palette. */
export const PLAIN_HEX = ["#000000", "#ffffff"];

/**
 * Hex colours a file may carry although they are not tokens. Each entry says
 * why; a new one needs a reason that is not "the page looked wrong".
 */
export const HEX_ALLOWED_IN: Record<string, { hexes: string[]; why: string }> = {
  "apps/web/src/components/auth/social-icons.tsx": {
    hexes: ["#4285f4", "#34a853", "#fbbc05", "#ea4335"],
    why: "Google's own mark; a provider's colours are not ours to change",
  },
  "apps/docs/src/app/global.css": {
    hexes: ["#ad7a03", "#ffe47e", "#0053b8", "#74aef6"],
    why: "API method labels in Postman's palette, which developers already read",
  },
};

/**
 * Files whose colours are data rather than design, so the scan skips them:
 * nothing here is drawn in the product's own chrome.
 */
export const HEX_EXEMPT_FILES: Record<string, string> = {
  "packages/core/src/abuse-judge/body.ts":
    "the CSS named-colour table, used to tell whether text in an inbound email is invisible",
  "packages/core/src/inboxes/labels.ts":
    "the colours a customer's inbox labels are given by default, not ours",
};

/**
 * The hex colours in `text` that are neither a token, plain black or white,
 * nor allowed for `file`.
 */
export function strayHexes(
  file: string,
  text: string,
  tokens: Set<string>,
  allowed = HEX_ALLOWED_IN,
): string[] {
  const extra = new Set(allowed[file]?.hexes ?? []);
  return [
    ...new Set(
      hexLiterals(text).filter(
        (hex) => !tokens.has(hex) && !PLAIN_HEX.includes(hex) && !extra.has(hex),
      ),
    ),
  ];
}

/* ----------------------------------------------------------- the gradient */

/**
 * Files outside colors.css that may use the Coral→Rose→Violet gradient: the
 * mark and large brand moments only. None yet; RB18 adds the logo component
 * and names it here.
 */
export const GRADIENT_ALLOWED_IN: string[] = [];

const GRADIENT_USE = /--po-brand-(?:gradient|coral|rose)|#ff6a3d|#e8458b/i;

export function usesGradient(text: string): boolean {
  return GRADIENT_USE.test(text);
}

/* ----------------------------------------------------------------- assets */

/** Public files a source file names by path: /logo/…, /email/…, /og.png. The proxy's /favicon.ico matcher is not one. */
const ASSET_PATH =
  /\/(?:(?:logo|email|auth|empty-states)\/[\w./-]*?\.(?:svg|png|webp|jpe?g|ico)|og\.png)/g;

export function assetRefs(text: string): string[] {
  return [...new Set([...text.matchAll(ASSET_PATH)].map((match) => match[0]))];
}

/**
 * Public files the code points at that are not there yet. The three email
 * images are the wordmark and the Gmail button tile that RB18 supplies with the
 * logo; the test requires this list to be exact, so it cannot hide a new gap
 * and cannot outlive the files.
 */
export const KNOWN_MISSING_ASSETS = [
  "email/white.png",
  "email/wordmark-bone.png",
  "email/wordmark-ink.png",
];

export function missingAssets(publicDir: string, refs: string[]): string[] {
  return refs.filter((ref) => !existsSync(repoPath(publicDir, ref))).map((ref) => ref.slice(1));
}

/* -------------------------------------------------------------- tokens */

/** Colour tokens in the CSS vars the code reads that no stylesheet or style prop defines. */
export function undefinedTokens(sources: { css: string[]; code: string[] }): string[] {
  const declared = new Set<string>();
  for (const css of sources.css) {
    for (const [, name = ""] of stripCssComments(css).matchAll(/(?<![\w-])--po-([\w-]+)\s*:/g)) {
      declared.add(name);
    }
  }
  // Set at runtime: a quoted "--po-x" in a style object or setProperty call.
  for (const code of sources.code) {
    for (const [, name = ""] of code.matchAll(/["'`]--po-([\w-]+)["'`]/g)) declared.add(name);
  }
  const used = new Set<string>();
  for (const text of [...sources.css.map(stripCssComments), ...sources.code]) {
    // var(--po-x, fallback) is safe when the token is missing; only bare reads count.
    for (const [, name = ""] of text.matchAll(/var\(\s*--po-([\w-]+)\s*\)/g)) used.add(name);
  }
  return [...used].filter((name) => !declared.has(name)).sort();
}

/* ------------------------------------------------------------- DESIGN.md */

export type DesignRow = { token: string; cells: string[] };

/** The table rows whose first cell is a `--po-*` token, with the cells after it. */
export function designRows(markdown: string): DesignRow[] {
  const rows: DesignRow[] = [];
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) continue;
    const [first = "", ...cells] = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    const [, token] = /^`--po-([\w-]+)`$/.exec(first) ?? [];
    if (token) rows.push({ token, cells });
  }
  return rows;
}

/** Non-colour tokens (type sizes, radii): `--po-name: value;` across the given CSS. */
export function plainTokens(css: string[]): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const text of css) {
    for (const [, name = "", value = ""] of stripCssComments(text).matchAll(
      /--po-([\w-]+)\s*:\s*([^;]+);/g,
    )) {
      tokens[name] = value.trim();
    }
  }
  return tokens;
}

export const isHex = (value: string): boolean => /^#[0-9a-f]{6}$/i.test(value);

/* ---------------------------------------------------------------- docs */

/** The --color-fd-* values in the docs stylesheet's light (:root) and dark (.dark) blocks. */
export function docsPalette(css: string): {
  light: Record<string, string>;
  dark: Record<string, string>;
} {
  const block = (selector: RegExp): Record<string, string> => {
    const [, body = ""] = selector.exec(stripCssComments(css)) ?? [];
    const values: Record<string, string> = {};
    for (const [, name = "", value = ""] of body.matchAll(
      /--color-fd-([\w-]+)\s*:\s*(#[0-9a-f]{6})/gi,
    )) {
      values[name] = value.toLowerCase();
    }
    return values;
  };
  return {
    light: block(/(?:^|[\s}]):root\s*\{([^}]*)\}/),
    dark: block(/(?:^|[\s}])\.dark\s*\{([^}]*)\}/),
  };
}
