import { describe, expect, it } from "vitest";
import {
  type AuthoringNode,
  applyBlockEdits,
  BLOCK_ACTIONS,
  type BlockEdit,
  blockRangeAt,
  blockSpanOf,
  planDelete,
  planDuplicate,
  planInsertParagraphAfter,
  planMove,
  runBlockAction,
  type SelectionLike,
  selectionAt,
  selectionOf,
} from "./block-actions";
import type { ChainCommandProps, TiptapEditor } from "./commands";
import { BLOCK_ACTION_IDS } from "./shortcuts";

// ---- A document made of plain objects, sized the way ProseMirror sizes it ----

function textblock(name: string, textLength = 0): AuthoringNode {
  return make(name, textLength + 2, [], { textblock: true });
}
function leaf(name: string): AuthoringNode {
  return make(name, 1, [], { atom: true });
}
function container(name: string, ...children: AuthoringNode[]): AuthoringNode {
  return make(
    name,
    children.reduce((sum, c) => sum + c.nodeSize, 2),
    children,
    {},
  );
}
function make(
  name: string,
  nodeSize: number,
  children: AuthoringNode[],
  kind: { textblock?: boolean; atom?: boolean },
): AuthoringNode {
  return {
    type: { name },
    nodeSize,
    childCount: children.length,
    isText: false,
    isAtom: kind.atom === true,
    isTextblock: kind.textblock === true,
    child: (index) => children[index] as AuthoringNode,
  };
}
const doc = (...blocks: AuthoringNode[]) => container("doc", ...blocks);

/**
 * A (4) paragraph "ab", B (5) heading "cde", C (1) image, D (7) bullet list of one
 * item holding "x", E (13) two columns, one paragraph each.
 *
 *   A 0-4   B 4-9   C 9-10   D 10-17   E 17-30
 */
function email(): AuthoringNode {
  return doc(
    textblock("paragraph", 2),
    textblock("heading", 3),
    leaf("image"),
    container("bulletList", container("listItem", textblock("paragraph", 1))),
    container(
      "columns",
      container("column", textblock("paragraph", 2)),
      container("column", textblock("paragraph", 1)),
    ),
  );
}
const NAMES = ["A", "B", "C", "D", "E"];

const cursor = (pos: number): SelectionLike => ({ from: pos, to: pos, node: false, inline: true });
const range = (from: number, to: number): SelectionLike => ({
  from,
  to,
  node: false,
  inline: true,
});

describe("blockRangeAt", () => {
  it("is the top-level block a position is inside", () => {
    expect(blockRangeAt(email(), 2)).toEqual({ index: 0, from: 0, to: 4 });
    expect(blockRangeAt(email(), 6)).toEqual({ index: 1, from: 4, to: 9 });
  });

  it("is the whole list for a position in a list item, and the whole column set for one in a column", () => {
    expect(blockRangeAt(email(), 13)).toEqual({ index: 3, from: 10, to: 17 });
    expect(blockRangeAt(email(), 12)).toEqual({ index: 3, from: 10, to: 17 });
    expect(blockRangeAt(email(), 20)).toEqual({ index: 4, from: 17, to: 30 });
    expect(blockRangeAt(email(), 26)).toEqual({ index: 4, from: 17, to: 30 });
  });

  it("gives a boundary to the block after it, or before it when asked", () => {
    expect(blockRangeAt(email(), 4)?.index).toBe(1);
    expect(blockRangeAt(email(), 4, "after")?.index).toBe(1);
    expect(blockRangeAt(email(), 4, "before")?.index).toBe(0);
    expect(blockRangeAt(email(), 9, "after")?.index).toBe(2);
    expect(blockRangeAt(email(), 10, "before")?.index).toBe(2);
  });

  it("clamps to the first and last blocks at the document's ends", () => {
    expect(blockRangeAt(email(), 0, "after")?.index).toBe(0);
    expect(blockRangeAt(email(), 0, "before")?.index).toBe(0);
    expect(blockRangeAt(email(), 30, "after")?.index).toBe(4);
    expect(blockRangeAt(email(), 30, "before")?.index).toBe(4);
    expect(blockRangeAt(email(), 999)?.index).toBe(4);
    expect(blockRangeAt(email(), -3)?.index).toBe(0);
  });

  it("handles a document of one block, and of none", () => {
    expect(blockRangeAt(doc(textblock("paragraph")), 1)).toEqual({ index: 0, from: 0, to: 2 });
    expect(blockRangeAt(doc(textblock("paragraph")), 2, "before")?.index).toBe(0);
    expect(blockRangeAt(doc(), 0)).toBeNull();
  });
});

