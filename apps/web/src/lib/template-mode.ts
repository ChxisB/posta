import { isMailyDoc } from "./email-doc";

/**
 * Which editor a body opens in. A row whose `document` is renderable Maily
 * JSON was authored in the block editor and keeps editing there; a body with
 * html and no such document was authored outside it — API, MCP, migration,
 * an html template applied to a broadcast — which Tiptap's parse would
 * flatten, so it edits as source until the user explicitly converts. An
 * empty body starts in the block editor.
 */
export type BodyEditorMode = "blocks" | "code";

export function bodyEditorMode(opts: {
  document: unknown;
  html: string;
  converting?: boolean;
}): BodyEditorMode {
  return opts.converting || isMailyDoc(opts.document) || opts.html.trim() === ""
    ? "blocks"
    : "code";
}

/**
 * A body's views: the editor for its mode, the rendered preview, and for
 * block templates the generated html and plain text (see bodyTabs).
 */
export type BodyTab = "edit" | "preview" | "html" | "text";

/**
 * The tab a body opens on, from the row as loaded. An html-authored row opens
 * on its faithful preview, not on an editor; a block row or a new template
 * opens on the editor.
 */
export function firstBodyTab(initial?: { document: unknown; html: string }): BodyTab {
  const mode = bodyEditorMode({ document: initial?.document ?? null, html: initial?.html ?? "" });
  return mode === "code" ? "preview" : "edit";
}

export interface TemplateSaveInput {
  name: string;
  subject: string;
  previewText: string;
  html: string;
  text: string;
  document: unknown;
}

/**
 * The fields a template save persists. Code mode always writes `document:
 * null` so the row stays html-authored — the client-side state may still hold
 * a legacy non-Maily document the server would reject.
 */
export function templateSaveInput(
  mode: BodyEditorMode,
  fields: TemplateSaveInput,
): TemplateSaveInput {
  return {
    name: fields.name.trim(),
    subject: fields.subject.trim(),
    previewText: fields.previewText.trim(),
    html: fields.html,
    text: fields.text,
    document: mode === "code" ? null : fields.document,
  };
}

/** Name of the block-converted copy of an html-authored template. */
export function blocksCopyName(name: string): string {
  return `${name.trim()} (blocks)`;
}
