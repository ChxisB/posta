import type { EmailCheckResult, ScoreBand } from "@posta/core";

/** Band → status-badge tone. Bands are semantic (score health), never decorative. */
export const BAND_TONE: Record<ScoreBand, string> = {
  excellent: "success",
  good: "info",
  needs_attention: "warn",
  at_risk: "danger",
};

/** scoreTenths (0 to 100) → localized one-decimal 0 to 10 string ("8.5"). */
export function formatScoreTenths(scoreTenths: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(scoreTenths / 10);
}

/** Text-icon glyph + status color per check row (DESIGN.md icon system). */
export function checkGlyph(check: EmailCheckResult): { glyph: string; color: string } {
  switch (check.status) {
    case "fail":
      return {
        glyph: "✕",
        color:
          check.severity === "critical" || check.severity === "major"
            ? "var(--po-danger)"
            : "var(--po-warn)",
      };
    case "unknown":
      return { glyph: "?", color: "var(--po-muted)" };
    case "not_applicable":
      return { glyph: "-", color: "var(--po-faint)" };
    default:
      return { glyph: "✓", color: "var(--po-success)" };
  }
}
