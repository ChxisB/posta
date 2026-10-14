import {
  type BlockItem,
  blockquote,
  bulletList,
  button,
  columns,
  divider,
  heading1,
  heading2,
  heading3,
  image,
  orderedList,
  section,
  spacer,
  text,
} from "@maily-to/core/blocks";

/** The blocks the editor offers, by i18n key (`block-editor.slash.<key>`). */
export type EditorBlockKey =
  | "text"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "image"
  | "button"
  | "divider"
  | "spacer"
  | "blockquote"
  | "columns"
  | "section";

/** How the components rail groups blocks (`block-editor.rail.group.<group>`). */
export type EditorBlockGroup = "text" | "media" | "layout";

export interface EditorBlock {
  key: EditorBlockKey;
  group: EditorBlockGroup;
  /** Maily's own definition: its command, search terms and nothing we copy. */
  block: BlockItem;
}

/**
 * The curated blocks, in slash-menu order. The slash menu and the components
 * rail both read this list, so a block added here shows up in both.
 */
export const EDITOR_BLOCKS: readonly EditorBlock[] = [
  { key: "text", group: "text", block: text },
  { key: "heading1", group: "text", block: heading1 },
  { key: "heading2", group: "text", block: heading2 },
  { key: "heading3", group: "text", block: heading3 },
  { key: "bulletList", group: "text", block: bulletList },
  { key: "orderedList", group: "text", block: orderedList },
  { key: "image", group: "media", block: image },
  { key: "button", group: "media", block: button },
  { key: "divider", group: "layout", block: divider },
  { key: "spacer", group: "layout", block: spacer },
  { key: "blockquote", group: "text", block: blockquote },
  { key: "columns", group: "layout", block: columns },
  { key: "section", group: "layout", block: section },
];

/** The rail's groups, in the order they show. */
export const EDITOR_BLOCK_GROUPS: readonly EditorBlockGroup[] = ["text", "media", "layout"];

/**
 * The blocks whose title, description or Maily search terms contain `query`,
 * ignoring case, in list order. An empty query keeps them all. No dependency:
 * thirteen blocks need nothing smarter than `includes`.
 */
export function filterBlocks(
  blocks: readonly EditorBlock[],
  query: string,
  labels: (key: EditorBlockKey) => { title: string; desc: string },
): EditorBlock[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...blocks];
  return blocks.filter(({ key, block }) => {
    const { title, desc } = labels(key);
    return [title, desc, ...block.searchTerms].some((text) => text.toLowerCase().includes(needle));
  });
}
