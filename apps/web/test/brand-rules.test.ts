/**
 * The brand, as rules the build enforces. Each rule is a detector in
 * src/test-support/brand-rules.ts; every one runs here twice: on the real
 * tree, which must be clean, and on a deliberate violation, which it must
 * catch. A rule that only ever sees clean input proves nothing.
 *
 * Contrast between the token pairs is src/test-support/contrast.test.ts; this
 * file covers the colours that live outside the tokens, the documents that
 * describe them, and the surfaces that cannot read CSS variables (email, the
 * docs app).
 */

import { accountMailCard, EMAIL_COLOURS } from "@posta/core";
import { describe, expect, it } from "vitest";
import {
  assetRefs,
  designRows,
  docsPalette,
  filesUnder,
  GRADIENT_ALLOWED_IN,
  HEX_ALLOWED_IN,
  HEX_EXEMPT_FILES,
  hexLiterals,
  isHex,
  KNOWN_MISSING_ASSETS,
  missingAssets,
  oldBrandHits,
  PLAIN_HEX,
  plainTokens,
  readRepoFile,
  strayHexes,
  stripCssComments,
  tokenHexes,
  undefinedTokens,
  usesGradient,
} from "@/test-support/brand-rules";
import {
  contrast,
  declaredNames,
  resolve,
  TEXT,
  type Theme,
  themeTokens,
} from "@/test-support/contrast";

const COLORS_CSS = readRepoFile("apps/web/src/styles/tokens/colors.css");
const THEMES = themeTokens(COLORS_CSS);
const TOKEN_HEXES = tokenHexes(COLORS_CSS);
const DESIGN = readRepoFile("apps/web/DESIGN.md");
const THEME_LIST: Theme[] = ["dark", "light"];

const SOURCE = [".ts", ".tsx", ".css", ".mjs", ".json"];
/** Where the product's own code, styles and copy live. */
const SOURCE_DIRS = [
  "apps/web/src",
  "apps/web/messages",
  "apps/docs/src",
  "packages/core/src",
  "packages/cli/scripts",
  "packages/cli/src",
  "packages/i18n/src",
];
const files = (dirs: string[], extensions = SOURCE) =>
  dirs.flatMap((dir) => filesUnder(dir, extensions));

/** Colour is scanned everywhere except the token files themselves. */
const COLOUR_FILES = files([
  "apps/web/src",
  "apps/docs/src",
  "packages/core/src",
  "packages/cli/scripts",
]).filter(
  (file) =>
    !file.includes("styles/tokens/") &&
    !file.includes("/test-support/") &&
    !(file in HEX_EXEMPT_FILES),
);

describe("the old brand", () => {
  it("finds the previous product's name and display font", () => {
    expect(oldBrandHits("Welcome to MillionSend")).toEqual(["MillionSend"]);
    expect(oldBrandHits("font-family: Erode, serif")).toEqual(["Erode"]);
    expect(oldBrandHits("src: url(/fonts/Erode-Variable.woff2)")).toEqual(["Erode"]);
  });

  it("lets the logo files RB18 still has to replace through, and nothing else", () => {
    expect(oldBrandHits('icon: "/logo/millionsend-favicon.svg"')).toEqual([]);
    expect(oldBrandHits("/logo/millionsend-wordmark-light.svg")).toEqual([]);
    expect(oldBrandHits("millionsend-newthing.svg")).toEqual(["millionsend"]);
    expect(oldBrandHits('const name = "millionsend"')).toEqual(["millionsend"]);
  });

  it("is absent from the code, styles and copy", () => {
    // The guard names the old brand to look for it.
    const hits = files(SOURCE_DIRS)
      .filter((file) => !file.includes("/test-support/"))
      .flatMap((file) => {
        const found = oldBrandHits(readRepoFile(file));
        return found.length ? [`${file}: ${[...new Set(found)].join(", ")}`] : [];
      });
    expect(hits).toEqual([]);
  });

  it("names neither the old display font nor the old hover word in DESIGN.md", () => {
    const hits = oldBrandHits(DESIGN);
    expect(hits.filter((hit) => hit.toLowerCase() === "erode")).toEqual([]);
    expect(DESIGN.toLowerCase()).not.toContain("rollover");
  });
});

