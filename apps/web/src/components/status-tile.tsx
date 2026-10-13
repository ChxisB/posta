import type { NavIconName } from "./icons/nav-icons";
import { NavGlyph } from "./icons/nav-icons";

/** Tile tint per badge tone, so a row's tile and its status pill read as one. */
export const TONE_COLOR = {
  success: "var(--po-success)",
  info: "var(--po-info)",
  warn: "var(--po-warn)",
  danger: "var(--po-danger)",
  neutral: "var(--po-muted)",
} as const;

/**
 * Rounded-square tile tinted by a status color, framing a small glyph: the
 * envelope on email rows, a section's nav glyph on the other lists. One frame
 * and one tint rule, so every list leads with the same mark.
 */
export function StatusTile({
  color,
  size = 28,
  children,
}: {
  color: string;
  size?: number;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: "none",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Math.max(7, Math.round(size * 0.28)),
        border: `1px solid color-mix(in srgb, ${color} 45%, var(--po-line))`,
        background: `linear-gradient(180deg, color-mix(in srgb, ${color} 16%, var(--po-panel)), color-mix(in srgb, ${color} 6%, var(--po-panel)))`,
        color,
      }}
    >
      {children}
    </span>
  );
}

/** A section's nav glyph in a status tile — the row mark for lists other than emails. */
export function NavTile({
  name,
  color,
  size = 28,
}: {
  name: NavIconName;
  color: string;
  size?: number;
}) {
  return (
    <StatusTile color={color} size={size}>
      <NavGlyph name={name} size={Math.round(size * 0.5)} />
    </StatusTile>
  );
}
