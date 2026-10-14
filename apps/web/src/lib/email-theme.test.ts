import { describe, expect, it } from "vitest";
import { mailyDocumentSchema } from "./email-doc";
import {
  canonicalTheme,
  DEFAULT_EMAIL_THEME,
  EMAIL_COLOUR_KEYS,
  EMAIL_FONTS,
  EMAIL_THEME_PRESETS,
  effectiveTheme,
  emailThemeSchema,
  hasValidTheme,
  normaliseHex,
  presetOf,
  sameTheme,
  themeContrastIssues,
  themeOf,
  themeToRenderOptions,
  withField,
  withoutTheme,
  withTheme,
} from "./email-theme";

const DOC = { type: "doc", content: [{ type: "paragraph" }] };

describe("emailThemeSchema", () => {
  it("accepts lowercase six-digit colours, a known font and the named sizes", () => {
    const ok = emailThemeSchema.safeParse({
      page: "#0b0b0e",
      email: "#18181b",
      text: "#e4e4e7",
      heading: "#ffffff",
      link: "#93c5fd",
      button: "#7046e8",
      buttonText: "#ffffff",
      font: "georgia",
      corners: "round",
      spacing: "large",
    });
    expect(ok.success).toBe(true);
  });

  it("accepts an empty theme", () => {
    expect(emailThemeSchema.safeParse({}).success).toBe(true);
  });

  it.each([
    ["upper case", { page: "#FFFFFF" }],
    ["three digits", { page: "#fff" }],
    ["no hash", { page: "ffffff" }],
    ["a name", { page: "red" }],
    ["an rgb()", { text: "rgb(0,0,0)" }],
    ["a css injection", { button: "#000000;background:url(https://x.test/a)" }],
    ["a quote", { link: '#000000"' }],
    ["eight digits", { link: "#000000ff" }],
    ["a number", { heading: 0 }],
    ["an unknown font", { font: "comic-sans" }],
    ["a free font name", { font: "Arial, sans-serif" }],
    ["an unknown corner", { corners: "pill" }],
    ["an unknown spacing", { spacing: "huge" }],
    ["an unknown key", { margin: "0px" }],
    ["null", null],
    ["a string", "dark"],
  ])("rejects %s", (_name, value) => {
    expect(emailThemeSchema.safeParse(value).success).toBe(false);
  });
});

