"use client";

import { useTranslations } from "next-intl";
import { regionFlag, regionName } from "./regions";

/**
 * "🇧🇷 São Paulo (sa-east-1)" — flag + localized city + region code.
 * `list` renders the code faint in parens; `meta` renders it mono muted.
 */
export function RegionLabel({
  region,
  variant = "list",
}: {
  region: string;
  variant?: "list" | "meta";
}) {
  const t = useTranslations("domains");
  return (
    <>
      {regionFlag(region)} {regionName(region, t)}{" "}
      {variant === "list" ? (
        <span style={{ color: "var(--po-faint)" }}>({region})</span>
      ) : (
        <span className="po-mono" style={{ fontSize: 12, color: "var(--po-muted)" }}>
          {region}
        </span>
      )}
    </>
  );
}
