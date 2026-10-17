import { describe, expect, it } from "vitest";
import { sketchOf } from "./starter-sketch";

const text = (value: string) => ({ type: "text", text: value });
const para = (...content: unknown[]) => ({ type: "paragraph", content });
const doc = (...content: unknown[]) => ({ type: "doc", content });

describe("sketchOf", () => {
  it("draws one row per top-level block, in order", () => {
    const rows = sketchOf(
      doc(
        { type: "heading", attrs: { level: 1 }, content: [text("Hi")] },
        para(text("Short")),
        { type: "bulletList", content: [{ type: "listItem" }, { type: "listItem" }] },
        { type: "blockquote", content: [para(text("Quoted"))] },
        { type: "button", attrs: { text: "Go" } },
        { type: "horizontalRule" },
      ),
    );
    expect(rows).toEqual([
      { kind: "heading", level: 1 },
      { kind: "text", lines: 1 },
      { kind: "list", items: 2 },
      { kind: "quote" },
      { kind: "button" },
      { kind: "divider" },
    ]);
  });

  it("keeps the heading level, and reads an odd level as a first-level heading", () => {
    const level = (value: unknown) =>
      sketchOf(doc({ type: "heading", attrs: { level: value }, content: [] }))[0];
    expect(level(2)).toEqual({ kind: "heading", level: 2 });
    expect(level(3)).toEqual({ kind: "heading", level: 3 });
    expect(level(1)).toEqual({ kind: "heading", level: 1 });
    expect(level(9)).toEqual({ kind: "heading", level: 1 });
    expect(level("2")).toEqual({ kind: "heading", level: 2 });
    expect(sketchOf(doc({ type: "heading", content: [] }))[0]).toEqual({
      kind: "heading",
      level: 1,
    });
  });

  it("gives a paragraph a line for each 42 characters, from one to three", () => {
    const lines = (length: number) =>
      (sketchOf(doc(para(text("x".repeat(length)))))[0] as { lines: number }).lines;
    expect(lines(0)).toBe(1);
    expect(lines(42)).toBe(1);
    expect(lines(43)).toBe(2);
    expect(lines(84)).toBe(2);
    expect(lines(85)).toBe(3);
    expect(lines(4000)).toBe(3);
  });

  it("counts a merge field as a few characters and sums the pieces of a paragraph", () => {
    const field = { type: "variable", attrs: { id: "FIRST_NAME", label: "First name" } };
    const lines = (...content: unknown[]) =>
      (sketchOf(doc(para(...content)))[0] as { lines: number }).lines;
    expect(lines(field)).toBe(1);
    expect(lines(text("x".repeat(30)), field, text("y".repeat(10)))).toBe(2);
  });

  it("draws an ordered list like a bullet one, at most three items", () => {
    const item = { type: "listItem" };
    expect(sketchOf(doc({ type: "orderedList", content: [item] }))).toEqual([
      { kind: "list", items: 1 },
    ]);
    expect(sketchOf(doc({ type: "bulletList", content: [item, item, item, item, item] }))).toEqual([
      { kind: "list", items: 3 },
    ]);
    expect(sketchOf(doc({ type: "bulletList" }))).toEqual([{ kind: "list", items: 1 }]);
  });

  it("stops at the row limit, which is eight unless told otherwise", () => {
    const many = doc(...Array.from({ length: 12 }, () => ({ type: "horizontalRule" })));
    expect(sketchOf(many)).toHaveLength(8);
    expect(sketchOf(many, 3)).toHaveLength(3);
    expect(sketchOf(many, 20)).toHaveLength(12);
  });

  it("skips what it has no row for, without it counting toward the limit", () => {
    const rows = sketchOf(
      doc({ type: "image", attrs: { src: "x" } }, { type: "spacer" }, para(text("a"))),
      1,
    );
    expect(rows).toEqual([{ kind: "text", lines: 1 }]);
  });

  it("draws nothing for a document that is not one", () => {
    for (const value of [null, undefined, 3, "x", [], {}, { content: "x" }]) {
      expect(sketchOf(value)).toEqual([]);
    }
    expect(sketchOf(doc(null, 4, "x", [], para(text("a"))))).toEqual([{ kind: "text", lines: 1 }]);
  });
});