describe("colours outside the tokens", () => {
  it("flags a hex that is not a token, black or white, or allowed for the file", () => {
    expect(strayHexes("a.css", "color: #ff00aa; border: 1px solid #000000", TOKEN_HEXES)).toEqual([
      "#ff00aa",
    ]);
    expect(strayHexes("a.css", "color: #f4f4f6; mask: #ffffff", TOKEN_HEXES)).toEqual([]);
    // An 8-digit colour is a colour too, and a numeric character reference is not.
    expect(strayHexes("a.css", "box-shadow: 0 0 #ff00aa80", TOKEN_HEXES)).toEqual(["#ff00aa80"]);
    expect(strayHexes("a.html", "&#128512; and &#x1f600;", TOKEN_HEXES)).toEqual([]);
    expect(
      strayHexes("a.css", "color: #4285f4", TOKEN_HEXES, {
        "a.css": { hexes: ["#4285f4"], why: "x" },
      }),
    ).toEqual([]);
  });

  it("holds across the product's code and styles", () => {
    const stray = COLOUR_FILES.flatMap((file) => {
      const found = strayHexes(file, readRepoFile(file), TOKEN_HEXES);
      return found.length ? [`${file}: ${found.join(" ")}`] : [];
    });
    expect(stray, "use a --po-* token, or give the file a reason in HEX_ALLOWED_IN").toEqual([]);
  });

  it("allows only colours a file still uses, each with a reason", () => {
    for (const [file, { hexes, why }] of Object.entries(HEX_ALLOWED_IN)) {
      expect(why.length, `${file} needs a reason`).toBeGreaterThan(10);
      const present = new Set(hexLiterals(readRepoFile(file)));
      expect(
        hexes.filter((hex) => !present.has(hex)),
        `${file} allows colours it no longer has`,
      ).toEqual([]);
    }
  });

  it("exempts only files that still hold colours, each with a reason", () => {
    for (const [file, why] of Object.entries(HEX_EXEMPT_FILES)) {
      expect(why.length, `${file} needs a reason`).toBeGreaterThan(10);
      expect(
        hexLiterals(readRepoFile(file)).length,
        `${file} no longer needs its exemption`,
      ).toBeGreaterThan(0);
    }
  });

  it("keeps the allowance to black and white", () => {
    expect(PLAIN_HEX).toEqual(["#000000", "#ffffff"]);
  });
});

describe("the gradient", () => {
  it("is recognised by its tokens and by the Coral and Rose values", () => {
    expect(usesGradient("background: var(--po-brand-gradient)")).toBe(true);
    expect(usesGradient("fill: var(--po-brand-coral)")).toBe(true);
    expect(usesGradient("stop-color: #FF6A3D")).toBe(true);
    expect(usesGradient("stop-color: #e8458b")).toBe(true);
    expect(usesGradient("background: var(--po-accent)")).toBe(false);
  });

  it("is used only by the files that are allowed to", () => {
    const users = COLOUR_FILES.filter((file) => usesGradient(readRepoFile(file)));
    expect(users.filter((file) => !GRADIENT_ALLOWED_IN.includes(file))).toEqual([]);
  });

  it("never sits behind a button or a control", () => {
    const components = stripCssComments(readRepoFile("apps/web/src/styles/components.css"));
    expect(usesGradient(components)).toBe(false);
  });
});

describe("tokens the code reads", () => {
  const css = files(["apps/web/src"], [".css"]).map(readRepoFile);
  const code = files(["apps/web/src"], [".ts", ".tsx"]).map(readRepoFile);

  it("finds a token nothing defines, and ignores one with a fallback or set at runtime", () => {
    expect(undefinedTokens({ css: [".a{color:var(--po-nope)}"], code: [] })).toEqual(["nope"]);
    expect(undefinedTokens({ css: [".a{color:var(--po-nope, red)}"], code: [] })).toEqual([]);
    expect(
      undefinedTokens({
        css: [".a{width:var(--po-w)}"],
        code: ['style={{ "--po-w": "10px" }}'],
      }),
    ).toEqual([]);
    expect(undefinedTokens({ css: [".a{--po-x:1;color:var(--po-x)}"], code: [] })).toEqual([]);
  });

  it("are all defined", () => {
    expect(undefinedTokens({ css, code })).toEqual([]);
  });

  it("are defined in light for everything dark defines", () => {
    const { dark, light } = declaredNames(COLORS_CSS);
    expect(dark.filter((name) => !light.includes(name))).toEqual([]);
    expect(light.filter((name) => !dark.includes(name))).toEqual([]);
  });
});

