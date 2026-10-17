import { type BlockNodeLike, type ChainCommandProps, chain, type TiptapEditor } from "./commands";
import type { BlockActionId } from "./shortcuts";

/**
 * Block-level authoring: move, duplicate, delete and add a paragraph after, on
 * the top-level blocks of the email (a paragraph, a heading, a list, a quote, a
 * column set, a section, an image, a button...). The unit is always the
 * top-level block, so a list moves as one list and a block inside a column
 * moves its whole column set: predictable, and never an invalid nesting.
 *
 * Each action is planned from the document and the selection alone (pure, so
 * it is tested without an editor) and then applied as one transaction, so one
 * undo puts it back.
 */

/** A node as the planners read it: size and kind, and whether text lives directly in it. */
export interface AuthoringNode extends BlockNodeLike {
  readonly isTextblock: boolean;
  child(index: number): AuthoringNode;
}

/** A top-level block's place in the document: `from` is before it and `to` after it. */
export interface BlockRange {
  index: number;
  from: number;
  to: number;
}

/**
 * The top-level block around a document position. A position on the boundary
 * between two blocks belongs to the one after it (`"after"`, the default, which
 * is what a selected node's start is) or the one before it (`"before"`, which is
 * what the end of a selected node is). Past either end of the document it is
 * the first or last block. Null only for a document with no blocks.
 */
export function blockRangeAt(
  doc: AuthoringNode,
  pos: number,
  assoc: "after" | "before" = "after",
): BlockRange | null {
  if (doc.childCount === 0) return null;
  let from = 0;
  let last: BlockRange | null = null;
  for (let index = 0; index < doc.childCount; index += 1) {
    const to = from + doc.child(index).nodeSize;
    last = { index, from, to };
    if (assoc === "after" ? pos < to : pos <= to) return last;
    from = to;
  }
  return last;
}

/** The run of top-level blocks a selection touches. */
export interface BlockSpan {
  firstIndex: number;
  lastIndex: number;
  from: number;
  to: number;
}

/**
 * The blocks a selection touches, first to last. A cursor is the one block it
 * is in; a range from one block into another is both and all between; a
 * selection that ends on a block's far edge (a selected node, select-all) ends
 * with that block, not the one that follows.
 */
export function blockSpanOf(
  doc: AuthoringNode,
  selection: { from: number; to: number },
): BlockSpan | null {
  const first = blockRangeAt(doc, selection.from, "after");
  if (!first) return null;
  const end = selection.to > selection.from ? blockRangeAt(doc, selection.to, "before") : first;
  const last = end && end.index >= first.index ? end : first;
  return { firstIndex: first.index, lastIndex: last.index, from: first.from, to: last.to };
}

/** What `selectionAt` and the plans say to select. */
export type SelectionPlan =
  | { kind: "text"; from: number; to: number }
  | { kind: "node"; at: number };

/**
 * A selection that is safe to place at the start of the top-level block that
 * begins at `pos`: the start of its first line of text, found by going into
 * first children, or the block itself when it is a leaf such as an image. A
 * text cursor is only valid inside a line of text, so it cannot go on the
 * boundary at `pos`.
 */
export function selectionAt(doc: AuthoringNode, pos: number): SelectionPlan | null {
  const range = blockRangeAt(doc, pos, "after");
  if (!range) return null;
  let node = doc.child(range.index);
  let at = range.from;
  for (let depth = 0; depth < 64; depth += 1) {
    if (node.isTextblock) return { kind: "text", from: at + 1, to: at + 1 };
    if (node.isAtom || node.childCount === 0) return { kind: "node", at };
    node = node.child(0);
    at += 1;
  }
  return { kind: "node", at: range.from };
}

/** The selection as the planners need it. */
export interface SelectionLike {
  from: number;
  to: number;
  /** A whole node is selected (an image, a button). */
  node: boolean;
  /** Both ends are in lines of text, so they are valid text positions. */
  inline: boolean;
}

/**
 * One change to the document. Positions are in the document as it stands
 * before the plan, and the edits are listed from the end of the document
 * towards the start, so applying them in order never moves a later edit's
 * place.
 */
export type BlockEdit =
  | { type: "copy"; at: number; from: number; to: number }
  | { type: "delete"; from: number; to: number }
  | { type: "paragraph"; at: number };

export interface BlockPlan {
  edits: BlockEdit[];
  /** Where the selection goes afterwards (positions in the new document); null leaves it to ProseMirror, which keeps it on the same content. */
  select: SelectionPlan | null;
}

