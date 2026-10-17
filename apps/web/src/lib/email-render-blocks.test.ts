import { describe, expect, it } from "vitest";
import { EDITOR_BLOCKS, type EditorBlockKey } from "../components/maily-editor/blocks";
import { renderEmailDocument } from "./email-render";

const text = (value: string) => ({ type: "text", text: value });
const paragraph = (value: string) => ({ type: "paragraph", content: [text(value)] });
const listItem = (value: string) => ({ type: "listItem", content: [paragraph(value)] });

/**
 * One document per block in the editor's block list, each in the shape the
 * editor stores. `marker` is the text that must come out in the html and the
 * plain-text part; `tag` is the element it must come out in.
 */
const SAMPLES: Record<EditorBlockKey, { node: unknown; marker: string; tag: RegExp }> = {
  text: {
    node: paragraph("Plain words"),
    marker: "Plain words",
    tag: /<p\b[^>]*>[^<]*Plain words/,
  },
  heading1: {
    node: { type: "heading", attrs: { level: 1 }, content: [text("Big title")] },
    marker: "Big title",
    tag: /<h1\b[^>]*>[^<]*Big title/,
  },
  heading2: {
    node: { type: "heading", attrs: { level: 2 }, content: [text("Middle title")] },
    marker: "Middle title",
    tag: /<h2\b[^>]*>[^<]*Middle title/,
  },
  heading3: {
    node: { type: "heading", attrs: { level: 3 }, content: [text("Small title")] },
    marker: "Small title",
    tag: /<h3\b[^>]*>[^<]*Small title/,
  },
  bulletList: {
    node: { type: "bulletList", content: [listItem("First point"), listItem("Second point")] },
    marker: "Second point",
    tag: /<ul\b[\s\S]*<li\b[\s\S]*Second point/,
  },
  orderedList: {
    node: { type: "orderedList", attrs: { start: 1 }, content: [listItem("Step one")] },
    marker: "Step one",
    tag: /<ol\b[\s\S]*<li\b[\s\S]*Step one/,
  },
  image: {
    node: {
      type: "image",
      attrs: { src: "https://example.com/pic.png", alt: "A picture", width: 200 },
    },
    marker: "",
    tag: /<img\b[^>]*src="https:\/\/example\.com\/pic\.png"[^>]*alt="A picture"|<img\b[^>]*alt="A picture"[^>]*src="https:\/\/example\.com\/pic\.png"/,
  },
  button: {
    node: { type: "button", attrs: { text: "Go now", url: "https://example.com/go" } },
    marker: "Go now",
    tag: /<a\b[^>]*href="https:\/\/example\.com\/go"[\s\S]*Go now/,
  },
  divider: { node: { type: "horizontalRule" }, marker: "", tag: /<hr\b/ },
  spacer: {
    node: { type: "spacer", attrs: { height: 40 } },
    marker: "",
    tag: /height:40px/,
  },
  blockquote: {
    node: { type: "blockquote", content: [paragraph("Quoted line")] },
    marker: "Quoted line",
    tag: /<blockquote\b[\s\S]*Quoted line|border-left[\s\S]*Quoted line/,
  },
  columns: {
    node: {
      type: "columns",
      content: [
        { type: "column", content: [paragraph("Left side")] },
        { type: "column", content: [paragraph("Right side")] },
      ],
    },
    marker: "Right side",
    tag: /Left side[\s\S]*Right side/,
  },
  section: {
    node: { type: "section", content: [paragraph("Inside the section")] },
    marker: "Inside the section",
    tag: /Inside the section/,
  },
};

describe("renderEmailDocument, one document per block in the editor's list", () => {
  it("has a sample for every block, and none left over", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(EDITOR_BLOCKS.map((entry) => entry.key).sort());
  });

  for (const { key } of EDITOR_BLOCKS) {
    it(`renders ${key}`, async () => {
      const { node, marker, tag } = SAMPLES[key];
      const { html, text: plain } = await renderEmailDocument({ type: "doc", content: [node] });
      expect(html).toMatch(tag);
      if (marker) expect(plain).toContain(marker);
    });
  }

  it("renders every block together, in order", async () => {
    const nodes = EDITOR_BLOCKS.map(({ key }) => SAMPLES[key].node);
    const { html } = await renderEmailDocument({ type: "doc", content: nodes });
    const at = (needle: string) => html.indexOf(needle);
    const order = [
      "Plain words",
      "Big title",
      "First point",
      "Step one",
      "Go now",
      "Quoted line",
      "Left side",
      "Inside the section",
    ];
    expect(order.map(at).every((index) => index >= 0)).toBe(true);
    expect(order.map(at)).toEqual([...order.map(at)].sort((a, b) => a - b));
  });
});
