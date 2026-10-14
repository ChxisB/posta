import { describe, expect, it } from "vitest";
import { type DocNodeLike, nodeRange } from "./commands";

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
