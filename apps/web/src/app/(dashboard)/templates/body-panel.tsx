"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import type { MailyEditorChange } from "@/components/maily-editor";
import type { TiptapEditor } from "@/components/maily-editor/commands";
import { Segmented } from "@/components/segmented";
import { PREVIEW_DEVICES, type PreviewDevice } from "@/lib/email-preview";
import type { MergeFieldOption } from "@/lib/merge-fields";
import type { BodyEditorMode, BodyTab } from "@/lib/template-mode";
import { bodyTabs, sourceFileName } from "@/lib/template-view";
import { ContentPreview } from "../broadcasts/parts";
import { HtmlAuthoredBanner, HtmlCodeMode } from "./html-mode";
import { MailyEditor } from "./lazy-maily-editor";
import { SourceActions, SourceView } from "./source-view";

/**
 * The body field: its label row with the view switch (Edit, Preview, and for
 * block templates HTML and Text) and the controls of the view showing, then
 * that view: the block editor or the html source (by mode), the preview, or
 * the generated source. `children` sits under the body, inside the field (the
 * draft banner).
 */
export function BodyPanel({
  wide,
  tab,
  onTab,
  mode,
  editorKey,
  document,
  html,
  text,
  name,
  rendering,
  converting,
  mergeFields,
  previewSamples,
  inbox,
  onBlocksChange,
  onCodeChange,
  onConvert,
  onEditor,
  strip,
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
  /** The plain text the last render produced. */
  text: string;
  /** Template name: a download's file name when the subject has no slug. */
  name: string;
  /** A render of the blocks is pending, so `html` and `text` are about to change. */
  rendering: boolean;
  converting: boolean;
  mergeFields: MergeFieldOption[];
  previewSamples: Record<string, string>;
  /** The inbox line over the preview: what a recipient sees before opening. */
  inbox: { subject: string; previewText: string };
  onBlocksChange: (value: MailyEditorChange) => void;
  onCodeChange: (html: string) => void;
  onConvert: () => void;
  /** Hands over the block editor once it is ready, and null when it goes. */
  onEditor?: ((editor: TiptapEditor | null) => void) | undefined;
  /** The preflight strip: under the label row, over the body. */
  strip?: ReactNode;
  children?: ReactNode;
}) {
  const t = useTranslations("templates");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const views = bodyTabs(mode);
  const source = tab === "html" || tab === "text" ? tab : null;
  const sourceValue = tab === "html" ? html : text;
  const tabLabel: Record<BodyTab, string> = {
    edit: t("editor.editTab"),
    preview: t("editor.previewTab"),
    html: t("editor.htmlTab"),
    text: t("editor.textTab"),
  };
  return (
    <div className="po-field" style={{ maxWidth: wide ? 1200 : 720 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "6px 12px",
          marginBottom: 6,
        }}
      >
        {/* Only the source editor of an html-authored row is a field to point at. */}
        <label
          id="tpl-body-label"
          htmlFor={mode === "code" && tab === "edit" ? "tpl-html" : undefined}
          style={{ marginBottom: 0 }}
        >
          {t("editor.htmlLabel")}
        </label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            flexWrap: "wrap",
            gap: "6px 10px",
          }}
        >
          {mode === "blocks" && tab === "preview" && html ? (
            <Segmented
              className="po-tpl-device"
              label={t("editor.deviceLabel")}
              options={PREVIEW_DEVICES.map((value) => ({
                value,
                label: t(value === "desktop" ? "editor.deviceDesktop" : "editor.deviceMobile"),
              }))}
              value={device}
              onChange={setDevice}
            />
          ) : null}
          {source ? (
            <SourceActions
              kind={source}
              value={sourceValue}
              fileName={sourceFileName(inbox.subject, name, source)}
              disabled={rendering || sourceValue.trim() === ""}
            />
          ) : null}
          <Segmented
            label={t("editor.viewLabel")}
            options={views.map((value) => ({ value, label: tabLabel[value] }))}
            value={tab}
            onChange={onTab}
          />
        </div>
      </div>
      {strip}
      <section aria-labelledby="tpl-body-label">
        {tab === "edit" && mode === "blocks" ? (
          <MailyEditor
            key={editorKey}
            value={{ document, html }}
            convertHtml={converting}
            onChange={onBlocksChange}
            mergeFields={mergeFields}
            onEditor={onEditor}
          />
        ) : tab === "edit" ? (
          <HtmlCodeMode
            html={html}
            onChange={onCodeChange}
            mergeFields={mergeFields}
            previewSamples={previewSamples}
            hasText={text !== ""}
          />
        ) : source ? (
          <SourceView kind={source} value={sourceValue} />
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
                <ContentPreview
                  html={html}
                  title={t("editor.previewTab")}
                  samples={previewSamples}
                  inbox={inbox}
                  device={mode === "blocks" ? device : "desktop"}
                />
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
      </section>
      {children}
    </div>
  );
}
