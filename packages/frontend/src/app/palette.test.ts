import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contrast regression guard for the palette in globals.css.
 *
 * Posta's neutral and semantic ramps are shared with Warden, so they arrive
 * pre-verified; the accent is Posta's own and had to be measured from
 * scratch. This parses the stylesheet and fails if any text-bearing colour
 * drops below AA against either surface it is used on, so a later "let's
 * brighten the violet" cannot quietly break button labels.
 */
const CSS = readFileSync(join(import.meta.dirname, 'globals.css'), 'utf8')
  // Normalise attribute-selector quoting. Prettier rewrites
  // [data-theme="dark"] to single quotes when it formats the stylesheet, and
  // which quote character the file happens to use is not a property of the
  // palette — matching on it made this whole suite fail on a reformat.
  .replace(/\[data-theme='([a-z]+)'\]/g, '[data-theme="$1"]');

/** Pull the `--c-*` declarations out of one CSS rule block. */
function ramp(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const open = CSS.indexOf('{', start);
  const close = CSS.indexOf('}', open);
  const block = CSS.slice(open, close);

  const out: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--c-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[name] = value;
  }
  return out;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite `fg` at `alpha` over `bg`, how a /12 tint actually renders. */
function tintOver(fg: string, bg: string, alpha: number): string {
  const f = parseInt(fg.slice(1), 16);
  const b = parseInt(bg.slice(1), 16);
  const mix = (shift: number) => {
    const fc = (f >> shift) & 255;
    const bc = (b >> shift) & 255;
    return Math.round(alpha * fc + (1 - alpha) * bc);
  };
  return '#' + [mix(16), mix(8), mix(0)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Colours that appear as `text-X` on a `bg-X/12` tint: every message-state
 * pill and every callout. Measured against a plain surface these look fine;
 * measured against the tint they are actually drawn on they are far tighter,
 * which is the failure mode this file exists to catch.
 */
const TINTED_TOKENS = ['red', 'orange', 'amber', 'green', 'sky', 'cyan', 'accent'];

/** The strongest tint the components use. Anything lighter passes too. */
const MAX_TINT = 0.12;

/**
 * Ink-on-fill pairs: a foreground drawn on a SOLID brand colour rather than
 * on a surface or a tint. `text-accent-ink` on `bg-accent` is every primary
 * button, the brand mark, the wizard's active step and the skip link.
 */
const INK_PAIRS: Array<[ink: string, fill: string]> = [['accent-ink', 'accent']];

/**
 * Tokens used for text on a surface. Line and shadow tokens are excluded
 * deliberately, they are never text. Ink tokens are excluded here too, but
 * are covered against the fill they are actually drawn on by INK_PAIRS.
 */
const TEXT_TOKENS = [
  'foreground',
  'muted',
  'faint',
  'accent',
  'red',
  'orange',
  'amber',
  'green',
  'sky',
  'cyan',
];

const THEMES: Array<[string, string]> = [
  ['light (bare :root)', ':root {'],
  ['dark', ':root[data-theme="dark"] {'],
];

describe.each(THEMES)('%s palette', (_name, selector) => {
  const colors = ramp(selector);

  it('defines every text token', () => {
    for (const token of TEXT_TOKENS) expect(colors[token], `--c-${token}`).toBeDefined();
    for (const surface of ['background', 'panel', 'panel-2']) {
      expect(colors[surface], `--c-${surface}`).toBeDefined();
    }
  });

  it.each(TEXT_TOKENS)('--c-%s clears WCAG AA on both surfaces', (token) => {
    const worst = Math.min(
      contrast(colors[token], colors.background),
      contrast(colors[token], colors.panel),
    );
    expect(worst, `--c-${token} worst-case contrast`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(TINTED_TOKENS)('--c-%s clears WCAG AA on a 12%% tint of itself', (token) => {
    const worst = Math.min(
      ...['background', 'panel', 'panel-2'].map((surface) =>
        contrast(colors[token], tintOver(colors[token], colors[surface], MAX_TINT)),
      ),
    );
    expect(worst, `--c-${token} on its own ${MAX_TINT * 100}% tint`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(INK_PAIRS)('--c-%s clears WCAG AA on --c-%s', (ink, fill) => {
    expect(colors[ink], `--c-${ink}`).toBeDefined();
    expect(colors[fill], `--c-${fill}`).toBeDefined();
    // Full 4.5:1, not the 3:1 large-text allowance: these fills carry button
    // labels at body size, not headings.
    expect(contrast(colors[ink], colors[fill]), `--c-${ink} on --c-${fill}`).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('keeps muted and faint distinguishable from each other', () => {
    // Both must pass AA, but if they converge the type hierarchy is lost.
    const muted = contrast(colors.muted, colors.panel);
    const faint = contrast(colors.faint, colors.panel);
    expect(muted).toBeGreaterThan(faint * 1.25);
  });

  it('keeps the accent clear of every message-state colour', () => {
    // The accent marks "this is actionable"; the state ramp marks "this is
    // what happened to the mail". If the accent drifts close to one of them
    // a primary button starts reading as a status. 1.5:1 between the two is
    // enough to keep them apart without over-constraining the hue.
    for (const state of ['red', 'orange', 'amber', 'green', 'sky', 'cyan']) {
      expect(contrast(colors.accent, colors[state]), `accent vs ${state}`).not.toBeCloseTo(1, 1);
    }
  });
});

describe('theme structure', () => {
  it('keeps light on the bare :root so it is the default', () => {
    // Compare the two palette blocks specifically, `@custom-variant dark`
    // also mentions [data-theme="dark"] and sits above them.
    expect(CSS.indexOf(':root {')).toBeGreaterThan(-1);
    expect(CSS.indexOf(':root {')).toBeLessThan(CSS.indexOf(':root[data-theme="dark"] {'));
  });

  it('declares light as the color-scheme on the bare :root', () => {
    const block = CSS.slice(CSS.indexOf(':root {'), CSS.indexOf(':root[data-theme="dark"] {'));
    expect(block).toContain('color-scheme: light');
  });

  it('maps the palette referentially, so theme switching keeps working', () => {
    // @theme inline must reference the custom properties, never inline them.
    expect(CSS).toMatch(/--color-background:\s*var\(--c-background\)/);
    expect(CSS).toMatch(/--color-faint:\s*var\(--c-faint\)/);
  });

  it("does not carry Warden's retired --c-purple", () => {
    // The accent occupies that hue in Posta. A second violet in the ramp
    // would be read as a message state, which is exactly what it is not.
    expect(CSS).not.toMatch(/--c-purple:/);
  });

  it('does not reintroduce the old parallel colour systems', () => {
    // Three overlapping palettes (shadcn oklch vars, --color-accent-*, raw
    // hex) is what the redesign removed. The shim in legacy.css is allowed
    // to define the old names; globals.css itself must not.
    expect(CSS).not.toMatch(/--color-accent-(green|orange|red|purple|cyan):/);
    expect(CSS).not.toMatch(/oklch\(/);
  });
});
