import { describe, expect, it } from "vitest";
import { stableStringify } from "./stable-json";

describe("stableStringify", () => {
  it("ignores key order, at every depth", () => {
    const emitted = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
    };
    // The same document as a jsonb column returns it.
    const stored = {
      content: [{ content: [{ text: "Hi", type: "text" }], type: "paragraph" }],
      type: "doc",
    };
    expect(stableStringify(emitted)).toBe(stableStringify(stored));
  });

  it("still sees a changed value", () => {
    expect(stableStringify({ type: "text", text: "Hi" })).not.toBe(
      stableStringify({ type: "text", text: "Hi!" }),
    );
  });

  it("keeps array order", () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it("matches JSON.stringify once keys are sorted, and for scalars", () => {
    expect(stableStringify({ b: 1, a: [true, null] })).toBe('{"a":[true,null],"b":1}');
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify("x")).toBe('"x"');
  });

  it("drops undefined fields as JSON.stringify does", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });
});
