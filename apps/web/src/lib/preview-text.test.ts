import { describe, expect, it } from "vitest";
import { PREVIEW_TEXT_SHOWN, previewTextHint } from "./preview-text";

describe("previewTextHint", () => {
  it("is empty for nothing but whitespace", () => {
    expect(previewTextHint("")).toEqual({ length: 0, hint: "empty" });
    expect(previewTextHint("   ")).toEqual({ length: 0, hint: "empty" });
  });

  it("fits up to the shown length, and is long past it", () => {
    expect(previewTextHint("Your receipt is inside")).toEqual({ length: 22, hint: "fits" });
    expect(previewTextHint("a".repeat(PREVIEW_TEXT_SHOWN)).hint).toBe("fits");
    expect(previewTextHint("a".repeat(PREVIEW_TEXT_SHOWN + 1))).toEqual({
      length: PREVIEW_TEXT_SHOWN + 1,
      hint: "long",
    });
  });

  it("counts what is saved: trimmed, and an emoji once", () => {
    expect(previewTextHint("  Hi 👋  ").length).toBe(4);
  });
});
