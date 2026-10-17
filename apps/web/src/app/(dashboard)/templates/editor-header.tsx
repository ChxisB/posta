"use client";

import { useTranslations } from "next-intl";
import { Crumb, CrumbEnd, PageHeader } from "@/components/page-header";
import { BtnSpinner } from "@/components/spinner";
import type { SaveState } from "@/lib/save-state";
import { SaveStatus } from "./save-status";

/** Where the template stands as the server has it (templates.state), for an existing template. */
export interface PublishView {
  status: "draft" | "published";
  version: number | null;
  hasUnpublishedChanges: boolean;
}

/**
 * The publish chip: never published, published as a version, or published with
 * a draft that has moved on. `unsaved` counts edits not yet saved as moving on.
 */
function PublishChip({ view, unsaved }: { view: PublishView; unsaved: boolean }) {
  const t = useTranslations("templates.publish");
  const label =
    view.version === null
      ? t("chipDraft")
      : view.hasUnpublishedChanges || unsaved
        ? t("chipChanges", { version: view.version })
        : t("chipPublished", { version: view.version });
  return <span className="po-chip">{label}</span>;
}

/**
 * The editor's page header: crumbs and title, the save state, and the two
 * save buttons with their keycaps (useTemplateEditor binds the keys). An
 * existing template also shows where it stands and takes Publish and Versions.
 */
export function EditorHeader({
  editing,
  saveState,
  justSaved,
  complete,
  saving,
  onSave,
  published,
  unsaved,
  canPublish,
  publishing,
  onPublish,
  onVersions,
}: {
  /** An existing template, as opposed to a new one. */
  editing: boolean;
  saveState: SaveState;
  justSaved: boolean;
  complete: boolean;
  saving: boolean;
  onSave: (close: boolean) => Promise<void>;
  /** The server's publish state; undefined for a new template and while it loads. */
  published: PublishView | undefined;
  /** The editor holds edits that are not saved yet. */
  unsaved: boolean;
  canPublish: boolean;
  publishing: boolean;
  onPublish: () => Promise<void>;
  onVersions: () => void;
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
          {published ? <PublishChip view={published} unsaved={unsaved} /> : null}
          <SaveStatus state={saveState} fresh={justSaved} onRetry={() => void onSave(false)} />
          {editing ? (
            <button type="button" className="po-btn po-btn-ghost" onClick={onVersions}>
              {t("versions.open")}
            </button>
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
          {editing ? (
            <button
              type="button"
              className="po-btn po-btn-secondary"
              disabled={!canPublish}
              onClick={() => void onPublish()}
            >
              <BtnSpinner on={publishing} />
              {t("publish.button")}
            </button>
          ) : null}
        </>
      }
    />
  );
}
