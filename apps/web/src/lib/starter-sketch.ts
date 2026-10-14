/**
 * A starter's card shows a sketch of its email, not the email: each block of the
 * document becomes a bar, a few lines, a pill or a rule, in the order it comes.
 * At a card's size real text is unreadable anyway, and a sketch follows the
 * theme, costs no render and shows the shape of the email at a glance.
 *
 * Pure, so the shape can be tested: this reads the document and draws nothing.
 */

export type SketchRow =
  | { kind: "heading"; level: 1 | 2 | 3 }
  | { kind: "text"; lines: number }
  | { kind: "list"; items: number }
  | { kind: "quote" }
  | { kind: "button" }
  | { kind: "divider" };

/** About how many characters fit on a line of the sketch before it wraps. */
const LINE = 42;
/** A merge field stands for a first name or an address: about this many characters. */
const FIELD = 8;
/** The most lines a paragraph is drawn with, so one long one does not fill a card. */
const MAX_LINES = 3;

type Json = Record<string, unknown>;

function textLength(node: unknown): number {
  if (typeof node !== "object" || node === null) return 0;
  const { type, text, content } = node as Json;
  if (type === "text") return typeof text === "string" ? text.length : 0;
  if (type === "variable") return FIELD;
  return Array.isArray(content) ? content.reduce((sum: number, c) => sum + textLength(c), 0) : 0;
}

function rowOf(node: Json): SketchRow | null {
  const attrs = (typeof node.attrs === "object" && node.attrs !== null ? node.attrs : {}) as Json;
  switch (node.type) {
    case "heading": {
      const level = Number(attrs.level);
      return { kind: "heading", level: level === 2 ? 2 : level === 3 ? 3 : 1 };
    }
    case "paragraph":
      return {
        kind: "text",
        lines: Math.min(MAX_LINES, Math.max(1, Math.ceil(textLength(node) / LINE))),
      };
    case "bulletList":
    case "orderedList":
      return {
        kind: "list",
        items: Array.isArray(node.content) ? Math.min(MAX_LINES, node.content.length) : 1,
      };
    case "blockquote":
      return { kind: "quote" };
    case "button":
      return { kind: "button" };
    case "horizontalRule":
      return { kind: "divider" };
    default:
      return null;
  }
}

/**
 * The sketch of a document: one row per top-level block, up to `max` rows (a
 * card shows the top of the email), and nothing for what a sketch has no row for.
 */
export function sketchOf(document: unknown, max = 8): SketchRow[] {
  const content = (document as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return [];
  const rows: SketchRow[] = [];
  for (const node of content) {
    if (rows.length >= max) break;
    if (typeof node !== "object" || node === null) continue;
    const row = rowOf(node as Json);
    if (row) rows.push(row);
  }
  return rows;
}