describe("blockSpanOf", () => {
  it("is the one block a cursor is in", () => {
    expect(blockSpanOf(email(), cursor(6))).toEqual({
      firstIndex: 1,
      lastIndex: 1,
      from: 4,
      to: 9,
    });
  });

  it("runs from the first block a range touches to the last", () => {
    expect(blockSpanOf(email(), range(5, 12))).toEqual({
      firstIndex: 1,
      lastIndex: 3,
      from: 4,
      to: 17,
    });
  });

  it("ends with the block a selection stops on the far edge of", () => {
    expect(blockSpanOf(email(), range(1, 4))?.lastIndex).toBe(0);
    expect(blockSpanOf(email(), range(4, 9))).toEqual({
      firstIndex: 1,
      lastIndex: 1,
      from: 4,
      to: 9,
    });
  });

  it("is the one block for a selected node", () => {
    expect(blockSpanOf(email(), { from: 9, to: 10 })).toEqual({
      firstIndex: 2,
      lastIndex: 2,
      from: 9,
      to: 10,
    });
  });

  it("is every block for select-all", () => {
    expect(blockSpanOf(email(), { from: 0, to: 30 })).toEqual({
      firstIndex: 0,
      lastIndex: 4,
      from: 0,
      to: 30,
    });
  });

  it("is null for a document with no blocks", () => {
    expect(blockSpanOf(doc(), cursor(0))).toBeNull();
  });
});

describe("selectionAt", () => {
  it("is the start of the text for a block that holds text", () => {
    expect(selectionAt(email(), 0)).toEqual({ kind: "text", from: 1, to: 1 });
    expect(selectionAt(email(), 4)).toEqual({ kind: "text", from: 5, to: 5 });
  });

  it("selects a leaf whole", () => {
    expect(selectionAt(email(), 9)).toEqual({ kind: "node", at: 9 });
  });

  it("goes into a list and a column set to the first line of text", () => {
    // bulletList 10, listItem 11, paragraph 12, text from 13
    expect(selectionAt(email(), 10)).toEqual({ kind: "text", from: 13, to: 13 });
    // columns 17, column 18, paragraph 19, text from 20
    expect(selectionAt(email(), 17)).toEqual({ kind: "text", from: 20, to: 20 });
  });

  it("selects an empty container rather than looking for text it does not have", () => {
    expect(selectionAt(doc(container("section")), 0)).toEqual({ kind: "node", at: 0 });
  });

  it("is null for a document with no blocks", () => {
    expect(selectionAt(doc(), 0)).toBeNull();
  });
});

describe("planMove", () => {
  it("swaps a block with the one above: copy it below the block, then delete it", () => {
    expect(planMove(email(), cursor(6), "up")).toEqual({
      edits: [
        { type: "copy", at: 9, from: 0, to: 4 },
        { type: "delete", from: 0, to: 4 },
      ],
      select: null,
    });
  });

  it("swaps a block with the one below: delete it, then copy it above the block", () => {
    expect(planMove(email(), cursor(6), "down")).toEqual({
      edits: [
        { type: "delete", from: 9, to: 10 },
        { type: "copy", at: 4, from: 9, to: 10 },
      ],
      select: null,
    });
  });

  it("does nothing at the top going up or the bottom going down", () => {
    expect(planMove(email(), cursor(2), "up")).toBeNull();
    expect(planMove(email(), cursor(26), "down")).toBeNull();
    expect(planMove(email(), { from: 0, to: 30, node: false, inline: false }, "up")).toBeNull();
    expect(planMove(email(), { from: 0, to: 30, node: false, inline: false }, "down")).toBeNull();
  });

  it("moves every block a range touches, together", () => {
    expect(planMove(email(), range(5, 10), "up")?.edits[0]).toEqual({
      type: "copy",
      at: 10,
      from: 0,
      to: 4,
    });
    expect(planMove(email(), range(5, 12), "down")?.edits).toEqual([
      { type: "delete", from: 17, to: 30 },
      { type: "copy", at: 4, from: 17, to: 30 },
    ]);
  });

  it("moves the whole column set for a cursor in a column, and the whole list for one in a list", () => {
    expect(planMove(email(), cursor(22), "up")?.edits).toEqual([
      { type: "copy", at: 30, from: 10, to: 17 },
      { type: "delete", from: 10, to: 17 },
    ]);
    expect(planMove(email(), cursor(13), "down")?.edits).toEqual([
      { type: "delete", from: 17, to: 30 },
      { type: "copy", at: 10, from: 17, to: 30 },
    ]);
  });

  it("does nothing in a document of one block", () => {
    const one = doc(textblock("paragraph", 3));
    expect(planMove(one, cursor(2), "up")).toBeNull();
    expect(planMove(one, cursor(2), "down")).toBeNull();
  });
});