/** Swaps the selected blocks with the one above (`up`) or below (`down`). Null at the edge. */
export function planMove(
  doc: AuthoringNode,
  selection: SelectionLike,
  direction: "up" | "down",
): BlockPlan | null {
  const span = blockSpanOf(doc, selection);
  if (!span) return null;
  if (direction === "up") {
    if (span.firstIndex === 0) return null;
    const above = blockRangeAt(doc, span.from, "before");
    if (!above) return null;
    return {
      edits: [
        { type: "copy", at: span.to, from: above.from, to: above.to },
        { type: "delete", from: above.from, to: above.to },
      ],
      select: null,
    };
  }
  if (span.lastIndex === doc.childCount - 1) return null;
  const below = blockRangeAt(doc, span.to, "after");
  if (!below) return null;
  return {
    edits: [
      { type: "delete", from: below.from, to: below.to },
      { type: "copy", at: span.from, from: below.from, to: below.to },
    ],
    select: null,
  };
}

/** Puts a copy of the selected blocks after them and moves the selection into the copy. */
export function planDuplicate(doc: AuthoringNode, selection: SelectionLike): BlockPlan | null {
  const span = blockSpanOf(doc, selection);
  if (!span) return null;
  const size = span.to - span.from;
  const edits: BlockEdit[] = [{ type: "copy", at: span.to, from: span.from, to: span.to }];
  // The copy is the same shape as the original, so the same offsets land in it.
  if (selection.node) return { edits, select: { kind: "node", at: selection.from + size } };
  if (selection.inline) {
    return {
      edits,
      select: { kind: "text", from: selection.from + size, to: selection.to + size },
    };
  }
  const start = selectionAt(doc, span.from);
  if (!start) return { edits, select: null };
  return {
    edits,
    select:
      start.kind === "node"
        ? { kind: "node", at: start.at + size }
        : { kind: "text", from: start.from + size, to: start.to + size },
  };
}

/**
 * Removes the selected blocks. The selection goes to the block that followed
 * (or the one before, when the last was removed) by ProseMirror's own mapping.
 * An email always has a block, so removing all of them leaves one empty paragraph:
 * added after the last block and the rest deleted, so the document is never empty.
 */
export function planDelete(doc: AuthoringNode, selection: SelectionLike): BlockPlan | null {
  const span = blockSpanOf(doc, selection);
  if (!span) return null;
  const edits: BlockEdit[] = [{ type: "delete", from: span.from, to: span.to }];
  if (span.firstIndex === 0 && span.lastIndex === doc.childCount - 1) {
    // The paragraph goes in first: ProseMirror refills a document emptied by a
    // delete on its own, so adding it afterwards would leave two.
    edits.unshift({ type: "paragraph", at: span.to });
    return { edits, select: { kind: "text", from: span.from + 1, to: span.from + 1 } };
  }
  return { edits, select: null };
}

/** Adds an empty paragraph after the selected blocks and puts the cursor in it. */
export function planInsertParagraphAfter(
  doc: AuthoringNode,
  selection: SelectionLike,
): BlockPlan | null {
  const span = blockSpanOf(doc, selection);
  if (!span) return null;
  return {
    edits: [{ type: "paragraph", at: span.to }],
    select: { kind: "text", from: span.to + 1, to: span.to + 1 },
  };
}

/** A selection covering the whole top-level block at `index`, so a planner acts on that block. Null past either end. */
export function selectionOfBlock(doc: AuthoringNode, index: number): SelectionLike | null {
  if (!Number.isInteger(index) || index < 0 || index >= doc.childCount) return null;
  let from = 0;
  for (let i = 0; i < index; i += 1) from += doc.child(i).nodeSize;
  return { from, to: from + doc.child(index).nodeSize, node: false, inline: false };
}

/**
 * Moves the top-level block at `index` to `gap`: the gap before block `gap`,
 * counted in the document as it stands (0 is above the first block, the block
 * count is below the last). The two gaps either side of the block put it where
 * it is, so they plan nothing. Only ever a gap between top-level blocks, so a
 * drag cannot nest a block inside a quote, a list or a column.
 */
export function planMoveBlockTo(doc: AuthoringNode, index: number, gap: number): BlockPlan | null {
  const block = selectionOfBlock(doc, index);
  if (!block || !Number.isInteger(gap) || gap < 0 || gap > doc.childCount) return null;
  if (gap === index || gap === index + 1) return null;
  let at = 0;
  for (let i = 0; i < gap; i += 1) at += doc.child(i).nodeSize;
  const size = block.to - block.from;
  const copy: BlockEdit = { type: "copy", at, from: block.from, to: block.to };
  const remove: BlockEdit = { type: "delete", from: block.from, to: block.to };
  // The later edit goes first, so the earlier one's place does not move.
  const moved = at > block.from;
  const start = moved ? at - size : at;
  const target = selectionAt(doc, block.from);
  const delta = start - block.from;
  return {
    edits: moved ? [copy, remove] : [remove, copy],
    select: !target
      ? null
      : target.kind === "node"
        ? { kind: "node", at: target.at + delta }
        : { kind: "text", from: target.from + delta, to: target.to + delta },
  };
}

