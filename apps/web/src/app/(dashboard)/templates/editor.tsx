"use client";

import { DraftBanner } from "@/components/draft-banner";
import { Skeleton } from "@/components/skeleton";
import { BodyPanel } from "./body-panel";
import { TemplateConvertDialog } from "./convert-dialog";
import { EditorFields } from "./editor-fields";
import { EditorHeader } from "./editor-header";
import { PreflightStrip } from "./preflight-strip";
import { type EditorInitial, useTemplateEditor } from "./use-template-editor";

export type { EditorInitial } from "./use-template-editor";

/** Ghost of the editor while an existing template loads — same field boxes, no shift. */
export function EditorSkeleton() {
  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", fontSize: 13, lineHeight: 1, marginBottom: 10 }}>
          <Skeleton width={150} height="1lh" />
        </div>
        <h1
          className="po-display"
          style={{ fontSize: "var(--po-fs-h1)", fontWeight: 600, margin: 0, display: "flex" }}
        >
          <Skeleton width={220} height="1lh" />
        </h1>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 720 }}>
        <div className="po-tpl-meta">
          {[0, 1, 2].map((row) => (
            // The third is the preview text: full width, with its hint line.
            <div key={row} style={row === 2 ? { gridColumn: "1 / -1" } : undefined}>
              <Skeleton width={90} height={11} />
              <div style={{ marginTop: 8, display: "flex" }}>
                <Skeleton width="100%" height={38} radius="var(--po-r-input)" />
              </div>
              {row === 2 ? (
                <div style={{ marginTop: 6, display: "flex" }}>
                  <Skeleton width={260} height={11} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <Skeleton width="100%" height={260} radius="var(--po-r-input)" />
      </div>
    </>
  );
}

/** A template's editor page: the model hook's state, composed into its views. */
export function TemplateEditor({ initial }: { initial?: EditorInitial }) {
  const m = useTemplateEditor(initial);
  return (
    <>
      <EditorHeader
        editing={m.editing}
        saveState={m.saveState}
        justSaved={m.justSaved}
        complete={m.complete}
        saving={m.saving}
        onSave={m.save}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <EditorFields
          wide={m.wideBody}
          name={m.name}
          subject={m.subject}
          previewText={m.previewText}
          onName={m.setName}
          onSubject={m.setSubject}
          onPreviewText={m.setPreviewText}
        />

        <BodyPanel
          wide={m.wideBody}
          tab={m.tab}
          onTab={m.setTab}
          mode={m.mode}
          editorKey={m.editorNonce}
          document={m.document}
          html={m.html}
          text={m.text}
          name={m.name}
          rendering={m.rendering}
          converting={m.converting}
          mergeFields={m.mergeFields}
          previewSamples={m.previewSamples}
          inbox={{ subject: m.subject, previewText: m.previewText }}
          onBlocksChange={m.changeBlocks}
          onCodeChange={m.changeCode}
          onConvert={m.openConvert}
          onEditor={m.onEditor}
          strip={
            <PreflightStrip
              issues={m.issues}
              checking={m.checking}
              htmlSource={m.mode === "code"}
              onReveal={m.reveal}
            />
          }
        >
          {m.recovered ? (
            <DraftBanner
              savedAt={m.recovered.savedAt}
              onRestore={m.restoreRecovered}
              onDiscard={m.discardRecovered}
            />
          ) : null}
        </BodyPanel>

        {m.errorText ? (
          <p className="po-field-error" style={{ margin: 0 }}>
            {m.errorText}
          </p>
        ) : null}
      </div>

      <TemplateConvertDialog
        open={m.convertOpen}
        busy={m.copying}
        onClose={m.closeConvert}
        onDuplicate={m.duplicateAndConvert}
        onConvertInPlace={m.convertInPlace}
        probeHtml={m.probeHtml}
        mergeFields={m.mergeFields}
        onProbeChange={m.changeProbe}
      />
    </>
  );
}