describe("planDuplicate", () => {
  it("copies the block after itself and carries the cursor into the copy", () => {
    expect(planDuplicate(email(), cursor(6))).toEqual({
      edits: [{ type: "copy", at: 9, from: 4, to: 9 }],
      select: { kind: "text", from: 11, to: 11 },
    });
  });

  it("carries a text range into the copy", () => {
    expect(planDuplicate(email(), range(1, 6))).toEqual({
      edits: [{ type: "copy", at: 9, from: 0, to: 9 }],
      select: { kind: "text", from: 10, to: 15 },
    });
  });

  it("selects the copy of a node that was selected", () => {
    expect(planDuplicate(email(), { from: 9, to: 10, node: true, inline: false })).toEqual({
      edits: [{ type: "copy", at: 10, from: 9, to: 10 }],
      select: { kind: "node", at: 10 },
    });
  });

  it("starts the cursor at the top of the copy when the selection was not text (select-all, a gap cursor)", () => {
    expect(planDuplicate(email(), { from: 0, to: 30, node: false, inline: false })).toEqual({
      edits: [{ type: "copy", at: 30, from: 0, to: 30 }],
      select: { kind: "text", from: 31, to: 31 },
    });
    // The first block is an image: select its copy instead.
    const images = doc(leaf("image"), textblock("paragraph"));
    expect(planDuplicate(images, { from: 0, to: 3, node: false, inline: false })?.select).toEqual({
      kind: "node",
      at: 3,
    });
  });
});

describe("planDelete", () => {
  it("removes the block and leaves the selection to ProseMirror, which moves it on", () => {
    expect(planDelete(email(), cursor(6))).toEqual({
      edits: [{ type: "delete", from: 4, to: 9 }],
      select: null,
    });
    expect(planDelete(email(), cursor(26))?.edits).toEqual([{ type: "delete", from: 17, to: 30 }]);
  });

  it("removes every block a range touches", () => {
    expect(planDelete(email(), range(5, 12))?.edits).toEqual([{ type: "delete", from: 4, to: 17 }]);
  });

  it("leaves one empty paragraph when it removes them all", () => {
    expect(planDelete(email(), { from: 0, to: 30, node: false, inline: false })).toEqual({
      edits: [
        { type: "paragraph", at: 30 },
        { type: "delete", from: 0, to: 30 },
      ],
      select: { kind: "text", from: 1, to: 1 },
    });
    expect(planDelete(doc(textblock("paragraph", 3)), cursor(2))?.edits).toEqual([
      { type: "paragraph", at: 5 },
      { type: "delete", from: 0, to: 5 },
    ]);
  });
});

describe("planInsertParagraphAfter", () => {
  it("adds an empty paragraph after the block and puts the cursor in it", () => {
    expect(planInsertParagraphAfter(email(), cursor(6))).toEqual({
      edits: [{ type: "paragraph", at: 9 }],
      select: { kind: "text", from: 10, to: 10 },
    });
  });

  it("goes after the whole column set or list, never inside it", () => {
    expect(planInsertParagraphAfter(email(), cursor(22))?.edits).toEqual([
      { type: "paragraph", at: 30 },
    ]);
    expect(planInsertParagraphAfter(email(), cursor(13))?.edits).toEqual([
      { type: "paragraph", at: 17 },
    ]);
  });

  it("goes after the last block at the end of the email", () => {
    expect(planInsertParagraphAfter(email(), cursor(26))?.select).toEqual({
      kind: "text",
      from: 31,
      to: 31,
    });
  });
});