describe("DESIGN.md", () => {
  const rows = designRows(DESIGN);
  const plain = plainTokens([
    readRepoFile("apps/web/src/styles/tokens/typography.css"),
    readRepoFile("apps/web/src/styles/tokens/spacing.css"),
    readRepoFile("apps/web/src/styles/tokens/motion.css"),
  ]);
  const byToken = (token: string) => rows.filter((row) => row.token === token);

  it("reads a token table", () => {
    expect(designRows("| `--po-bone` | #f4f4f6 | #16161d |\n| plain | row |\n")).toEqual([
      { token: "bone", cells: ["#f4f4f6", "#16161d"] },
    ]);
  });

  it("has the three brand colours as the CSS declares them", () => {
    for (const name of ["coral", "rose", "violet"]) {
      const [row] = byToken(`brand-${name}`);
      expect(row, `--po-brand-${name} is missing from the brand table`).toBeDefined();
      expect(row?.cells[0]?.toLowerCase()).toBe(THEMES.dark[`brand-${name}`]?.toLowerCase());
    }
  });

  it("lists every colour in the theme table with the value each theme has", () => {
    const themed = rows.filter(
      (row) => row.cells.length >= 2 && isHex(row.cells[0] ?? "") && isHex(row.cells[1] ?? ""),
    );
    expect(themed.length).toBeGreaterThanOrEqual(9);
    for (const { token, cells } of themed) {
      for (const [index, theme] of THEME_LIST.entries()) {
        expect(
          cells[index]?.toLowerCase(),
          `--po-${token} in ${theme}: DESIGN.md and colors.css disagree`,
        ).toBe(resolve(THEMES[theme], token).toLowerCase());
      }
    }
  });

  it("gives every type size and radius the value the CSS has, and none is left out", () => {
    const scale = Object.keys(plain).filter(
      (name) => /^(?:fs|r)-/.test(name) && name !== "fs-input-touch",
    );
    expect(scale.length).toBeGreaterThan(10);
    const listed = new Set(rows.map((row) => row.token));
    expect(
      scale.filter((name) => !listed.has(name)),
      "not in DESIGN.md",
    ).toEqual([]);
    for (const name of scale) {
      const [row] = byToken(name);
      const px = (value: string | undefined) => /(\d+)px/.exec(value ?? "")?.[1] ?? value;
      expect(px(row?.cells[0]), `--po-${name}: DESIGN.md and the CSS disagree`).toBe(
        px(plain[name]),
      );
    }
  });

  it("names no token the CSS does not define", () => {
    const names = [...DESIGN.matchAll(/`--po-([\w-]+)`/g)].map((match) => match[1] ?? "");
    const known = new Set([...Object.keys(THEMES.dark), ...Object.keys(plain)]);
    expect([...new Set(names)].filter((name) => !known.has(name))).toEqual([]);
  });

  it("is checked against the real files", () => {
    // A table the parser cannot read would make every comparison above vacuous.
    expect(rows.length).toBeGreaterThan(25);
  });
});

describe("the docs app", () => {
  const palette = docsPalette(readRepoFile("apps/docs/src/app/global.css"));
  /** Each docs variable and the dashboard token it should carry. */
  const MAP: Record<string, string> = {
    background: "void",
    foreground: "bone",
    card: "panel",
    "card-foreground": "bone",
    popover: "panel",
    "popover-foreground": "bone",
    border: "line",
    "muted-foreground": "muted",
    "secondary-foreground": "bone",
    "accent-foreground": "bone",
    primary: "accent-text",
  };

  it("reads the docs variables out of both blocks", () => {
    expect(
      docsPalette(":root{--color-fd-primary:#AABBCC}.dark{--color-fd-primary:#112233}"),
    ).toEqual({
      light: { primary: "#aabbcc" },
      dark: { primary: "#112233" },
    });
  });

  it.each(THEME_LIST)("matches the dashboard's tokens in %s", (theme) => {
    const values = palette[theme === "dark" ? "dark" : "light"];
    expect(Object.keys(values).length).toBeGreaterThan(12);
    for (const [variable, token] of Object.entries(MAP)) {
      // Primary is the brand violet on light and its lifted tint on dark: the accent text colour in dark.
      const expected = variable === "primary" && theme === "light" ? "accent" : token;
      expect(values[variable], `--color-fd-${variable} in ${theme}`).toBe(
        resolve(THEMES[theme], expected).toLowerCase(),
      );
    }
  });

  it.each(THEME_LIST)("keeps its text readable in %s", (theme) => {
    const values = palette[theme];
    const pairs = [
      ["foreground", "background"],
      ["card-foreground", "card"],
      ["muted-foreground", "background"],
      ["primary-foreground", "primary"],
      ["primary", "background"],
    ] as const;
    for (const [fg, bg] of pairs) {
      const ratio = contrast(values[fg] ?? "", values[bg] ?? "");
      expect(
        ratio,
        `--color-fd-${fg} on --color-fd-${bg} is ${ratio.toFixed(2)}:1 in ${theme}`,
      ).toBeGreaterThanOrEqual(TEXT);
    }
  });
});

