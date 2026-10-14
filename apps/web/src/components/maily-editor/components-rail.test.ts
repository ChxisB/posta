import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TiptapEditor } from "./commands";

// The real English catalog, so the test reads what a customer reads.
const en = (await import("../../../messages/en/block-editor.json")).default;
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  return {
    ...actual,
    useTranslations: (namespace: string) =>
      actual.createTranslator({
        locale: "en",
        messages: { "block-editor": en },
        namespace,
      } as never),
  };
});

const { ComponentsRail } = await import("./components-rail");

// Only what the rail reads from an editor when it renders.
const editor = { isFocused: false, on: () => {}, off: () => {} } as unknown as TiptapEditor;

const render = (props: { editor: TiptapEditor | null; defaultQuery?: string }) =>
  renderToStaticMarkup(createElement(ComponentsRail, props));

const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);

describe("ComponentsRail", () => {
  it("shows all thirteen blocks, in three groups, each a button named for what it adds", () => {
    const html = render({ editor });
    expect(buttons(html)).toHaveLength(13);
    for (const name of [
      "Add Text",
      "Add Heading 1",
      "Add Heading 2",
      "Add Heading 3",
      "Add Bullet list",
      "Add Numbered list",
      "Add Image",
      "Add Button",
      "Add Divider",
      "Add Spacer",
      "Add Quote",
      "Add Columns",
      "Add Section",
    ]) {
      expect(html).toContain(`aria-label="${name}"`);
    }
    const groups = [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);
    expect(groups).toEqual(["Text", "Media and buttons", "Layout"]);
  });

  it("is a labelled region with a labelled search", () => {
    const html = render({ editor });
    expect(html).toContain('aria-labelledby="po-blocks-title"');
    expect(html).toContain('id="po-blocks-title"');
    expect(html).toMatch(/<input[^>]*type="search"[^>]*aria-label="Search blocks"/);
  });

  it("hides its icons from assistive technology", () => {
    const html = render({ editor });
    const svgs = [...html.matchAll(/<svg\b[^>]*>/g)].map((m) => m[0]);
    // Thirteen block icons and the search glyph.
    expect(svgs).toHaveLength(14);
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"');
  });

  it("is operable with a keyboard: real buttons that are not taken out of the tab order", () => {
    for (const tag of buttons(render({ editor }))) {
      expect(tag).toContain('type="button"');
      expect(tag).not.toContain("tabindex");
      expect(tag).not.toContain("disabled");
    }
  });

  it("explains how it adds, and says so politely", () => {
    expect(render({ editor })).toContain(
      "Adds after the block you are in. You can also type / in the email.",
    );
  });

  it("waits, disabled, while the block editor is not showing", () => {
    const html = render({ editor: null });
    const all = buttons(html);
    expect(all).toHaveLength(13);
    for (const tag of all) expect(tag).toContain("disabled");
    expect(html).toContain("Open the Edit view to add blocks.");
    expect(html).not.toContain("Adds after the block you are in");
  });

  it("filters by the search, dropping groups with nothing in them", () => {
    const html = render({ editor, defaultQuery: "head" });
    expect(buttons(html)).toHaveLength(3);
    expect(html).toContain("Add Heading 2");
    expect(html).not.toContain("Add Image");
    const groups = [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);
    expect(groups).toEqual(["Text"]);
  });

  it("says when nothing matches", () => {
    const html = render({ editor, defaultQuery: "zzzz" });
    expect(buttons(html)).toHaveLength(0);
    expect(html).toContain("Nothing matches &quot;zzzz&quot;.");
    expect(html).not.toContain("<h3");
  });

  it("has a live region for a screen reader to hear an insert", () => {
    expect(render({ editor })).toContain('class="po-blocks-live" role="status"');
  });
});
