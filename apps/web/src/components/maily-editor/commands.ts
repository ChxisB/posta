import type { EditorProps } from "@maily-to/core";
import type { BlockItem } from "@maily-to/core/blocks";

/** The Tiptap editor instance Maily hands back from onCreate/onUpdate. */
export type TiptapEditor = Parameters<NonNullable<EditorProps["onCreate"]>>[0];

/**
 * A minimal, honest facade over Tiptap's command chain. Maily bundles the
 * text-align/list extensions, so these commands exist at runtime, but their
 * `declare module` augmentations aren't all in our type graph: typing exactly
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
  insertContentAt(position: number, content: unknown): EditorChain;
  setTextSelection(position: number | { from: number; to: number }): EditorChain;
  setNodeSelection(position: number): EditorChain;
  scrollIntoView(): EditorChain;
  /** Runs `fn` on the chain's transaction, so a run of edits is one undo step. */
  command(fn: (props: ChainCommandProps) => boolean): EditorChain;
  run(): boolean;
}

/** The transaction methods the block shortcuts use, as Tiptap's `command` hands them over. */
export interface TransactionLike {
  readonly doc: { slice(from: number, to: number): { content: unknown } };
  insert(position: number, content: unknown): unknown;
  delete(from: number, to: number): unknown;
}

/** What `command` passes its function: the shared transaction and the state it started from. */
export interface ChainCommandProps {
  tr: TransactionLike;
  state: {
    doc: { slice(from: number, to: number): { content: unknown } };
    schema: { nodes: Record<string, { createAndFill(): unknown } | undefined> };
  };
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

/** A top-level node as `planBlockInsert` reads it: its kind as well as its size. */
export interface BlockNodeLike extends DocNodeLike {
  readonly type: { readonly name: string };
}

/**
 * Where a block from the rail goes. Either the selected top-level block is an
 * empty paragraph, which the block takes over (`cursor` is inside it), or a
 * new empty paragraph goes in between top-level blocks at `at` and the block
 * takes that over.
 */
export type BlockInsertPlan = { kind: "reuse"; cursor: number } | { kind: "after"; at: number };

/**
 * Plans an insert after the top-level block holding the selection's end: a
 * block in a column, a list item or a section goes after the whole column set,
 * list or section, never inside it, and a run of text is never split. With no
 * selection it goes at the end. An empty paragraph (the empty document's one,
 * or a trailing line) is reused, so the insert leaves no stray blank line.
 */
export function planBlockInsert(
  doc: BlockNodeLike,
  selection: { from: number; to: number } | null,
): BlockInsertPlan {
  if (doc.childCount === 0) return { kind: "after", at: 0 };
  let start = 0;
  let anchor = doc.child(0) as BlockNodeLike;
  let anchorStart = 0;
  for (let index = 0; index < doc.childCount; index += 1) {
    const child = doc.child(index) as BlockNodeLike;
    anchor = child;
    anchorStart = start;
    start += child.nodeSize;
    // The end of a selected node (or of the document) sits on the boundary and
    // belongs to the node before it.
    if (selection && selection.to <= start) break;
  }
  if (anchor.type.name === "paragraph" && anchor.childCount === 0) {
    return { kind: "reuse", cursor: anchorStart + 1 };
  }
  return { kind: "after", at: anchorStart + anchor.nodeSize };
}

/**
 * Inserts one of the editor's blocks after the selected top-level block (at
 * the end when the editor has not been used yet) and leaves it ready to fill.
 * Maily's own block command does the work, as it does for the slash menu: it
 * turns the empty line the cursor is on into the block, so the rail and the
 * slash menu make the same nodes. False when the block has no command.
 */
export function insertBlockAfterSelection(
  editor: TiptapEditor,
  block: BlockItem,
  options: { atEnd?: boolean } = {},
): boolean {
  const command = block.command;
  if (typeof command !== "function") return false;
  const plan = planBlockInsert(
    editor.state.doc as unknown as BlockNodeLike,
    options.atEnd ? null : editor.state.selection,
  );
  const cursor = plan.kind === "reuse" ? plan.cursor : plan.at + 1;
  const ready =
    plan.kind === "reuse"
      ? chain(editor).focus().setTextSelection(cursor).run()
      : chain(editor)
          .focus()
          .insertContentAt(plan.at, { type: "paragraph" })
          .setTextSelection(cursor)
          .run();
  if (!ready) return false;
  command({ editor, range: { from: cursor, to: cursor } });
  // An added leaf (an image, a button, a spacer, a divider) is what the next
  // block should follow. A divider moves the selection on, onto or into
  // whatever comes after it, and the person asked for the divider, not to type
  // over the block after it, so select the new leaf itself.
  const start = cursor - 1;
  const state = editor.state as unknown as {
    doc: { nodeAt(pos: number): { isAtom: boolean } | null };
    selection: { from: number };
  };
  if (state.doc.nodeAt(start)?.isAtom && state.selection.from !== start) {
    chain(editor).setNodeSelection(start).run();
  }
  return true;
}
