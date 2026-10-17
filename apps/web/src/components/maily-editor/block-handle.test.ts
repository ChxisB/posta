import { describe, expect, it } from "vitest";
import {
  activeBlockIndex,
  announcementFor,
  BLOCK_DRAG_TYPE,
  blockAtY,
  blockMenuEntries,
  gapPositions,
  isMoveTo,
  nearestGap,
} from "./block-handle";
import { BLOCK_ACTION_IDS } from "./shortcuts";

const idle = { hover: null, selected: null, engaged: false };

describe("activeBlockIndex", () => {
  it("is the block under the pointer", () => {
    expect(activeBlockIndex({ ...idle, hover: 2 }, 5)).toBe(2);
    expect(activeBlockIndex({ hover: 2, selected: 4, engaged: true }, 5)).toBe(2);
  });

  it("is the block holding the cursor while the editor or the handle has focus", () => {
    expect(activeBlockIndex({ hover: null, selected: 3, engaged: true }, 5)).toBe(3);
  });

  it("is hidden when nothing is hovered and nothing has focus", () => {
    expect(activeBlockIndex({ hover: null, selected: 3, engaged: false }, 5)).toBeNull();
    expect(activeBlockIndex(idle, 5)).toBeNull();
    expect(activeBlockIndex({ hover: null, selected: null, engaged: true }, 5)).toBeNull();
  });

  it("is hidden for a document with no blocks", () => {
    expect(activeBlockIndex({ hover: 0, selected: 0, engaged: true }, 0)).toBeNull();
  });

  it("reads an index past the last block as the last block, and one before the first as the first", () => {
    expect(activeBlockIndex({ ...idle, hover: 9 }, 3)).toBe(2);
    expect(activeBlockIndex({ hover: null, selected: 9, engaged: true }, 3)).toBe(2);
    expect(activeBlockIndex({ ...idle, hover: -1 }, 3)).toBe(0);
  });
});

// Three blocks with 12px between them: 10-50, 62-100, 112-300.
const spans = [
  { top: 10, bottom: 50 },
  { top: 62, bottom: 100 },
  { top: 112, bottom: 300 },
];

describe("blockAtY", () => {
  it("is the block the pointer is inside", () => {
    expect(blockAtY(spans, 30)).toBe(0);
    expect(blockAtY(spans, 62)).toBe(1);
    expect(blockAtY(spans, 300)).toBe(2);
  });

  it("is the nearer block between two", () => {
    expect(blockAtY(spans, 53)).toBe(0);
    expect(blockAtY(spans, 58)).toBe(1);
  });

  it("is the first or last block just above or below the email", () => {
    expect(blockAtY(spans, 0)).toBe(0);
    expect(blockAtY(spans, 320)).toBe(2);
  });

  it("is none well beyond either end", () => {
    expect(blockAtY(spans, -40)).toBeNull();
    expect(blockAtY(spans, 340)).toBeNull();
    expect(blockAtY(spans, 340, 80)).toBe(2);
  });

  it("is none when there are no blocks", () => {
    expect(blockAtY([], 10)).toBeNull();
  });
});

describe("gapPositions", () => {
  it("has one more gap than blocks, at the edges and the middle of the spaces between", () => {
    expect(gapPositions(spans)).toEqual([10, 56, 106, 300]);
  });

  it("has two gaps for one block, and none for no blocks", () => {
    expect(gapPositions([{ top: 5, bottom: 25 }])).toEqual([5, 25]);
    expect(gapPositions([])).toEqual([]);
  });
});

describe("nearestGap", () => {
  const gaps = gapPositions(spans);

  it("is the closest gap to the pointer", () => {
    expect(nearestGap(gaps, 12)).toBe(0);
    expect(nearestGap(gaps, 70)).toBe(1);
    expect(nearestGap(gaps, 110)).toBe(2);
    expect(nearestGap(gaps, 290)).toBe(3);
  });

  it("is the first or last gap beyond either end", () => {
    expect(nearestGap(gaps, -500)).toBe(0);
    expect(nearestGap(gaps, 900)).toBe(3);
  });

  it("is the upper gap on a tie", () => {
    expect(nearestGap([0, 10], 5)).toBe(0);
  });

  it("is none when there are no gaps", () => {
    expect(nearestGap([], 5)).toBeNull();
  });
});

describe("isMoveTo", () => {
  it("is false for the gaps either side of the block, and true for any other", () => {
    expect(isMoveTo(2, 2)).toBe(false);
    expect(isMoveTo(2, 3)).toBe(false);
    expect(isMoveTo(2, 1)).toBe(true);
    expect(isMoveTo(2, 4)).toBe(true);
    expect(isMoveTo(0, 0)).toBe(false);
    expect(isMoveTo(0, 1)).toBe(false);
    expect(isMoveTo(0, 2)).toBe(true);
  });
});

describe("blockMenuEntries", () => {
  const ids = (entries: ReturnType<typeof blockMenuEntries>) =>
    entries.map((entry) => entry?.id ?? "-");

  it("offers exactly the block shortcuts, each once, in groups", () => {
    const entries = blockMenuEntries(2, 5);
    expect(ids(entries)).toEqual([
      "moveBlockUp",
      "moveBlockDown",
      "-",
      "duplicateBlock",
      "insertParagraphAfter",
      "-",
      "deleteBlock",
    ]);
    expect(entries.flatMap((entry) => (entry ? [entry.id] : [])).sort()).toEqual(
      [...BLOCK_ACTION_IDS].sort(),
    );
  });

  it("marks only delete as dangerous", () => {
    const danger = blockMenuEntries(2, 5).flatMap((entry) => (entry?.danger ? [entry.id] : []));
    expect(danger).toEqual(["deleteBlock"]);
  });

  it("cannot move the first block up, or the last block down", () => {
    const disabled = (index: number, count: number) =>
      blockMenuEntries(index, count).flatMap((entry) => (entry?.disabled ? [entry.id] : []));
    expect(disabled(0, 5)).toEqual(["moveBlockUp"]);
    expect(disabled(4, 5)).toEqual(["moveBlockDown"]);
    expect(disabled(2, 5)).toEqual([]);
    expect(disabled(0, 1)).toEqual(["moveBlockUp", "moveBlockDown"]);
  });
});

describe("announcementFor", () => {
  it("has a line for every block action", () => {
    expect(BLOCK_ACTION_IDS.map(announcementFor)).toEqual([
      "moved",
      "moved",
      "duplicated",
      "deleted",
      "added",
    ]);
  });
});

describe("BLOCK_DRAG_TYPE", () => {
  it("is a data type of our own, so ProseMirror takes no text from the drop", () => {
    expect(BLOCK_DRAG_TYPE).toMatch(/^application\/x-/);
  });
});
