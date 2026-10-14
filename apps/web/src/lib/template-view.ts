import type { BodyEditorMode, BodyTab } from "./template-mode";

/**
 * The views a body offers. A block template has all four; an html-authored one
 * keeps its own pair, because its source is the editor and its preview is the
 * faithful render, so generated HTML and text would only repeat them.
 */
export function bodyTabs(mode: BodyEditorMode): readonly BodyTab[] {
  return mode === "blocks" ? ["edit", "preview", "html", "text"] : ["edit", "preview"];
}

const SLUG_MAX = 60;

// A merge tag ({{{name}}}, or the older {{name}}) is a recipient's value at send
// time, not a word of the file name.
const MERGE_TAG = /\{\{\{?[^{}]*\}\}\}?/g;

function slugOf(value: string): string {
  return (
    value
      .replace(MERGE_TAG, " ")
      // Split accents off their letters so "Café" reads "cafe", not "caf".
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, SLUG_MAX)
      // The cut can land on a separator.
      .replace(/-+$/, "")
  );
}

/**
 * The stem of a downloaded file: the subject as an ASCII slug, else the
 * template's name, else "template". Subjects in a script with no Latin
 * letters fall through to the name rather than becoming an empty file name.
 */
export function fileSlug(subject: string, name: string): string {
  return slugOf(subject) || slugOf(name) || "template";
}

/** A downloaded view's file name: `<slug>.html` or `<slug>.txt`. */
export function sourceFileName(subject: string, name: string, kind: "html" | "text"): string {
  return `${fileSlug(subject, name)}.${kind === "html" ? "html" : "txt"}`;
}
