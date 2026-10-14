"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { DraftBanner } from "@/components/draft-banner";
import {
  ShortcutsButton,
  ShortcutsDialog,
  useShortcutsCheatsheet,
} from "@/components/maily-editor/cheatsheet";
import { ComponentsRail } from "@/components/maily-editor/components-rail";
import { Skeleton } from "@/components/skeleton";
import type { PreflightAt } from "@/lib/preflight";
import { BodyPanel } from "./body-panel";
import { TemplateConvertDialog } from "./convert-dialog";
import { EditorFields } from "./editor-fields";
import { EditorHeader } from "./editor-header";
import { PREFLIGHT_LIST_ID, PreflightStrip } from "./preflight-strip";
import { RailsLayout, railOpenerId } from "./rails-layout";
import { SettingsRail } from "./settings-rail";
import { type EditorInitial, useTemplateEditor } from "./use-template-editor";
import { useRailTier, useTemplateRails } from "./use-template-rails";

export type { EditorInitial } from "./use-template-editor";

/** The fields' ghosts: the third is the preview text, with its hint line. */
function FieldGhosts({ stacked }: { stacked: boolean }) {
  return (
    <div className="po-tpl-meta" data-stacked={stacked || undefined}>
      {[0, 1, 2].map((row) => (
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
  );
}

/** A docked rail's ghost: the same box the rail will fill, so nothing shifts. */
function RailGhost({ side, children }: { side: "left" | "right"; children: ReactNode }) {
  return (
    <div className="po-tpl-rail" data-side={side} data-mode="docked">
      <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 12 }}>
        <Skeleton width={70} height={11} />
        {children}
      </div>
    </div>
  );
}

/**
 * Ghost of the editor while an existing template loads: the same zones the
 * layout's width gives a block template (the rail it will dock, a toolbar for
 * the ones that will be drawers), so the page does not jump when it arrives.
 * An html-authored template has no rails and does jump; the skeleton cannot
 * tell the two apart before the row is loaded.
 */
export function EditorSkeleton() {
  const { ref, tier } = useRailTier();
  // The rails that will be drawers, each a button in the toolbar over the email.
  const drawers = (["left", "right"] as const).slice(
    0,
    tier === "wide" ? 0 : tier === "medium" ? 1 : 2,
  );
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
      <div ref={ref} className="po-tpl-layout" data-tier={tier}>
        <div className="po-tpl-grid">
          {tier === "wide" ? (
            <RailGhost side="left">
              <Skeleton width="100%" height={32} radius="var(--po-r-input)" />
              <Skeleton width="100%" height={220} radius="var(--po-r-input)" />
            </RailGhost>
          ) : null}
          <div className="po-tpl-canvas">
            {drawers.length > 0 ? (
              <div className="po-tpl-bar">
                {drawers.map((side) => (
                  <Skeleton key={side} width={72} height={28} radius="var(--po-r-input)" />
                ))}
              </div>
            ) : null}
            <Skeleton width={90} height={11} />
            <Skeleton width="100%" height={260} radius="var(--po-r-input)" />
          </div>
          {tier !== "narrow" ? (
            <RailGhost side="right">
              <FieldGhosts stacked />
            </RailGhost>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** A template's editor page: the model hook's state, composed into its views. */
export function TemplateEditor({ initial }: { initial?: EditorInitial }) {
  const m = useTemplateEditor(initial);
  const rails = useTemplateRails();
  const tb = useTranslations("block-editor");
  const tr = useTranslations("templates.rails");
  const blocks = m.mode === "blocks";
  const sheet = useShortcutsCheatsheet(blocks);
  // Where the checks and fields are: in the docked settings rail, or out of
  // sight in a drawer or folded away. Then the checks also show over the body.
  const settingsDocked = rails.modeOf("right") === "docked" && !rails.state.collapsed.right;

  /** Take the person to what an issue is about, opening what hides it first. */
  function revealAt(at: PreflightAt) {
    if (!blocks) {
      m.reveal(at);
      return;
    }
    if (at.scope === "node") {
      // The email is what they are going to; a drawer would only cover it.
      if (rails.drawer) rails.close({ focus: false });
    } else if ((at.scope === "subject" || at.scope === "previewText") && !rails.shown("right")) {
      rails.show("right");
      // Once the rail has rendered reachable (it was inert), not before.
      window.setTimeout(() => m.reveal(at), 0);
      return;
    }
    m.reveal(at);
  }

  /** From the rail's link. A drawer is a dialog with its own Esc and Tab, so it steps aside first. */
  function openShortcuts() {
    const drawer = rails.drawer;
    const opener = drawer ? document.getElementById(railOpenerId(drawer)) : undefined;
    if (drawer) rails.close({ focus: false });
    sheet.show(opener);
  }

  const strip = (listId?: string) => (
    <PreflightStrip
      issues={m.issues}
      checking={m.checking}
      htmlSource={m.mode === "code"}
      onReveal={revealAt}
      {...(listId ? { listId } : {})}
    />
  );

  const body = (
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
        blocks && settingsDocked
          ? undefined
          : strip(blocks ? `${PREFLIGHT_LIST_ID}-top` : undefined)
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
  );

  const error = m.errorText ? (
    <p className="po-field-error" style={{ margin: 0 }}>
      {m.errorText}
    </p>
  ) : null;

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

      {blocks ? (
        <RailsLayout
          rails={rails}
          titles={{ left: tb("rail.label"), right: tr("settings") }}
          left={
            <ComponentsRail
              editor={m.tab === "edit" ? m.blockEditor : null}
              // A drawer gets out of the way once a block is in, with the cursor in it.
              onInserted={() => {
                if (rails.drawer === "left") rails.close({ focus: false });
              }}
            />
          }
          right={
            <SettingsRail
              name={m.name}
              subject={m.subject}
              previewText={m.previewText}
              onName={m.setName}
              onSubject={m.setSubject}
              onPreviewText={m.setPreviewText}
              checks={strip()}
              footer={<ShortcutsButton onClick={openShortcuts} />}
            />
          }
        >
          {body}
          {error}
        </RailsLayout>
      ) : (
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
          {body}
          {error}
        </div>
      )}

      {blocks ? <ShortcutsDialog open={sheet.open} onClose={sheet.close} /> : null}

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
