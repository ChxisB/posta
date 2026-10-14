"use client";

import { useTranslations } from "next-intl";
import { Crumb, CrumbEnd, PageHeader } from "@/components/page-header";
import { BtnSpinner } from "@/components/spinner";
import { SAVED_FADE_ANIMATION } from "@/lib/saved-flash";

/**
 * The editor's page header: crumbs and title, the transient "✓ Saved", and
 * the two save buttons with their keycaps (useTemplateEditor binds the keys).
 */
export function EditorHeader({
  editing,
  justSaved,
  complete,
  saving,
  onSave,
}: {
  /** An existing template, as opposed to a new one. */
  editing: boolean;
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
          {justSaved ? (
            <span
              role="status"
              style={{
                color: "var(--po-success)",
                fontSize: "var(--po-fs-label)",
                // Fade-out is the shared fade-in played backwards, timed so
                // it finishes just before the unmount timeout fires.
                animation: SAVED_FADE_ANIMATION,
              }}
            >
              ✓ {t("editor.saved")}
            </span>
          ) : null}
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