/** One planner per block shortcut; the drift test holds this table to the shortcut list. */
export const BLOCK_ACTIONS: Record<
  BlockActionId,
  (doc: AuthoringNode, selection: SelectionLike) => BlockPlan | null
> = {
  moveBlockUp: (doc, selection) => planMove(doc, selection, "up"),
  moveBlockDown: (doc, selection) => planMove(doc, selection, "down"),
  duplicateBlock: planDuplicate,
  deleteBlock: planDelete,
  insertParagraphAfter: planInsertParagraphAfter,
};

/**
 * Applies a plan's edits to a transaction. What a copy copies is read from the
 * document before the first edit, because a move deletes the block it copies.
 * False if the schema has no paragraph to add.
 */
export function applyBlockEdits(
  edits: readonly BlockEdit[],
  { tr, state }: ChainCommandProps,
): boolean {
  const copies = new Map<BlockEdit, unknown>();
  for (const edit of edits) {
    if (edit.type === "copy") copies.set(edit, state.doc.slice(edit.from, edit.to).content);
  }
  for (const edit of edits) {
    if (edit.type === "copy") tr.insert(edit.at, copies.get(edit));
    else if (edit.type === "delete") tr.delete(edit.from, edit.to);
    else {
      const paragraph = state.schema.nodes.paragraph?.createAndFill();
      if (!paragraph) return false;
      tr.insert(edit.at, paragraph);
    }
  }
  return true;
}

/** What `selectionOf` reads of the editor's selection. */
interface EditorSelection {
  from: number;
  to: number;
  node?: unknown;
  $from: { parent: { inlineContent: boolean } };
  $to: { parent: { inlineContent: boolean } };
}

/** The editor's selection in the shape the planners take. */
export function selectionOf(selection: EditorSelection): SelectionLike {
  return {
    from: selection.from,
    to: selection.to,
    node: selection.node !== undefined,
    inline: selection.$from.parent.inlineContent && selection.$to.parent.inlineContent,
  };
}

/**
 * Runs a block shortcut in the editor. True when the key was this shortcut's,
 * even if there was nothing to do (moving the first block up): the key is
 * taken either way, so the browser's own action for it does not half-happen.
 */
export function runBlockAction(editor: TiptapEditor, id: BlockActionId): boolean {
  if (!editor.isEditable) return false;
  const state = editor.state as unknown as {
    doc: AuthoringNode;
    selection: EditorSelection;
  };
  const plan = BLOCK_ACTIONS[id](state.doc, selectionOf(state.selection));
  if (plan) applyPlan(editor, plan);
  return true;
}

/** Runs a plan as one transaction (one undo step), selects what it says to, and scrolls there. */
function applyPlan(editor: TiptapEditor, plan: BlockPlan): void {
  let run = chain(editor).command((props) => applyBlockEdits(plan.edits, props));
  const { select } = plan;
  if (select?.kind === "text") run = run.setTextSelection({ from: select.from, to: select.to });
  else if (select?.kind === "node") run = run.setNodeSelection(select.at);
  run.scrollIntoView().run();
}

/**
 * Runs a block action on the top-level block at `index` instead of on the
 * selection (the block handle's menu acts on the block it hangs beside). The
 * cursor goes to the block it acted on (for a delete, to what took its
 * place), so the handle and the keyboard shortcuts carry on from there. False
 * when there was nothing to do.
 */
export function runBlockActionAt(editor: TiptapEditor, id: BlockActionId, index: number): boolean {
  if (!editor.isEditable) return false;
  const doc = (editor.state as unknown as { doc: AuthoringNode }).doc;
  const selection = selectionOfBlock(doc, index);
  if (!selection) return false;
  // A move is a move to the gap beside the neighbour, which also puts the
  // cursor in the block that moved (the shortcuts leave it where it was).
  const plan =
    id === "moveBlockUp"
      ? planMoveBlockTo(doc, index, index - 1)
      : id === "moveBlockDown"
        ? planMoveBlockTo(doc, index, index + 2)
        : BLOCK_ACTIONS[id](doc, selection);
  if (!plan) return false;
  applyPlan(editor, plan);
  return true;
}

/** Moves the top-level block at `index` to `gap` (see planMoveBlockTo). False when that is no move. */
export function runBlockMoveTo(editor: TiptapEditor, index: number, gap: number): boolean {
  if (!editor.isEditable) return false;
  const doc = (editor.state as unknown as { doc: AuthoringNode }).doc;
  const plan = planMoveBlockTo(doc, index, gap);
  if (!plan) return false;
  applyPlan(editor, plan);
  return true;
}
