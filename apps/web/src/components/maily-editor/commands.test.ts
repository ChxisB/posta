import type { BlockItem } from "@maily-to/core/blocks";
import { describe, expect, it, vi } from "vitest";
import {
  type BlockNodeLike,
  type DocNodeLike,
  insertBlockAfterSelection,
  nodeRange,
  planBlockInsert,
  type TiptapEditor,
} from "./commands";

// ProseMirror sizes: a text node is its length, a leaf is 1, and any other
// node is its content plus an opening and a closing token.
const text = (length: number): DocNodeLike => ({
  childCount: 0,
  nodeSize: length,
  isText: true,
  isAtom: false,
  child: () => {
    throw new Error("a text node has no children");
  },
});
const leaf = (): DocNodeLike => ({
  childCount: 0,
  nodeSize: 1,
  isText: false,
  isAtom: true,
  child: () => {
    throw new Error("a leaf has no children");
  },
});
const block = (...children: DocNodeLike[]): DocNodeLike => ({
  childCount: children.length,
  nodeSize: 2 + children.reduce((sum, c) => sum + c.nodeSize, 0),
  isText: false,
  isAtom: false,
  child: (i) => children[i] as DocNodeLike,
});

// doc: [ p("Hello") | image | columns [ column [ p("ab"), p("cd", leaf) ] , column [ p("z") ] ] ]
const hello = block(text(5)); // size 7, at 0..7
const image = leaf(); // size 1, at 7..8
const second = block(text(2), leaf()); // p inside the first column
const doc = block(hello, image, block(block(block(text(2)), second), block(block(text(1)))));

describe("nodeRange", () => {
  it("finds a top-level block", () => {
    expect(nodeRange(doc, [0])).toMatchObject({ from: 0, to: 7 });
  });

  it("counts the sizes of the siblings before a node", () => {
    expect(nodeRange(doc, [1])).toMatchObject({ from: 7, to: 8 });
    expect(nodeRange(doc, [2])).toMatchObject({ from: 8 });
  });

  it("steps into a node past its opening token", () => {
    // The text of the first paragraph starts at 1.
    expect(nodeRange(doc, [0, 0])).toMatchObject({ from: 1, to: 6 });
  });

  it("finds a node nested through columns", () => {
    // columns opens at 8; its first column opens at 9; its first paragraph at 10 (size 4);
    // the second paragraph at 14, its text at 15 and its leaf at 17.
    expect(nodeRange(doc, [2, 0, 1])).toMatchObject({ from: 14 });
    expect(nodeRange(doc, [2, 0, 1, 0])).toMatchObject({ from: 15, to: 17 });
    expect(nodeRange(doc, [2, 0, 1, 1])).toMatchObject({ from: 17, to: 18 });
  });

  it("finds a node in a later column", () => {
    // The first column is 2 + 4 + 5 = 11 long, from 9 to 20; the second opens at 20.
    expect(nodeRange(doc, [2, 1, 0])).toMatchObject({ from: 21 });
  });

  it("hands back the node it found", () => {
    expect(nodeRange(doc, [1])?.node).toBe(image);
    expect(nodeRange(doc, [2, 0, 1])?.node).toBe(second);
  });

  it.each([
    ["an empty path", []],
    ["an index past the end", [3]],
    ["a negative index", [-1]],
    ["a fraction", [0.5]],
    ["a path through a leaf", [1, 0]],
    ["a path through a text node", [0, 0, 0]],
    ["a later index that does not exist", [2, 0, 5]],
  ])("is null for %s", (_name, path) => {
    expect(nodeRange(doc, path)).toBeNull();
  });
});

// Named nodes, sized as ProseMirror sizes them, for where an insert goes.
const named = (name: string, ...children: BlockNodeLike[]): BlockNodeLike => ({
  type: { name },
  childCount: children.length,
  nodeSize: 2 + children.reduce((sum, c) => sum + c.nodeSize, 0),
  isText: false,
  isAtom: false,
  child: (i) => children[i] as BlockNodeLike,
});
const run = (length: number): BlockNodeLike => ({
  type: { name: "text" },
  childCount: 0,
  nodeSize: length,
  isText: true,
  isAtom: false,
  child: () => {
    throw new Error("a text node has no children");
  },
});
const atom = (name: string): BlockNodeLike => ({
  type: { name },
  childCount: 0,
  nodeSize: 1,
  isText: false,
  isAtom: true,
  child: () => {
    throw new Error("a leaf has no children");
  },
});
const para = (length = 0) => named("paragraph", ...(length ? [run(length)] : []));
const cursor = (at: number) => ({ from: at, to: at });

