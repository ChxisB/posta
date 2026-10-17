import type { BlockActionId } from "./shortcuts";

/**
 * The block handle's decisions that need no editor: which block it hangs
 * beside, where a pointer is over the blocks, which gap a drag would drop into,
 * and what its menu offers. The handle itself (block-handle-view.tsx) reads the
 * geometry from the page and hands numbers to these.
 */

/** The drag's data type: only our own handle starts a drag of this type, so a stray drop is never taken for one. */
export const BLOCK_DRAG_TYPE = "application/x-posta-block";

/** Where the handle's block comes from, in the order it is looked up. */
export interface HandleState {
  /** The block the pointer is over. */
  hover: number | null;
  /** The block holding the editor's selection. */
  selected: number | null;
  /** The editor, the handle or its menu has focus, or a drag is under way. */
  engaged: boolean;
}

/**
 * The block the handle hangs beside, or null when it is not shown: the one
 * under the pointer, otherwise (while the person is working in the editor or the
 * handle) the one holding the cursor. An index the document no longer reaches
 * (a block was deleted under it) reads as the last block.
 */
export function activeBlockIndex(state: HandleState, count: number): number | null {
  if (count <= 0) return null;
  if (state.hover !== null) return Math.min(Math.max(state.hover, 0), count - 1);
  if (state.engaged && state.selected !== null) {
    return Math.min(Math.max(state.selected, 0), count - 1);
  }
  return null;
}

/** A block's vertical extent on screen. */
export interface VerticalSpan {
  top: number;
  bottom: number;
}

/**
 * The block a pointer at `y` is over. Between two blocks (their margins) it is
 * the nearer one, and beyond the first or last by more than `slack` it is none,
 * so the empty room below the email does not hang the handle on its last block.
 */
export function blockAtY(spans: readonly VerticalSpan[], y: number, slack = 24): number | null {
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index] as VerticalSpan;
    const distance = y < span.top ? span.top - y : y > span.bottom ? y - span.bottom : 0;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return bestDistance <= slack ? best : null;
}

/**
 * Where each gap between blocks sits on screen: gap 0 is the top of the first
 * block, gap `n` the bottom of the last, and the gap between two is the middle
 * of the space between them. One more than the blocks.
 */
export function gapPositions(spans: readonly VerticalSpan[]): number[] {
  if (spans.length === 0) return [];
  const first = spans[0] as VerticalSpan;
  const last = spans[spans.length - 1] as VerticalSpan;
  const gaps = [first.top];
  for (let index = 1; index < spans.length; index += 1) {
    gaps.push(((spans[index - 1] as VerticalSpan).bottom + (spans[index] as VerticalSpan).top) / 2);
  }
  gaps.push(last.bottom);
  return gaps;
}

/** The gap nearest a pointer at `y` (the upper one on a tie), or null when there are no gaps. */
export function nearestGap(gaps: readonly number[], y: number): number | null {
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < gaps.length; index += 1) {
    const distance = Math.abs((gaps[index] as number) - y);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/** The two gaps either side of a block are where it already is: dropping there is no move. */
export function isMoveTo(index: number, gap: number): boolean {
  return gap !== index && gap !== index + 1;
}

/** An action in the handle's menu, in order: `null` is a separator. */
export interface BlockMenuEntry {
  id: BlockActionId;
  disabled: boolean;
  danger: boolean;
}

/**
 * The handle menu's rows for the block at `index` of `count`: the five block
 * shortcuts, nothing else, so a menu action and a shortcut are one action. The
 * first block cannot move up and the last cannot move down.
 */
export function blockMenuEntries(index: number, count: number): (BlockMenuEntry | null)[] {
  const entry = (id: BlockActionId, disabled = false, danger = false): BlockMenuEntry => ({
    id,
    disabled,
    danger,
  });
  return [
    entry("moveBlockUp", index <= 0),
    entry("moveBlockDown", index >= count - 1),
    null,
    entry("duplicateBlock"),
    entry("insertParagraphAfter"),
    null,
    entry("deleteBlock", false, true),
  ];
}

/** What a screen reader is told after an action: the key of a string in `block-editor.handle.announce`. */
export type Announcement = "moved" | "duplicated" | "deleted" | "added";

export function announcementFor(id: BlockActionId): Announcement {
  switch (id) {
    case "moveBlockUp":
    case "moveBlockDown":
      return "moved";
    case "duplicateBlock":
      return "duplicated";
    case "deleteBlock":
      return "deleted";
    case "insertParagraphAfter":
      return "added";
  }
}
