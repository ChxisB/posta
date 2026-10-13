/**
 * Loading placeholders (.po-skeleton). Rule: no spinners or blank panels
 * before tables/cards — each surface renders a skeleton mirroring its real
 * layout, composed from these blocks. Skeletons must be dimensionally
 * identical to the loaded layout: reuse the real container/typography
 * wrappers and size the bars to the text they replace (height "1lh" inside a
 * flex wrapper matches a single text line exactly).
 */
export function Skeleton({
  width,
  height = 12,
  radius = "var(--po-r-chip)",
}: {
  width: number | string;
  height?: number | string;
  radius?: number | string;
}) {
  return (
    <span
      aria-hidden="true"
      className="po-skeleton"
      style={{ width, height, borderRadius: radius }}
    />
  );
}

/**
 * Ghost .po-chip (CopyChip cells): the real chip class plus an nbsp strut, so
 * the browser computes the exact box and baseline of a loaded chip — no
 * guessed pixel height to drift from the chip's font/padding/border math.
 * .po-skeleton's inline-block wins over .po-chip's inline-flex; with text-only
 * content both boxes measure the same. vertical-align is forced back to
 * baseline because real chips sit on the baseline, not .po-skeleton's middle.
 */
export function SkeletonChip({ width }: { width: number | string }) {
  return (
    <span
      aria-hidden="true"
      className="po-chip po-skeleton"
      style={{ width, boxSizing: "border-box", verticalAlign: "baseline" }}
    >
      {"\u00A0"}
    </span>
  );
}

/**
 * Ghost .po-badge (status cells) — same construction as SkeletonChip.
 * borderColor: .po-badge leaves border color to the variant classes, which a
 * ghost has none of; transparent keeps the 1px of geometry without a stroke.
 */
export function SkeletonBadge({ width = 64 }: { width?: number | string }) {
  return (
    <span
      aria-hidden="true"
      className="po-badge po-skeleton"
      style={{
        width,
        boxSizing: "border-box",
        verticalAlign: "baseline",
        borderColor: "transparent",
      }}
    >
      {"\u00A0"}
    </span>
  );
}
