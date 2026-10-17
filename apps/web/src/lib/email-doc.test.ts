import { describe, expect, it } from "vitest";
import { authoredState } from "./email-doc";

const DOC = { type: "doc", content: [{ type: "paragraph" }] };

describe("authoredState", () => {
  it("leaves out a block body's rendered html and text", () => {
    const a = authoredState({ name: "A", html: "<table>1</table>", text: "1", document: DOC });
    const b = authoredState({ name: "A", html: "<table>2</table>", text: "2", document: DOC });
    expect(a).toEqual(b);
    expect(a.name).toBe("A");
  });

  it("keeps an html body's source, which is what was authored", () => {
    const state = { html: "<p>Hi</p>", text: "Hi", document: null };
    expect(authoredState(state)).toBe(state);
  });
});
