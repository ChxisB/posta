import { describe, expect, it } from "vitest";
import { firstBodyTab } from "./template-mode";

const MAILY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

describe("firstBodyTab", () => {
  it("opens a new template on the editor", () => {
    expect(firstBodyTab()).toBe("edit");
  });

  it("opens an html-authored row on its preview", () => {
    expect(firstBodyTab({ document: null, html: "<p>x</p>" })).toBe("preview");
    // A legacy document that is not Maily JSON is html-authored too.
    expect(firstBodyTab({ document: { version: 2, blocks: [] }, html: "<p>x</p>" })).toBe(
      "preview",
    );
  });

  it("opens a block row, or an empty body, on the editor", () => {
    expect(firstBodyTab({ document: MAILY_DOC, html: "<p>x</p>" })).toBe("edit");
    expect(firstBodyTab({ document: null, html: "  " })).toBe("edit");
  });
});
