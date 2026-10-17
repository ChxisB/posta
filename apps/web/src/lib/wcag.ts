/**
 * WCAG 2.x contrast for six-digit hex colours, small enough for the client
 * bundle. The dashboard's own token checks (test-support/contrast.ts) parse CSS
 * and composite translucent colours; an email theme only ever holds opaque hex.
 */

/** Body text and anything read as text: WCAG 1.4.3 AA. */
export const TEXT_CONTRAST = 4.5;

function channel(hex: string, at: number): number {
  const v = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of `#rrggbb`, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** The contrast ratio of two `#rrggbb` colours, 1 to 21, in either order. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
