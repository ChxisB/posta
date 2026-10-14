"use client";

import { useTranslations } from "next-intl";
import { PREVIEW_TEXT_FIELD_ID, SUBJECT_FIELD_ID } from "./field-ids";
import { PreviewTextField } from "./preview-text-field";

/** Name and subject as one row above the body, then the preview text under them. */
export function EditorFields({
  wide,
  name,
  subject,
  previewText,
  onName,
  onSubject,
  onPreviewText,
}: {
  /** Follows the body's width: wide while the html source sits beside its preview. */
  wide: boolean;
  name: string;
  subject: string;
  previewText: string;
  onName: (name: string) => void;
  onSubject: (subject: string) => void;
  onPreviewText: (previewText: string) => void;
}) {
  const t = useTranslations("templates");
  // Source beside preview needs the room; every other body stays at reading width.
  return (
    <div className="po-tpl-meta" style={{ maxWidth: wide ? 1200 : 720 }}>
      <div className="po-field">
        <label htmlFor="tpl-name">{t("editor.nameLabel")}</label>
        <input
          id="tpl-name"
          className="po-input"
          style={{ width: "100%" }}
          placeholder={t("editor.nameHint")}
          value={name}
          onChange={(event) => onName(event.target.value)}
        />
      </div>
      <div className="po-field">
        <label htmlFor={SUBJECT_FIELD_ID}>
          {t("editor.subjectLabel")}{" "}
          <span style={{ color: "var(--po-faint)", textTransform: "none" }}>
            — {t("editor.optional")}
          </span>
        </label>
        <input
          id={SUBJECT_FIELD_ID}
          className="po-input"
          style={{ width: "100%" }}
          value={subject}
          onChange={(event) => onSubject(event.target.value)}
        />
      </div>
      <PreviewTextField id={PREVIEW_TEXT_FIELD_ID} value={previewText} onChange={onPreviewText} />
    </div>
  );
}