describe("planBlockInsert", () => {
  it("takes over the empty document's one empty paragraph", () => {
    expect(planBlockInsert(named("doc", para()), cursor(1))).toEqual({ kind: "reuse", cursor: 1 });
  });

  it("starts a document that has no blocks", () => {
    expect(planBlockInsert(named("doc"), null)).toEqual({ kind: "after", at: 0 });
  });

  it("goes after a paragraph the cursor is in the middle of, never splitting it", () => {
    // p("Hello") is 0..7 and the heading 7..14.
    const doc = named("doc", para(5), named("heading", run(5)));
    expect(planBlockInsert(doc, cursor(3))).toEqual({ kind: "after", at: 7 });
    expect(planBlockInsert(doc, cursor(1))).toEqual({ kind: "after", at: 7 });
    expect(planBlockInsert(doc, cursor(6))).toEqual({ kind: "after", at: 7 });
  });

  it("goes after the heading when the cursor is in the last block", () => {
    const doc = named("doc", para(5), named("heading", run(5)));
    expect(planBlockInsert(doc, cursor(10))).toEqual({ kind: "after", at: 14 });
  });

  it("goes after the whole column set from inside a column", () => {
    // p("Hi") 0..4; columns 4..18 (column 5..11, column 11..17); p("end") 18..23.
    const doc = named(
      "doc",
      para(2),
      named("columns", named("column", para(2)), named("column", para(2))),
      para(3),
    );
    expect(planBlockInsert(doc, cursor(8))).toEqual({ kind: "after", at: 18 });
    // The second column's paragraph.
    expect(planBlockInsert(doc, cursor(14))).toEqual({ kind: "after", at: 18 });
  });

  it("does not reuse an empty paragraph that is inside a column", () => {
    // The column set is 2 + (2 + 2) + (2 + 3) = 11 long, so it ends at 11.
    const doc = named("doc", named("columns", named("column", para()), named("column", para(1))));
    expect(planBlockInsert(doc, cursor(3))).toEqual({ kind: "after", at: 11 });
  });

  it("goes after the whole list from inside a list item", () => {
    // bulletList 0..16 (listItem 1..8, listItem 8..15); p("x") 16..19.
    const doc = named(
      "doc",
      named("bulletList", named("listItem", para(3)), named("listItem", para(3))),
      para(1),
    );
    expect(planBlockInsert(doc, cursor(10))).toEqual({ kind: "after", at: 16 });
  });

  it("goes after a section from inside it", () => {
    const doc = named("doc", named("section", para(4)), para(1));
    expect(planBlockInsert(doc, cursor(4))).toEqual({ kind: "after", at: 8 });
  });

  it("goes after a selected top-level node, whose end is the boundary", () => {
    // p("a") 0..3, image 3..4, p("b") 4..7. A node selection runs 3 to 4.
    const doc = named("doc", para(1), atom("image"), para(1));
    expect(planBlockInsert(doc, { from: 3, to: 4 })).toEqual({ kind: "after", at: 4 });
  });

  it("goes after the block holding the end of a selection across blocks", () => {
    const doc = named("doc", para(1), para(1), para(1), para(1));
    expect(planBlockInsert(doc, { from: 1, to: 8 })).toEqual({ kind: "after", at: 9 });
  });

  it("goes after the last block when everything is selected", () => {
    const doc = named("doc", para(1), para(1));
    expect(planBlockInsert(doc, { from: 0, to: 6 })).toEqual({ kind: "after", at: 6 });
  });

  it("goes at the end with no selection", () => {
    const doc = named("doc", para(1), para(1));
    expect(planBlockInsert(doc, null)).toEqual({ kind: "after", at: 6 });
  });

  it("goes at the end when the selection is past the document", () => {
    const doc = named("doc", para(1), para(1));
    expect(planBlockInsert(doc, cursor(99))).toEqual({ kind: "after", at: 6 });
  });

  it("takes over a trailing empty paragraph at the end", () => {
    // p("a") 0..3, p() 3..5.
    const doc = named("doc", para(1), para());
    expect(planBlockInsert(doc, null)).toEqual({ kind: "reuse", cursor: 4 });
  });

  it("takes over an empty paragraph the cursor is on, mid-document", () => {
    const doc = named("doc", para(1), para(), para(1));
    expect(planBlockInsert(doc, cursor(4))).toEqual({ kind: "reuse", cursor: 4 });
  });

  it("only reuses paragraphs, not other empty blocks", () => {
    const doc = named("doc", named("heading"), para(1));
    expect(planBlockInsert(doc, cursor(1))).toEqual({ kind: "after", at: 2 });
  });
});