describe("system email", () => {
  it.each(THEME_LIST)("uses the dashboard's colours in %s", (theme) => {
    const email = EMAIL_COLOURS[theme];
    const tokens = THEMES[theme];
    expect(email.page).toBe(resolve(tokens, "void"));
    expect(email.card).toBe(resolve(tokens, "panel"));
    expect(email.text).toBe(resolve(tokens, "bone"));
    expect(email.muted).toBe(resolve(tokens, "muted"));
    expect(email.link).toBe(resolve(tokens, "accent-text"));
    expect(email.button).toBe(resolve(THEMES.dark, "accent"));
    expect(email.onButton).toBe(resolve(THEMES.dark, "on-accent"));
  });

  it.each(THEME_LIST)("reads at 4.5:1 or better in %s", (theme) => {
    const email = EMAIL_COLOURS[theme];
    const pairs = [
      ["text", "card"],
      ["muted", "card"],
      ["link", "card"],
      ["onButton", "button"],
    ] as const;
    for (const [fg, bg] of pairs) {
      const ratio = contrast(email[fg], email[bg]);
      expect(ratio, `${fg} on ${bg} is ${ratio.toFixed(2)}:1 in ${theme}`).toBeGreaterThanOrEqual(
        TEXT,
      );
    }
  });

  it("is rendered with literal token colours and no CSS variables", () => {
    const { html } = accountMailCard({
      heading: "Heading",
      paragraphs: ["Body"],
      button: "Open",
      url: "https://example.com/a",
      linkFallback: "Or paste this link",
      muted: ["Small print"],
    });
    expect(html).not.toContain("var(--");
    expect(strayHexes("email.html", html, TOKEN_HEXES)).toEqual([]);
    // Both themes' colours are in the markup: light inline, dark in the media query.
    for (const colour of [
      EMAIL_COLOURS.light.text,
      EMAIL_COLOURS.dark.text,
      EMAIL_COLOURS.dark.page,
    ]) {
      expect(html).toContain(colour);
    }
  });

  it("would be caught if a stray colour or a variable got in", () => {
    const bad = '<p style="color:#ff00aa;background:var(--po-panel)">x</p>';
    expect(strayHexes("email.html", bad, TOKEN_HEXES)).toEqual(["#ff00aa"]);
    expect(bad).toContain("var(--");
  });
});

describe("public files the code names", () => {
  const WEB = "apps/web/public";
  const refs = (dirs: string[], extensions = [".ts", ".tsx", ".css", ".mjs"]) =>
    assetRefs(files(dirs, extensions).map(readRepoFile).join("\n"));

  it("finds a path in source", () => {
    expect(
      assetRefs(
        'a="/logo/x.svg" b="/email/y.png" c="/og.png" d="/favicon.ico" e="/api/logo/z.svg"',
      ),
    ).toEqual(expect.arrayContaining(["/logo/x.svg", "/email/y.png", "/og.png"]));
  });

  it("reports one that is missing", () => {
    expect(missingAssets(WEB, ["/logo/does-not-exist.svg", "/og.png"])).toEqual([
      "logo/does-not-exist.svg",
    ]);
  });

  it("exist, apart from the ones RB18 supplies with the logo", () => {
    const missing = missingAssets(WEB, refs(["apps/web/src", "packages/core/src"]));
    // Exact, so a new gap fails and a file that arrives has to leave the list.
    expect(missing.sort()).toEqual(KNOWN_MISSING_ASSETS);
  });

  it("exist for the docs app", () => {
    expect(missingAssets("apps/docs/public", refs(["apps/docs/src"]))).toEqual([]);
  });

  it("include the favicon and the social image both layouts name", () => {
    const web = readRepoFile("apps/web/src/app/layout.tsx");
    const docs = readRepoFile("apps/docs/src/app/[lang]/layout.tsx");
    expect(assetRefs(web)).toEqual(expect.arrayContaining(["/og.png"]));
    expect(assetRefs(docs)).toEqual(expect.arrayContaining(["/og.png"]));
    expect(missingAssets(WEB, assetRefs(web))).toEqual([]);
    expect(missingAssets("apps/docs/public", assetRefs(docs))).toEqual([]);
  });
});