// ---- Applying a plan: a model of the document that insists on real positions ----

interface Block {
  name: string;
  size: number;
}
const BLOCKS: Block[] = [
  { name: "A", size: 4 },
  { name: "B", size: 5 },
  { name: "C", size: 1 },
  { name: "D", size: 7 },
  { name: "E", size: 13 },
];

/** A transaction over a list of top-level blocks. A position off a block edge throws. */
function model(initial: Block[] = BLOCKS) {
  const blocks = [...initial];
  const indexAt = (pos: number): number => {
    let at = 0;
    for (let i = 0; i < blocks.length; i += 1) {
      if (at === pos) return i;
      at += (blocks[i] as Block).size;
    }
    if (at === pos) return blocks.length;
    throw new Error(
      `position ${pos} is not on a block edge of ${blocks.map((b) => b.name).join("")}`,
    );
  };
  const slice = (from: number, to: number) => ({
    content: blocks.slice(indexAt(from), indexAt(to)),
  });
  const props: ChainCommandProps = {
    tr: {
      doc: { slice },
      insert(position, content) {
        blocks.splice(indexAt(position), 0, ...(content as Block[]));
      },
      delete(from, to) {
        const start = indexAt(from);
        blocks.splice(start, indexAt(to) - start);
      },
    },
    state: {
      doc: { slice },
      schema: { nodes: { paragraph: { createAndFill: () => [{ name: "P", size: 2 }] } } },
    },
  };
  return { props, names: () => blocks.map((b) => b.name).join("") };
}

function result(id: (typeof BLOCK_ACTION_IDS)[number], selection: SelectionLike): string | null {
  const plan = BLOCK_ACTIONS[id](email(), selection);
  if (!plan) return null;
  const m = model();
  expect(applyBlockEdits(plan.edits, m.props)).toBe(true);
  return m.names();
}

describe("applyBlockEdits", () => {
  it("moves a block up and down by one", () => {
    expect(result("moveBlockUp", cursor(6))).toBe("BACDE");
    expect(result("moveBlockDown", cursor(6))).toBe("ACBDE");
    expect(result("moveBlockDown", { from: 9, to: 10, node: true, inline: false })).toBe("ABDCE");
  });

  it("moves a run of blocks together", () => {
    expect(result("moveBlockUp", range(5, 12))).toBe("BCDAE");
    expect(result("moveBlockDown", range(5, 12))).toBe("AEBCD");
  });

  it("moves a column set or a list as one block", () => {
    expect(result("moveBlockUp", cursor(22))).toBe("ABCED");
    expect(result("moveBlockDown", cursor(13))).toBe("ABCED");
  });

  it("leaves the email alone where there is no room to move", () => {
    expect(result("moveBlockUp", cursor(2))).toBeNull();
    expect(result("moveBlockDown", cursor(22))).toBeNull();
  });

  it("duplicates a block, or a run of blocks, right after itself", () => {
    expect(result("duplicateBlock", cursor(6))).toBe("ABBCDE");
    expect(result("duplicateBlock", range(5, 12))).toBe("ABCDBCDE");
    expect(result("duplicateBlock", cursor(22))).toBe("ABCDEE");
  });

  it("deletes a block or a run of blocks", () => {
    expect(result("deleteBlock", cursor(6))).toBe("ACDE");
    expect(result("deleteBlock", cursor(22))).toBe("ABCD");
    expect(result("deleteBlock", range(5, 12))).toBe("AE");
  });

  it("leaves one empty paragraph when everything is deleted", () => {
    expect(result("deleteBlock", { from: 0, to: 30, node: false, inline: false })).toBe("P");
  });

  it("adds a paragraph after the block", () => {
    expect(result("insertParagraphAfter", cursor(6))).toBe("ABPCDE");
    expect(result("insertParagraphAfter", cursor(22))).toBe("ABCDEP");
  });

  it("keeps every block, and the document's size, when it only moves things", () => {
    for (let pos = 0; pos <= 30; pos += 1) {
      for (const id of ["moveBlockUp", "moveBlockDown"] as const) {
        const names = result(id, cursor(pos));
        if (names === null) continue;
        expect([...names].sort().join("")).toBe(NAMES.join(""));
      }
    }
  });

  it("fails, rather than half-applying, when the schema has no paragraph", () => {
    const m = model();
    m.props.state.schema.nodes = {};
    expect(applyBlockEdits([{ type: "paragraph", at: 0 } satisfies BlockEdit], m.props)).toBe(
      false,
    );
  });
});

