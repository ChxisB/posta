import { useTranslations } from "next-intl";

// Variant per status: sent is accepted for delivery, not an outcome, so it
// stays neutral like the envelope tile until delivery reports back; complained
// warns, delayed stays neutral, and suppressed is a danger: future sends are
// blocked.
const VARIANTS = {
  delivered: "success",
  verified: "success",
  sent: "neutral",
  opened: "info",
  clicked: "info",
  queued: "neutral",
  queued_quota: "neutral",
  pending: "neutral",
  delivery_delayed: "neutral",
  suppressed: "danger",
  bounced: "danger",
  complained: "warn",
  failed: "danger",
  canceled: "neutral",
} as const;

export type BadgeStatus = keyof typeof VARIANTS;
export type BadgeTone = (typeof VARIANTS)[BadgeStatus];

// Dot hues live in tokens/colors.css (--po-dot-*); statuses without an email
// dot token borrow the family they read as: verified is a delivered-green,
// pending an in-flight gray.
const DOT_COLORS: Record<BadgeStatus, string> = {
  delivered: "var(--po-dot-delivered)",
  verified: "var(--po-dot-delivered)",
  sent: "var(--po-dot-sent)",
  opened: "var(--po-dot-opened)",
  clicked: "var(--po-dot-clicked)",
  queued: "var(--po-dot-queued)",
  queued_quota: "var(--po-dot-queued-quota)",
  pending: "var(--po-dot-queued)",
  delivery_delayed: "var(--po-dot-delivery-delayed)",
  suppressed: "var(--po-dot-suppressed)",
  bounced: "var(--po-dot-bounced)",
  complained: "var(--po-dot-complained)",
  failed: "var(--po-dot-failed)",
  // Terminal but benign: borrows the queued gray rather than a danger hue.
  canceled: "var(--po-dot-queued)",
};

/** 8px status dot, by email status or any CSS color; with neither it renders
 * the ring that marks an unfiltered "all" option. */
export function StatusDot({ status, color }: { status?: BadgeStatus; color?: string }) {
  const fill = status ? DOT_COLORS[status] : color;
  return fill ? (
    <span className="po-dot" style={{ background: fill }} aria-hidden="true" />
  ) : (
    <span className="po-dot ring" aria-hidden="true" />
  );
}

/** Labels come from common.status.*: semantic colors always carry text. */
export function StatusBadge({
  status,
  label,
}: {
  status: BadgeStatus;
  label?: string | undefined;
}) {
  const t = useTranslations("common");
  return (
    <span className={`po-badge po-badge-${VARIANTS[status]}`}>
      {label ?? t(`status.${status}`)}
    </span>
  );
}
