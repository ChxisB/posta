"use client";

import { useTranslations } from "next-intl";
import type { MailyEditorChange } from "@/components/maily-editor";
import type { MergeFieldOption } from "@/lib/merge-fields";
import { ConvertBlocksDialog } from "./html-mode";
import { MailyEditor } from "./lazy-maily-editor";

/**
 * A template's html→blocks conversion: the guarded dialog (duplicating is the
 * primary path), plus the hidden block editor the duplicate path mounts on
 * `probeHtml` to run Tiptap's parse, so the original's page never shows a
 * converted body.
 */
export function TemplateConvertDialog({
  open,
  busy,
  onClose,
  onDuplicate,
  onConvertInPlace,
  probeHtml,
  mergeFields,
  onProbeChange,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onDuplicate: () => void;
  onConvertInPlace: () => void;
  /** The html being parsed for the copy; null while no copy is under way. */
  probeHtml: string | null;
  mergeFields: MergeFieldOption[];
  onProbeChange: (value: MailyEditorChange) => void;
}) {
  const t = useTranslations("templates");
  return (
    <>
      <ConvertBlocksDialog
        open={open}
        busy={busy}
        onClose={onClose}
        onDuplicate={onDuplicate}
        onConvertInPlace={onConvertInPlace}
        inPlaceLabel={t("html.convertInPlace")}
      />
      {probeHtml !== null ? (
        <div hidden>
          <MailyEditor
            value={{ document: null, html: probeHtml }}
            convertHtml
            mergeFields={mergeFields}
            onChange={onProbeChange}
          />
        </div>
      ) : null}
    </>
  );
}