/** An editor that records its chain, for what insertBlockAfterSelection asks of it. */
function fakeEditor(doc: BlockNodeLike, selection: { from: number; to: number }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chainProxy: unknown = new Proxy(
    {},
    {
      get:
        (_target, name: string) =>
        (...args: unknown[]) => {
          calls.push([name, ...args]);
          return name === "run" ? true : chainProxy;
        },
    },
  );
  // What a block's command left at the new block: a leaf (an image) or not (a heading).
  const added = { isAtom: false as boolean | null };
  Object.assign(doc, { nodeAt: () => (added.isAtom === null ? null : { isAtom: added.isAtom }) });
  const editor = { state: { doc, selection }, chain: () => chainProxy } as unknown as TiptapEditor;
  return { editor, calls, added };
}

const blockWith = (command: BlockItem["command"]): BlockItem =>
  ({ title: "Block", searchTerms: [], command }) as BlockItem;

describe("insertBlockAfterSelection", () => {
  it("adds an empty paragraph after the block and lets the block's command fill it", () => {
    const { editor, calls } = fakeEditor(named("doc", para(5), para(3)), cursor(3));
    const command = vi.fn();
    expect(insertBlockAfterSelection(editor, blockWith(command))).toBe(true);
    expect(calls).toEqual([
      ["focus"],
      ["insertContentAt", 7, { type: "paragraph" }],
      ["setTextSelection", 8],
      ["run"],
    ]);
    expect(command).toHaveBeenCalledWith({ editor, range: { from: 8, to: 8 } });
  });

  it("puts the cursor in an empty paragraph without adding another", () => {
    const { editor, calls } = fakeEditor(named("doc", para()), cursor(1));
    const command = vi.fn();
    expect(insertBlockAfterSelection(editor, blockWith(command))).toBe(true);
    expect(calls).toEqual([["focus"], ["setTextSelection", 1], ["run"]]);
    expect(command).toHaveBeenCalledWith({ editor, range: { from: 1, to: 1 } });
  });

  it("goes to the end when asked, whatever the selection", () => {
    const { editor, calls } = fakeEditor(named("doc", para(5), para(3)), cursor(2));
    insertBlockAfterSelection(editor, blockWith(vi.fn()), { atEnd: true });
    expect(calls[1]).toEqual(["insertContentAt", 12, { type: "paragraph" }]);
  });

  it("keeps the selection on an added leaf when the command selects the next block", () => {
    // A divider inserted before a block that is not text selects that block whole.
    const { editor, calls, added } = fakeEditor(named("doc", para(5), para(3)), cursor(3));
    const state = editor.state as unknown as { selection: object };
    added.isAtom = true;
    const command = vi.fn(() => {
      state.selection = { from: 14, to: 20, node: {} };
    });
    insertBlockAfterSelection(editor, blockWith(command));
    expect(calls.slice(-2)).toEqual([["setNodeSelection", 7], ["run"]]);
  });

  it("keeps the selection on an added leaf when the command moves the cursor into the next block", () => {
    // A divider inserted before a paragraph puts the cursor in that paragraph.
    const { editor, calls, added } = fakeEditor(named("doc", para(5), para(3)), cursor(3));
    const state = editor.state as unknown as { selection: object };
    added.isAtom = true;
    const command = vi.fn(() => {
      state.selection = { from: 9, to: 9 };
    });
    insertBlockAfterSelection(editor, blockWith(command));
    expect(calls.slice(-2)).toEqual([["setNodeSelection", 7], ["run"]]);
  });

  it("leaves the selection alone when the command selected the leaf itself", () => {
    const { editor, calls, added } = fakeEditor(named("doc", para(5), para(3)), cursor(3));
    const state = editor.state as unknown as { selection: object };
    added.isAtom = true;
    // An image, selected whole, is a node selection that starts where the block does.
    const command = vi.fn(() => {
      state.selection = { from: 7, to: 8, node: {} };
    });
    insertBlockAfterSelection(editor, blockWith(command));
    expect(calls.map(([name]) => name)).not.toContain("setNodeSelection");
  });

  it("leaves the cursor where a text block's command put it", () => {
    const { editor, calls, added } = fakeEditor(named("doc", para(5), para(3)), cursor(3));
    const state = editor.state as unknown as { selection: object };
    added.isAtom = false;
    const command = vi.fn(() => {
      state.selection = { from: 8, to: 8 };
    });
    insertBlockAfterSelection(editor, blockWith(command));
    expect(calls.map(([name]) => name)).not.toContain("setNodeSelection");
  });

  it("leaves the selection alone when there is no block where the command ran", () => {
    const { editor, calls, added } = fakeEditor(named("doc", para(5), para(3)), cursor(3));
    added.isAtom = null;
    insertBlockAfterSelection(editor, blockWith(vi.fn()));
    expect(calls.map(([name]) => name)).not.toContain("setNodeSelection");
  });

  it("does nothing for a block with no command", () => {
    const { editor, calls } = fakeEditor(named("doc", para()), cursor(1));
    expect(insertBlockAfterSelection(editor, blockWith(undefined))).toBe(false);
    expect(calls).toEqual([]);
  });
});
