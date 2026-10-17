import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  contrast,
  declaredNames,
  PAIRS,
  parseColour,
  resolve,
  type Theme,
  themeTokens,
} from "./contrast";

const css = readFileSync(new URL("../styles/tokens/colors.css", import.meta.url), "utf8");
const themes = themeTokens(css);
const THEMES: Theme[] = ["dark", "light"];

describe("contrast helpers", () => {
  it("matches WCAG's reference ratios", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBe(1);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("composites a translucent colour over the surface", () => {
    expect(contrast("rgba(0, 0, 0, 0)", "#ffffff")).toBe(1);
    expect(contrast("rgba(0, 0, 0, 0.5)", "#ffffff")).toBeCloseTo(
      contrast("#808080", "#ffffff"),
      1,
    );
  });

  it("reads the colour out of a box-shadow", () => {
    expect(parseColour("0 0 0 2px rgba(112, 70, 232, 0.5)")).toEqual({
      rgb: [112, 70, 232],
      alpha: 0.5,
    });
  });
});

describe("theme tokens", () => {
  it("light redefines every colour dark declares", () => {
    const { dark, light } = declaredNames(css);
    expect(dark.length).toBeGreaterThan(40);
    expect(dark.filter((name) => !light.includes(name))).toEqual([]);
  });

  it("resolves the accent's earlier name to the accent text colour", () => {
    for (const theme of THEMES) {
      expect(resolve(themes[theme], "steel")).toBe(resolve(themes[theme], "accent-text"));
    }
  });
});

describe.each(THEMES)("%s theme contrast", (theme) => {
  const tokens = themes[theme];
  it.each(PAIRS)("$fg on $bg reaches $min:1", ({ fg, bg, min }) => {
    const ratio = contrast(resolve(tokens, fg), resolve(tokens, bg));
    expect(
      ratio,
      `--po-${fg} on --po-${bg} is ${ratio.toFixed(2)}:1 in ${theme}`,
    ).toBeGreaterThanOrEqual(min);
  });
});
