"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { MailyEditorChange } from "@/components/maily-editor";
import type { MergeFieldOption } from "@/lib/merge-fields";
import type { BodyEditorMode, BodyTab } from "@/lib/template-mode";
import { ContentPreview } from "../broadcasts/parts";
import { HtmlAuthoredBanner, HtmlCodeMode } from "./html-mode";
import { MailyEditor } from "./lazy-maily-editor";

/**
 * The body field: its label row with the Edit/Preview switch, then the block
 * editor or the html source (by mode), or the preview. `children` sits under
 * the body, inside the field (the draft banner).
 */
export function BodyPanel({
  wide,
  tab,
  onTab,
  mode,
  editorKey,
  document,
  html,
  hasText,
  converting,
  mergeFields,
  previewSamples,
  onBlocksChange,
  onCodeChange,
  onConvert,
  children,
}: {
  /** Html source beside its preview: the field takes the room. */
  wide: boolean;
  tab: BodyTab;
  onTab: (tab: BodyTab) => void;
  mode: BodyEditorMode;
  /** Remounts the block editor, which seeds once from its mount value. */
  editorKey: number;
  document: unknown;
  html: string;
  hasText: boolean;
  converting: boolean;
  mergeFields: MergeFieldOption[];
  previewSamples: Record<string, string>;
  onBlocksChange: (value: MailyEditorChange) => void;
  onCodeChange: (html: string) => void;
  onConvert: () => void;
  children?: ReactNode;
}) {
  const t = useTranslations("templates");
  return (
    <div className="po-field" style={{ maxWidth: wide ? 1200 : 720 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <label htmlFor="tpl-html" style={{ marginBottom: 0 }}>
          {t("editor.htmlLabel")}
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          {(["edit", "preview"] as const).map((key) => (
            <button
              key={key}
              type="button"
              style={{
                fontSize: 13,
                padding: "4px 10px",
                borderRadius: 8,
                border: 0,
                cursor: "pointer",
                background: tab === key ? "var(--po-panel-raised)" : "none",
                color: tab === key ? "var(--po-bone)" : "var(--po-muted)",
                font: "inherit",
              }}
              onClick={() => onTab(key)}
            >
              {t(key === "edit" ? "editor.editTab" : "editor.previewTab")}
            </button>
          ))}
        </div>
      </div>
      {tab === "edit" && mode === "blocks" ? (
        <MailyEditor
          key={editorKey}
          value={{ document, html }}
          convertHtml={converting}
          onChange={onBlocksChange}
          mergeFields={mergeFields}
        />
      ) : tab === "edit" ? (
        <HtmlCodeMode
          html={html}
          onChange={onCodeChange}
          mergeFields={mergeFields}
          previewSamples={previewSamples}
          hasText={hasText}
        />
      ) : (
        <>
          {mode === "code" ? (
            <HtmlAuthoredBanner onEditHtml={() => onTab("edit")} onConvert={onConvert} />
          ) : null}
          <div
            style={{
              border: "1px solid var(--po-line)",
              borderRadius: "var(--po-r-input)",
              overflow: "hidden",
            }}
          >
            {html ? (
              <ContentPreview html={html} title={t("editor.previewTab")} samples={previewSamples} />
            ) : (
              <p
                style={{
                  margin: 0,
                  padding: "16px 18px",
                  color: "var(--po-muted)",
                  fontSize: "var(--po-fs-ui)",
                }}
              >
                {t("editor.noHtml")}
              </p>
            )}
          </div>
        </>
      )}
      {children}
    </div>
  );
}
