/**
 * WCAG contrast over the theme tokens in styles/tokens/colors.css: reads the
 * two theme blocks the way the cascade applies them, resolves var()
 * references, and lists the pairs the UI draws one on the other. Used by
 * contrast.test.ts; the brand guard (RB19) can reuse the pairs.
 */

export type Theme = "dark" | "light";
export type Tokens = Record<string, string>;
type Rgb = [number, number, number];

const DARK_SELECTOR = ':root,\n[data-theme="dark"]';
const LIGHT_SELECTOR = ':root[data-theme="light"],\n[data-theme="light"]';

/** Body text and anything read as text: WCAG 1.4.3 AA. */
export const TEXT = 4.5;
/** Controls, focus indicators and marks that carry meaning: WCAG 1.4.11. */
export const UI = 3;

const SURFACES = ["void", "ground", "panel", "panel-raised", "inset"];
const TEXT_COLOURS = ["bone", "muted", "accent-text"];
const FAMILIES = ["success", "info", "warn", "danger", "neutral", "violet", "pink"];

export type Pair = { fg: string; bg: string; min: number };

/**
 * The pairs the components draw. Faint and the status dots are left out on
 * purpose: faint is disabled/decorative only, and every dot sits beside its
 * text label.
 */
export const PAIRS: Pair[] = [
  ...[...TEXT_COLOURS, ...FAMILIES].flatMap((fg) => SURFACES.map((bg) => ({ fg, bg, min: TEXT }))),
  // Badges and alerts: each family's text on its own tint.
  ...FAMILIES.map((family) => ({ fg: family, bg: `${family}-bg`, min: TEXT })),
  // Primary buttons, at rest and hovered.
  { fg: "on-accent", bg: "accent", min: TEXT },
  { fg: "on-accent", bg: "accent-hover", min: TEXT },
  // Checked checkboxes, radios and the slider against the card they sit on.
  ...["void", "panel", "panel-raised"].map((bg) => ({ fg: "accent", bg, min: UI })),
  // The focus ring's colour, composited over the surface it rings.
  ...SURFACES.map((bg) => ({ fg: "focus-ring", bg, min: UI })),
];

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function declarations(body: string): Tokens {
  const tokens: Tokens = {};
  for (const part of body.split(";")) {
    const [, name, value] = /^\s*--po-([\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(part) ?? [];
    if (name && value) tokens[name] = value.replace(/\s+/g, " ");
  }
  return tokens;
}

/** Every top-level block in the file, keyed by its selector as written. */
function blocks(css: string): Map<string, Tokens> {
  const found = new Map<string, Tokens>();
  for (const [, head = "", body = ""] of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = head.trim();
    found.set(selector, { ...found.get(selector), ...declarations(body) });
  }
  return found;
}

/**
 * The tokens in effect in each theme. Dark is the default (`:root`); light
 * overrides on top of it, so a token light forgets would show its dark value.
 */
export function themeTokens(css: string): Record<Theme, Tokens> {
  const all = blocks(css);
  const shared = all.get(":root") ?? {};
  const dark = all.get(DARK_SELECTOR);
  const light = all.get(LIGHT_SELECTOR);
  if (!dark || !light) throw new Error("colors.css: a theme block is missing");
  return {
    dark: { ...shared, ...dark },
    light: { ...shared, ...dark, ...light },
  };
}

/** The names each theme block itself declares (no cascade). */
export function declaredNames(css: string): Record<Theme, string[]> {
  const all = blocks(css);
  return {
    dark: Object.keys(all.get(DARK_SELECTOR) ?? {}),
    light: Object.keys(all.get(LIGHT_SELECTOR) ?? {}),
  };
}

export function resolve(tokens: Tokens, name: string, seen: string[] = []): string {
  const value = tokens[name];
  if (value === undefined) throw new Error(`--po-${name} is not defined`);
  const [, ref] = /^var\(--po-([\w-]+)\)$/.exec(value) ?? [];
  if (!ref) return value;
  if (seen.includes(ref)) throw new Error(`--po-${name} refers to itself`);
  return resolve(tokens, ref, [...seen, name]);
}

/** A colour as #rgb, #rrggbb or rgb()/rgba(); also the colour inside a box-shadow. */
export function parseColour(value: string): { rgb: Rgb; alpha: number } {
  const [, hex] = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(value) ?? [];
  if (hex) {
    const digits = hex.length === 3 ? [...hex].map((d) => d + d).join("") : hex;
    return {
      rgb: [0, 2, 4].map((i) => Number.parseInt(digits.slice(i, i + 2), 16)) as Rgb,
      alpha: 1,
    };
  }
  const fn = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(
    value,
  );
  if (fn) {
    return {
      rgb: [Number(fn[1]), Number(fn[2]), Number(fn[3])],
      alpha: fn[4] === undefined ? 1 : Number(fn[4]),
    };
  }
  throw new Error(`not a colour: ${value}`);
}

function over(top: { rgb: Rgb; alpha: number }, under: Rgb): Rgb {
  return top.rgb.map((c, i) => c * top.alpha + (under[i] ?? 0) * (1 - top.alpha)) as Rgb;
}

function linear(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast of fg on bg; a translucent fg is composited over bg first. */
export function contrast(fg: string, bg: string): number {
  const ground = parseColour(bg);
  if (ground.alpha !== 1) throw new Error(`a surface must be opaque: ${bg}`);
  const a = luminance(over(parseColour(fg), ground.rgb));
  const b = luminance(ground.rgb);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
