import { describe, expect, it } from "vitest";
import enBlockEditor from "../../../messages/en/block-editor.json";
import { EDITOR_BLOCK_GROUPS, EDITOR_BLOCKS, type EditorBlockKey, filterBlocks } from "./blocks";
import { BLOCK_ICONS } from "./icons";

const catalogs = { en: enBlockEditor };

// The slash menu's order before the list moved here: the menu must not change.
const SLASH_ORDER: EditorBlockKey[] = [
  "text",
  "heading1",
  "heading2",
  "heading3",
  "bulletList",
  "orderedList",
  "image",
  "button",
  "divider",
  "spacer",
  "blockquote",
  "columns",
  "section",
];

const labels = (key: EditorBlockKey) => ({
  title: enBlockEditor.slash[key].title,
  desc: enBlockEditor.slash[key].desc,
});

describe("EDITOR_BLOCKS", () => {
  it("lists the thirteen blocks in the slash menu's order", () => {
    expect(EDITOR_BLOCKS.map((entry) => entry.key)).toEqual(SLASH_ORDER);
  });

  it("gives every block a Maily command to run", () => {
    for (const { key, block } of EDITOR_BLOCKS) {
      expect(typeof block.command, key).toBe("function");
      expect(Array.isArray(block.searchTerms), key).toBe(true);
    }
  });

  it("puts every block in a group the rail shows, and fills every group", () => {
    for (const entry of EDITOR_BLOCKS) expect(EDITOR_BLOCK_GROUPS).toContain(entry.group);
    for (const group of EDITOR_BLOCK_GROUPS) {
      expect(
        EDITOR_BLOCKS.some((entry) => entry.group === group),
        group,
      ).toBe(true);
    }
  });

  it("has an icon for every block", () => {
    for (const { key } of EDITOR_BLOCKS) expect(typeof BLOCK_ICONS[key], key).toBe("function");
    expect(Object.keys(BLOCK_ICONS).sort()).toEqual([...SLASH_ORDER].sort());
  });

  it.each(Object.entries(catalogs))("has every block's and group's strings in %s", (_locale, c) => {
    for (const { key } of EDITOR_BLOCKS) {
      expect(c.slash[key].title, key).toBeTruthy();
      expect(c.slash[key].desc, key).toBeTruthy();
    }
    for (const group of EDITOR_BLOCK_GROUPS) expect(c.rail.group[group], group).toBeTruthy();
  });
});

describe("filterBlocks", () => {
  const keys = (query: string) => filterBlocks(EDITOR_BLOCKS, query, labels).map((e) => e.key);

  it("keeps every block for an empty or blank query", () => {
    expect(keys("")).toEqual(SLASH_ORDER);
    expect(keys("   ")).toEqual(SLASH_ORDER);
  });

  it("matches a title, ignoring case and outer spaces", () => {
    expect(keys("  HEADING ")).toEqual(["heading1", "heading2", "heading3"]);
    expect(keys("column")).toEqual(["columns"]);
  });

  it("matches Maily's search terms", () => {
    expect(keys("cta")).toEqual(["button"]);
    expect(keys("h2")).toEqual(["heading2"]);
  });

  it("matches a description", () => {
    expect(keys("rule")).toEqual(["divider"]);
  });

  it("keeps list order", () => {
    expect(keys("list")).toEqual(["bulletList", "orderedList"]);
  });

  it("finds nothing for a word no block has", () => {
    expect(keys("zzzz")).toEqual([]);
  });
});