describe("selectionOf", () => {
  const side = (inlineContent: boolean) => ({ parent: { inlineContent } });

  it("reads a text cursor", () => {
    expect(selectionOf({ from: 3, to: 3, $from: side(true), $to: side(true) })).toEqual({
      from: 3,
      to: 3,
      node: false,
      inline: true,
    });
  });

  it("reads a node selection, which has a node and no text ends", () => {
    expect(
      selectionOf({ from: 9, to: 10, node: {}, $from: side(false), $to: side(false) }),
    ).toEqual({
      from: 9,
      to: 10,
      node: true,
      inline: false,
    });
  });

  it("is not inline when one end is outside a line of text, as in select-all", () => {
    expect(selectionOf({ from: 0, to: 30, $from: side(false), $to: side(false) }).inline).toBe(
      false,
    );
    expect(selectionOf({ from: 1, to: 30, $from: side(true), $to: side(false) }).inline).toBe(
      false,
    );
  });
});

describe("runBlockAction", () => {
  /** An editor whose chain records what it is asked to do. */
  function fakeEditor(options: { editable?: boolean; selection?: SelectionLike } = {}) {
    const calls: string[] = [];
    let command: ((props: ChainCommandProps) => boolean) | undefined;
    const facade = {
      command(fn: (props: ChainCommandProps) => boolean) {
        calls.push("command");
        command = fn;
        return facade;
      },
      setTextSelection(position: unknown) {
        calls.push(`text ${JSON.stringify(position)}`);
        return facade;
      },
      setNodeSelection(position: number) {
        calls.push(`node ${position}`);
        return facade;
      },
      scrollIntoView() {
        calls.push("scroll");
        return facade;
      },
      run() {
        calls.push("run");
        return true;
      },
    };
    const sel = options.selection ?? cursor(6);
    const editor = {
      isEditable: options.editable !== false,
      chain: () => facade,
      state: {
        doc: email(),
        selection: {
          from: sel.from,
          to: sel.to,
          ...(sel.node ? { node: {} } : {}),
          $from: { parent: { inlineContent: sel.inline } },
          $to: { parent: { inlineContent: sel.inline } },
        },
      },
    } as unknown as TiptapEditor;
    return { editor, calls, command: () => command };
  }

  it("runs the edits as one chain, then the selection, then scrolls", () => {
    const { editor, calls, command } = fakeEditor({ selection: cursor(6) });
    expect(runBlockAction(editor, "duplicateBlock")).toBe(true);
    expect(calls).toEqual(["command", 'text {"from":11,"to":11}', "scroll", "run"]);
    const m = model();
    expect(command()?.(m.props)).toBe(true);
    expect(m.names()).toBe("ABBCDE");
  });

  it("selects a node by its position", () => {
    const { editor, calls } = fakeEditor({
      selection: { from: 9, to: 10, node: true, inline: false },
    });
    runBlockAction(editor, "duplicateBlock");
    expect(calls).toContain("node 10");
  });

  it("leaves the selection to ProseMirror for a move", () => {
    const { editor, calls } = fakeEditor({ selection: cursor(6) });
    runBlockAction(editor, "moveBlockUp");
    expect(calls).toEqual(["command", "scroll", "run"]);
  });

  it("takes the key but changes nothing when there is nowhere to move", () => {
    const { editor, calls } = fakeEditor({ selection: cursor(2) });
    expect(runBlockAction(editor, "moveBlockUp")).toBe(true);
    expect(calls).toEqual([]);
  });

  it("does nothing, and does not take the key, in an editor that cannot be edited", () => {
    const { editor, calls } = fakeEditor({ editable: false });
    expect(runBlockAction(editor, "deleteBlock")).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("BLOCK_ACTIONS", () => {
  it("has one planner for each block shortcut, and no others", () => {
    expect(Object.keys(BLOCK_ACTIONS).sort()).toEqual([...BLOCK_ACTION_IDS].sort());
  });
});
