"use client";

import { useTranslations } from "next-intl";
import { PREVIEW_TEXT_MAX, PREVIEW_TEXT_SHOWN, previewTextHint } from "@/lib/preview-text";

/**
 * The inbox preview text, shared by the template editor and the broadcast
 * composer: optional, with a count and a hint on how much inboxes show,
 * never a limit below the stored one. Spans the meta grid's full width.
 */
export function PreviewTextField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("templates");
  const { length, hint } = previewTextHint(value);
  return (
    <div className="po-field" style={{ gridColumn: "1 / -1" }}>
      <label htmlFor={id}>
        {t("previewText.label")}{" "}
        <span style={{ color: "var(--po-faint)", textTransform: "none" }}>
          ({t("editor.optional")})
        </span>
      </label>
      <input
        id={id}
        className="po-input"
        style={{ width: "100%" }}
        maxLength={PREVIEW_TEXT_MAX}
        aria-describedby={`${id}-hint`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p
        id={`${id}-hint`}
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          margin: "6px 0 0",
          color: "var(--po-muted)",
          fontSize: "var(--po-fs-label)",
        }}
      >
        <span>
          {hint === "empty"
            ? t("previewText.hintEmpty")
            : hint === "long"
              ? t("previewText.hintLong", { max: PREVIEW_TEXT_SHOWN })
              : t("previewText.hintFits")}
        </span>
        {length > 0 ? (
          <span
            style={{
              flexShrink: 0,
              fontVariantNumeric: "tabular-nums",
              color: hint === "long" ? "var(--po-warn)" : "var(--po-faint)",
            }}
          >
            {t("previewText.count", { count: length })}
          </span>
        ) : null}
      </p>
    </div>
  );
}
