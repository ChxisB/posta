"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { downloadTextFile } from "@/lib/download-text";

export type SourceKind = "html" | "text";

const MIME: Record<SourceKind, string> = {
  html: "text/html;charset=utf-8",
  text: "text/plain;charset=utf-8",
};

/**
 * The generated html or plain text of a block template, read-only: what the
 * last render produced, the same result the preview shows. A textarea, so the
 * reader can select inside it and scroll by keyboard; long html lines scroll
 * sideways rather than wrapping.
 */
export function SourceView({ kind, value }: { kind: SourceKind; value: string }) {
  const t = useTranslations("templates");
  if (value.trim() === "") {
    return (
      <p
        style={{
          margin: 0,
          padding: "16px 18px",
          color: "var(--po-muted)",
          fontSize: "var(--po-fs-ui)",
        }}
      >
        {t(kind === "html" ? "editor.noHtml" : "editor.noText")}
      </p>
    );
  }
  return (
    <>
      <textarea
        className="po-tpl-source"
        readOnly
        spellCheck={false}
        wrap={kind === "html" ? "off" : "soft"}
        aria-label={t(kind === "html" ? "editor.htmlSourceLabel" : "editor.textLabel")}
        value={value}
      />
      <p className="po-tpl-code-hint">
        {t(kind === "html" ? "editor.htmlSourceHint" : "editor.textSourceHint")}
      </p>
    </>
  );
}

type CopyState = "idle" | "copied" | "failed";

/**
 * Copy and Download for a source view. The clipboard can be missing or
 * refuse, so a failure says so beside the button rather than doing nothing.
 */
export function SourceActions({
  kind,
  value,
  fileName,
  disabled,
}: {
  kind: SourceKind;
  value: string;
  fileName: string;
  /** No source to hand over yet, or one still being rendered. */
  disabled: boolean;
}) {
  const t = useTranslations("templates");
  const [copy, setCopy] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function onCopy() {
    let next: CopyState = "copied";
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      next = "failed";
    }
    setCopy(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopy("idle"), next === "failed" ? 5000 : 2500);
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span
        role="status"
        className="po-tpl-source-note"
        data-failed={copy === "failed" ? "" : undefined}
      >
        {copy === "copied" ? t("editor.copied") : copy === "failed" ? t("editor.copyFailed") : ""}
      </span>
      <button
        type="button"
        className="po-btn po-btn-secondary po-btn-sm"
        disabled={disabled}
        onClick={() => void onCopy()}
      >
        {t("editor.copy")}
      </button>
      <button
        type="button"
        className="po-btn po-btn-secondary po-btn-sm"
        disabled={disabled}
        onClick={() => downloadTextFile(fileName, value, MIME[kind])}
      >
        {t("editor.download")}
      </button>
    </span>
  );
}
