import type { EditorProps } from "@maily-to/core";

/** The Tiptap editor instance Maily hands back from onCreate/onUpdate. */
export type TiptapEditor = Parameters<NonNullable<EditorProps["onCreate"]>>[0];

/**
 * A minimal, honest facade over Tiptap's command chain. Maily bundles the
 * text-align/list extensions, so these commands exist at runtime, but their
 * `declare module` augmentations aren't all in our type graph — typing exactly
 * what we call keeps the toolbar type-safe without pulling in mismatched
 * @tiptap/extension-* dev deps.
 */
export interface EditorChain {
  focus(): EditorChain;
  toggleBold(): EditorChain;
  toggleItalic(): EditorChain;
  toggleUnderline(): EditorChain;
  toggleStrike(): EditorChain;
  toggleHeading(attrs: { level: number }): EditorChain;
  toggleBulletList(): EditorChain;
  toggleOrderedList(): EditorChain;
  setTextAlign(align: string): EditorChain;
  unsetAllMarks(): EditorChain;
  clearNodes(): EditorChain;
  extendMarkRange(name: string): EditorChain;
  setLink(attrs: { href: string }): EditorChain;
  unsetLink(): EditorChain;
  insertContent(content: unknown): EditorChain;
  setTextSelection(position: number | { from: number; to: number }): EditorChain;
  setNodeSelection(position: number): EditorChain;
  scrollIntoView(): EditorChain;
  run(): boolean;
}

export interface EditorCan {
  toggleHeading(attrs: { level: number }): boolean;
  toggleBulletList(): boolean;
  toggleOrderedList(): boolean;
}

export function chain(editor: TiptapEditor): EditorChain {
  return editor.chain() as unknown as EditorChain;
}

export function can(editor: TiptapEditor): EditorCan {
  return editor.can() as unknown as EditorCan;
}

/** What `nodeRange` needs of a ProseMirror node, so it can be tested without an editor. */
export interface DocNodeLike {
  readonly childCount: number;
  readonly nodeSize: number;
  readonly isText: boolean;
  readonly isAtom: boolean;
  child(index: number): DocNodeLike;
}

/**
 * Where the node at `path` sits in the document: `path` indexes down the
 * document's `content` arrays (the order of the JSON the editor emits), and
 * the result is its ProseMirror range, `from` before the node and `to` after.
 * Null when the path leads nowhere, as when the document has moved on since
 * the path was taken.
 */
export function nodeRange(
  doc: DocNodeLike,
  path: readonly number[],
): { from: number; to: number; node: DocNodeLike } | null {
  if (path.length === 0) return null;
  let node = doc;
  let from = 0;
  for (let depth = 0; depth < path.length; depth += 1) {
    const index = path[depth] as number;
    if (!Number.isInteger(index) || index < 0 || index >= node.childCount) return null;
    for (let i = 0; i < index; i += 1) from += node.child(i).nodeSize;
    node = node.child(index);
    // Past the node's opening token, into its content.
    if (depth < path.length - 1) from += 1;
  }
  return { from, to: from + node.nodeSize, node };
}

/**
 * Select and scroll to the node at `path` (see nodeRange) and give the editor
 * focus: a run of text is highlighted, a leaf (an image, a button, a variable)
 * is selected whole, and a container takes the cursor at its start. False
 * when the path no longer leads to a node.
 */
export function revealNode(editor: TiptapEditor, path: readonly number[]): boolean {
  const range = nodeRange(editor.state.doc as unknown as DocNodeLike, path);
  if (!range) return false;
  const { from, to, node } = range;
  const selected = node.isText
    ? chain(editor).setTextSelection({ from, to })
    : node.isAtom
      ? chain(editor).setNodeSelection(from)
      : chain(editor).setTextSelection(from + 1);
  return selected.focus().scrollIntoView().run();
}
