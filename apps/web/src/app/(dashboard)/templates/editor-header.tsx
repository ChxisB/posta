"use client";

import { useTranslations } from "next-intl";
import { Crumb, CrumbEnd, PageHeader } from "@/components/page-header";
import { BtnSpinner } from "@/components/spinner";
import type { SaveState } from "@/lib/save-state";
import { SaveStatus } from "./save-status";

/**
 * The editor's page header: crumbs and title, the save state, and the two
 * save buttons with their keycaps (useTemplateEditor binds the keys).
 */
export function EditorHeader({
  editing,
  saveState,
  justSaved,
  complete,
  saving,
  onSave,
}: {
  /** An existing template, as opposed to a new one. */
  editing: boolean;
  saveState: SaveState;
  justSaved: boolean;
  complete: boolean;
  saving: boolean;
  onSave: (close: boolean) => Promise<void>;
}) {
  const t = useTranslations("templates");
  return (
    <PageHeader
      breadcrumb={
        <>
          <Crumb href="/templates" label={t("editor.back")} />
          <CrumbEnd label={editing ? t("editor.editTitle") : t("editor.newTitle")} />
        </>
      }
      title={editing ? t("editor.editTitle") : t("editor.newTitle")}
      actions={
        <>
          <SaveStatus state={saveState} fresh={justSaved} onRetry={() => void onSave(false)} />
          <button
            type="button"
            className="po-btn po-btn-secondary"
            disabled={!complete || saving}
            onClick={() => void onSave(false)}
          >
            <BtnSpinner on={saving} />
            {t("editor.save")} <span className="po-keycap">⌘S</span>
          </button>
          <button
            type="button"
            className="po-btn po-btn-primary"
            disabled={!complete || saving}
            onClick={() => void onSave(true)}
          >
            {t("editor.saveAndClose")} <span className="po-keycap">⌘↵</span>
          </button>
        </>
      }
    />
  );
}
