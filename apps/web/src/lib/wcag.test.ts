import { describe, expect, it } from "vitest";
import { contrast } from "@/test-support/contrast";
import { contrastRatio, luminance, TEXT_CONTRAST } from "./wcag";

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#7046e8", "#7046e8")).toBe(1);
  });

  it("does not depend on the order", () => {
    expect(contrastRatio("#374151", "#ffffff")).toBe(contrastRatio("#ffffff", "#374151"));
  });

  it("matches the dashboard's own token check, which parses CSS", () => {
    const pairs: [string, string][] = [
      ["#374151", "#ffffff"],
      ["#111827", "#ffffff"],
      ["#7046e8", "#ffffff"],
      ["#93c5fd", "#18181b"],
      ["#777777", "#888888"],
      ["#ff0000", "#00ff00"],
    ];
    for (const [a, b] of pairs) expect(contrastRatio(a, b)).toBeCloseTo(contrast(a, b), 9);
  });

  it("puts the default email text well over the readable line", () => {
    expect(contrastRatio("#374151", "#ffffff")).toBeGreaterThan(TEXT_CONTRAST);
    expect(contrastRatio("#9ca3af", "#ffffff")).toBeLessThan(TEXT_CONTRAST);
  });
});

describe("luminance", () => {
  it("runs from 0 to 1", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1, 10);
  });
});