describe("defaults", () => {
  it("has a value for every colour field the panel lists", () => {
    for (const key of EMAIL_COLOUR_KEYS) expect(DEFAULT_EMAIL_THEME[key]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("fills in missing fields", () => {
    expect(effectiveTheme(undefined)).toEqual(DEFAULT_EMAIL_THEME);
    expect(effectiveTheme({ button: "#7046e8" })).toEqual({
      ...DEFAULT_EMAIL_THEME,
      button: "#7046e8",
    });
  });

  it("passes the readability check as shipped", () => {
    expect(themeContrastIssues(undefined)).toEqual([]);
  });
});

describe("canonicalTheme and sameTheme", () => {
  it("drops fields that match the default and returns nothing when none are left", () => {
    expect(canonicalTheme({ button: "#000000", font: "inter" })).toBeUndefined();
    expect(canonicalTheme({ button: "#7046e8", font: "inter" })).toEqual({ button: "#7046e8" });
    expect(canonicalTheme(undefined)).toBeUndefined();
    expect(canonicalTheme({})).toBeUndefined();
  });

  it("treats a theme and its spelled-out default as the same look", () => {
    expect(sameTheme(undefined, {})).toBe(true);
    expect(sameTheme(undefined, DEFAULT_EMAIL_THEME)).toBe(true);
    expect(sameTheme({ corners: "soft" }, undefined)).toBe(false);
  });
});

describe("a theme in a document", () => {
  it("reads none from a document without one, or from anything that is not a document", () => {
    expect(themeOf(DOC)).toBeUndefined();
    expect(themeOf(null)).toBeUndefined();
    expect(themeOf("doc")).toBeUndefined();
    expect(themeOf({ type: "paragraph", theme: { page: "#000000" } })).toBeUndefined();
  });

  it("reads a valid theme, without the fields that equal the default", () => {
    expect(themeOf({ ...DOC, theme: { page: "#0b0b0e", email: "#ffffff" } })).toEqual({
      page: "#0b0b0e",
    });
  });

  it("reads a malformed theme as none, so the render falls back to the default look", () => {
    expect(themeOf({ ...DOC, theme: { page: "red" } })).toBeUndefined();
    expect(themeOf({ ...DOC, theme: "dark" })).toBeUndefined();
  });

  it("withTheme sets the key and leaves the input alone", () => {
    const next = withTheme(DOC, { page: "#0b0b0e" });
    expect(next).toEqual({ ...DOC, theme: { page: "#0b0b0e" } });
    expect(DOC).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("withTheme removes the key for the default look, so choosing it again changes nothing", () => {
    const themed = withTheme(DOC, { page: "#0b0b0e" });
    expect(withTheme(themed, {})).toEqual(DOC);
    expect("theme" in withTheme(themed, undefined)).toBe(false);
    expect(JSON.stringify(withTheme(DOC, { page: "#ffffff" }))).toBe(JSON.stringify(DOC));
  });

  it("withTheme replaces a theme rather than merging into it", () => {
    const a = withTheme(DOC, { page: "#0b0b0e", button: "#7046e8" });
    expect(themeOf(withTheme(a, { button: "#1d4ed8" }))).toEqual({ button: "#1d4ed8" });
  });

  it("withoutTheme drops it, and passes a non-document through", () => {
    expect(withoutTheme({ ...DOC, theme: { page: "#0b0b0e" } })).toEqual(DOC);
    expect(withoutTheme(null)).toBeNull();
    expect(withTheme("x", { page: "#0b0b0e" })).toBe("x");
  });

  it("hasValidTheme is true with no theme, true with a good one, false with a bad one", () => {
    expect(hasValidTheme(DOC)).toBe(true);
    expect(hasValidTheme({ ...DOC, theme: {} })).toBe(true);
    expect(hasValidTheme({ ...DOC, theme: { font: "arial" } })).toBe(true);
    expect(hasValidTheme({ ...DOC, theme: { font: "wingdings" } })).toBe(false);
    expect(hasValidTheme({ ...DOC, theme: null })).toBe(false);
  });
});

describe("mailyDocumentSchema and a theme", () => {
  it("lets a document with a valid theme through, unchanged", () => {
    const doc = { ...DOC, theme: { page: "#0b0b0e", corners: "soft" } };
    const parsed = mailyDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(doc);
  });

  it("refuses a document whose theme could put a string into the html", () => {
    const bad = { ...DOC, theme: { button: "#000;background:url(//x.test)" } };
    expect(mailyDocumentSchema.safeParse(bad).success).toBe(false);
  });

  it("still refuses a legacy document and a non-document", () => {
    expect(mailyDocumentSchema.safeParse({ version: 1, blocks: [] }).success).toBe(false);
    expect(mailyDocumentSchema.safeParse("<p>hi</p>").success).toBe(false);
  });
});

describe("withField", () => {
  it("sets one field and keeps the rest, without changing its input", () => {
    const base = { button: "#7046e8" } as const;
    expect(withField(base, "page", "#0b0b0e")).toEqual({ button: "#7046e8", page: "#0b0b0e" });
    expect(withField(undefined, "font", "georgia")).toEqual({ font: "georgia" });
    expect(base).toEqual({ button: "#7046e8" });
  });

  it("replaces a field already set", () => {
    expect(withField({ page: "#0b0b0e" }, "page", "#f4f4f5")).toEqual({ page: "#f4f4f5" });
  });
});

describe("presets", () => {
  it("are default, dark and soft, each a valid theme", () => {
    expect(EMAIL_THEME_PRESETS.map((p) => p.id)).toEqual(["default", "dark", "soft"]);
    for (const p of EMAIL_THEME_PRESETS)
      expect(emailThemeSchema.safeParse(p.theme).success).toBe(true);
  });

  it("the default preset is the default look", () => {
    expect(sameTheme(EMAIL_THEME_PRESETS[0]?.theme, undefined)).toBe(true);
  });

  it("each clears the 4.5:1 readability check, as a preset must", () => {
    for (const p of EMAIL_THEME_PRESETS) expect(themeContrastIssues(p.theme)).toEqual([]);
  });

  it("presetOf names a preset only when the theme is exactly it", () => {
    expect(presetOf(undefined)).toBe("default");
    expect(presetOf({})).toBe("default");
    expect(presetOf(EMAIL_THEME_PRESETS[1]?.theme)).toBe("dark");
    expect(presetOf(EMAIL_THEME_PRESETS[2]?.theme)).toBe("soft");
    expect(presetOf({ ...EMAIL_THEME_PRESETS[1]?.theme, link: "#ffffff" })).toBeNull();
  });
});

describe("normaliseHex", () => {
  it("accepts what a person types", () => {
    expect(normaliseHex("#ABCDEF")).toBe("#abcdef");
    expect(normaliseHex("abcdef")).toBe("#abcdef");
    expect(normaliseHex(" #7046E8 ")).toBe("#7046e8");
    expect(normaliseHex("#fa0")).toBe("#ffaa00");
  });

  it.each(["", "#", "#12", "#12345", "#1234567", "red", "#ggg", "rgb(0,0,0)", "#00000;"])(
    "rejects %j",
    (input) => {
      expect(normaliseHex(input)).toBeNull();
    },
  );
});

describe("themeContrastIssues", () => {
  it("flags light text on a light email", () => {
    const issues = themeContrastIssues({ text: "#cccccc" });
    expect(issues.map((i) => i.pair)).toEqual(["text"]);
    expect(issues[0]?.ratio).toBeLessThan(4.5);
  });

  it("checks each pair against the email background, and the button text against the button", () => {
    const pairs = themeContrastIssues({
      email: "#18181b",
      text: "#111111",
      heading: "#222222",
      link: "#333333",
      button: "#444444",
      buttonText: "#555555",
    }).map((i) => i.pair);
    expect(pairs.sort()).toEqual(["button", "heading", "link", "text"]);
  });

  it("lists the worst first", () => {
    const issues = themeContrastIssues({ text: "#bbbbbb", heading: "#eeeeee" });
    expect(issues.map((i) => i.pair)).toEqual(["heading", "text"]);
  });

  it("is quiet when the colours read", () => {
    expect(
      themeContrastIssues({
        email: "#18181b",
        text: "#e4e4e7",
        heading: "#ffffff",
        link: "#93c5fd",
      }),
    ).toEqual([]);
  });

  it("catches the usual slip: a dark email whose link colour was left at the default", () => {
    // The default link is near-black, so on a dark email it vanishes (about 1:1).
    const issues = themeContrastIssues({ email: "#18181b", text: "#e4e4e7", heading: "#ffffff" });
    expect(issues.map((i) => i.pair)).toEqual(["link"]);
    expect(issues[0]?.ratio).toBeLessThan(1.1);
  });
});

describe("themeToRenderOptions", () => {
  it("is complete for no theme, so the render never relies on Maily's own defaults", () => {
    const o = themeToRenderOptions(undefined);
    expect(o.colors).toEqual({ heading: "#111827", paragraph: "#374151" });
    expect(o.container).toEqual({ backgroundColor: "#ffffff", borderRadius: "0px" });
    expect(o.body).toEqual({ backgroundColor: "#ffffff", paddingTop: "0px", paddingBottom: "0px" });
    expect(o.button).toEqual({ backgroundColor: "#000000", color: "#ffffff" });
    expect(o.link).toEqual({ color: "#111827" });
    expect(o.font.fontFamily).toBe("Inter");
    expect(o.font.webFont?.url).toContain("rsms.me");
  });

  it("maps each field to its place", () => {
    const o = themeToRenderOptions({
      page: "#0b0b0e",
      email: "#18181b",
      text: "#e4e4e7",
      heading: "#ffffff",
      link: "#93c5fd",
      button: "#7046e8",
      buttonText: "#fafafa",
      corners: "round",
      spacing: "medium",
    });
    expect(o.body.backgroundColor).toBe("#0b0b0e");
    expect(o.container.backgroundColor).toBe("#18181b");
    expect(o.colors).toEqual({ heading: "#ffffff", paragraph: "#e4e4e7" });
    expect(o.link.color).toBe("#93c5fd");
    expect(o.button).toEqual({ backgroundColor: "#7046e8", color: "#fafafa" });
    expect(o.container.borderRadius).toBe("20px");
    expect(o.body.paddingTop).toBe("24px");
    expect(o.body.paddingBottom).toBe("24px");
  });

  it("gives a system font no web font, and Inter its web font again", () => {
    for (const f of EMAIL_FONTS) {
      const o = themeToRenderOptions({ font: f.id });
      expect(o.font.fontFamily).toBe(f.name);
      expect(o.font.fallbackFontFamily).toBe(f.fallback);
      if (f.id === "inter") expect(o.font.webFont).toBeDefined();
      else expect(o.font.webFont).toBeUndefined();
    }
  });

  it("does not hand out the shared web font object", () => {
    const a = themeToRenderOptions(undefined).font.webFont;
    const b = themeToRenderOptions(undefined).font.webFont;
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
