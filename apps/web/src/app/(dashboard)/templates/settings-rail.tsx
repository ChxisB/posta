"use client";

import type { ReactNode } from "react";
import { EditorFields } from "./editor-fields";

/**
 * The settings rail's contents, top to bottom: the fields (name, subject,
 * preview text), the theme slot (filled once a template has one), and the
 * preflight card. The fields keep their ids, which a preflight row focuses.
 */
export function SettingsRail({
  name,
  subject,
  previewText,
  onName,
  onSubject,
  onPreviewText,
  theme,
  checks,
}: {
  name: string;
  subject: string;
  previewText: string;
  onName: (name: string) => void;
  onSubject: (subject: string) => void;
  onPreviewText: (previewText: string) => void;
  theme?: ReactNode;
  checks: ReactNode;
}) {
  return (
    <div className="po-tpl-settings">
      <EditorFields
        stacked
        wide={false}
        name={name}
        subject={subject}
        previewText={previewText}
        onName={onName}
        onSubject={onSubject}
        onPreviewText={onPreviewText}
      />
      {theme ? <div className="po-tpl-settings-theme">{theme}</div> : null}
      <div className="po-tpl-settings-checks">{checks}</div>
    </div>
  );
}
