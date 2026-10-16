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
  BOOK_TOKENS,
  bookGaps,
  designRows,
  docsPalette,
  EXCLAMATIONS_ALLOWED_IN,
  exclamationKeys,
  filesUnder,
  fontGaps,
  GRADIENT_ALLOWED_IN,
  HEX_ALLOWED_IN,
  HEX_EXEMPT_FILES,
  hexLiterals,
  isHex,
  KNOWN_BOOK_GAPS,
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
  it("finds the previous display font, by name and by file", () => {
    expect(oldBrandHits("font-family: Erode, serif")).toEqual(["Erode"]);
    expect(oldBrandHits("src: url(/fonts/Erode-Variable.woff2)")).toEqual(["Erode"]);
    expect(oldBrandHits("font-family: Geist, sans-serif")).toEqual([]);
    expect(oldBrandHits('icon: "/logo/posta-favicon.svg"')).toEqual([]);
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

  it("is absent from DESIGN.md, and DESIGN.md does not use the old hover word", () => {
    expect(oldBrandHits(DESIGN)).toEqual([]);
    expect(DESIGN.toLowerCase()).not.toContain("rollover");
  });

  it("is absent from the README, the contributor and self-hosting guides and the docs", () => {
    const documents = [
      "README.md",
      "CONTRIBUTING.md",
      "SELF_HOSTING.md",
      ...filesUnder("apps/docs/content", [".md", ".mdx", ".json"]),
    ];
    const hits = documents.flatMap((file) => {
      const found = oldBrandHits(readRepoFile(file));
      return found.length ? [`${file}: ${[...new Set(found)].join(", ")}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it("has no font file named for it in either app's public folder", () => {
    const named = [
      ...filesUnder("apps/web/public", [""]),
      ...filesUnder("apps/docs/public", [""]),
    ].filter((file) => /\berode\b/i.test(file));
    expect(named).toEqual([]);
  });
});

describe("colours outside the tokens", () => {
  it("flags a hex that is not a token, black or white, or allowed for the file", () => {
    expect(strayHexes("a.css", "color: #ff00aa; border: 1px solid #000000", TOKEN_HEXES)).toEqual([
      "#ff00aa",
    ]);
    expect(strayHexes("a.css", "color: #e6e9f0; mask: #ffffff", TOKEN_HEXES)).toEqual([]);
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

  it("runs Coral, Rose, Violet as the Brand Book has it", () => {
    expect(
      ["brand-coral", "brand-rose", "brand-violet"].map((name) =>
        resolve(THEMES.dark, name).toLowerCase(),
      ),
    ).toEqual(["#ff6a3d", "#e8458b", "#7046e8"]);
  });

  it("is the same in both themes, since it belongs to the mark and not to the page", () => {
    for (const name of ["brand-coral", "brand-rose", "brand-violet"]) {
      expect(resolve(THEMES.light, name), `--po-${name}`).toBe(resolve(THEMES.dark, name));
    }
  });
});

describe("the Brand Book", () => {
  const read = (theme: Theme, token: string) => {
    try {
      return resolve(THEMES[theme], token);
    } catch {
      return undefined;
    }
  };
  const typography = readRepoFile("apps/web/src/styles/tokens/typography.css");
  const stack = (name: string) =>
    new RegExp(`--po-${name}:\\s*([^;]+);`).exec(typography)?.[1]?.trim() ?? "";

  it("sets every colour as a hex, in both themes", () => {
    for (const [token, values] of Object.entries(BOOK_TOKENS)) {
      for (const theme of THEME_LIST) {
        expect(isHex(values[theme]), `${token} in ${theme}`).toBe(true);
        expect(values[theme], `${token} in ${theme} is lower case`).toBe(
          values[theme].toLowerCase(),
        );
      }
    }
  });

  it("reads at 4.5:1 or better in its own palette, so bringing it across cannot fail contrast", () => {
    const grounds = ["void", "panel", "panel-raised"];
    for (const theme of THEME_LIST) {
      const at = (token: string) => BOOK_TOKENS[token]?.[theme] ?? "";
      for (const fg of ["bone", "muted", "accent"]) {
        for (const bg of grounds) {
          const ratio = contrast(at(fg), at(bg));
          expect(
            ratio,
            `${fg} on ${bg} is ${ratio.toFixed(2)}:1 in ${theme}`,
          ).toBeGreaterThanOrEqual(TEXT);
        }
      }
      for (const bg of ["void", "panel"]) {
        const ratio = contrast(at("faint"), at(bg));
        expect(ratio, `faint on ${bg} is ${ratio.toFixed(2)}:1 in ${theme}`).toBeGreaterThanOrEqual(
          TEXT,
        );
      }
      const ink = contrast(at("on-accent"), at("accent"));
      expect(ink, `on-accent on accent is ${ink.toFixed(2)}:1 in ${theme}`).toBeGreaterThanOrEqual(
        TEXT,
      );
    }
  });

  it("finds a token that is not the book's, and one that is not defined", () => {
    const book = (theme: Theme, token: string) => BOOK_TOKENS[token]?.[theme];
    expect(bookGaps(book)).toEqual([]);
    expect(
      bookGaps((theme, token) =>
        token === "bone" && theme === "dark" ? "#ffffff" : book(theme, token),
      ),
    ).toEqual(["bone.dark"]);
    expect(
      bookGaps((theme, token) => (token === "line-soft" ? undefined : book(theme, token))),
    ).toEqual(["line-soft.dark", "line-soft.light"]);
  });

  it("finds a stack that does not lead with the book's face", () => {
    expect(
      fontGaps({ sans: '"Geist Variable", system-ui', mono: '"Geist Mono", monospace' }),
    ).toEqual([]);
    expect(
      fontGaps({ sans: "Geist, sans-serif", mono: '"Geist Mono Variable", monospace' }),
    ).toEqual([]);
    expect(fontGaps({ sans: "Inter, sans-serif", mono: '"JetBrains Mono", monospace' })).toEqual([
      "font-sans",
      "font-mono",
    ]);
    // Geist Mono is not Geist: a sans stack that leads with the mono face is wrong.
    expect(fontGaps({ sans: '"Geist Mono", monospace', mono: '"Geist Mono", monospace' })).toEqual([
      "font-sans",
    ]);
  });

  it("is matched by the product's tokens and fonts, apart from the known gaps", () => {
    const found = [
      ...bookGaps(read),
      ...fontGaps({ sans: stack("font-sans"), mono: stack("font-mono") }),
    ];
    // Exact, so a new difference fails and a value brought across has to leave the list.
    expect(found.sort()).toEqual([...KNOWN_BOOK_GAPS].sort());
  });
});

describe("the voice", () => {
  it("finds an exclamation mark in a catalogue, by its path", () => {
    expect(exclamationKeys({ a: { b: "Done!" }, c: ["Fine.", "Wow!"], d: 3, e: null })).toEqual([
      "a.b",
      "c.1",
    ]);
    expect(exclamationKeys({ a: "Saved." })).toEqual([]);
  });

  it("has none in the English copy, success states included, except where one is quoted", () => {
    const found = filesUnder("apps/web/messages/en", [".json"]).flatMap((file) =>
      exclamationKeys(JSON.parse(readRepoFile(file))).map((key) => `${file}:${key}`),
    );
    expect(found.filter((entry) => !(entry in EXCLAMATIONS_ALLOWED_IN))).toEqual([]);
  });

  it("allows only strings that still have one, each with a reason", () => {
    for (const [entry, why] of Object.entries(EXCLAMATIONS_ALLOWED_IN)) {
      expect(why.length, `${entry} needs a reason`).toBeGreaterThan(10);
      const [file = "", key = ""] = entry.split(":");
      expect(
        exclamationKeys(JSON.parse(readRepoFile(file))),
        `${entry} no longer has an exclamation mark`,
      ).toContain(key);
    }
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
    expect(designRows("| `--po-bone` | #e6e9f0 | #16181d |\n| plain | row |\n")).toEqual([
      { token: "bone", cells: ["#e6e9f0", "#16181d"] },
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
    expect(email.button).toBe(resolve(tokens, "accent"));
    expect(email.onButton).toBe(resolve(tokens, "on-accent"));
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

const LOGO_DIR = "apps/web/public/logo";
const LOGO_FILES = [
  "posta-avatar-512.png",
  "posta-avatar.svg",
  "posta-banner.svg",
  "posta-favicon.svg",
  "posta-mark.svg",
  "posta-wordmark-light.svg",
  "posta-wordmark.svg",
];
/** The Brand Book's gradient, in order, and the only other colours a logo file may carry. */
const LOGO_GRADIENT = ["#FF6A3D", "#E8458B", "#7046E8"];
const LOGO_COLOURS = new Set([...LOGO_GRADIENT, "#0A0C10", "#FFFFFF"]);
const SVG_LOGOS = [
  ...filesUnder(LOGO_DIR, [".svg"]),
  ...filesUnder("apps/docs/public/logo", [".svg"]),
];

describe("the logo files", () => {
  it("are the set the apps name, and nothing else", () => {
    expect(filesUnder(LOGO_DIR, [""]).map((file) => file.slice(LOGO_DIR.length + 1))).toEqual(
      LOGO_FILES,
    );
    expect(filesUnder("apps/docs/public/logo", [""])).toEqual([
      "apps/docs/public/logo/posta-favicon.svg",
    ]);
  });

  it("are drawn as paths: no text, no embedded image, no script, no outside reference", () => {
    for (const file of SVG_LOGOS) {
      const svg = readRepoFile(file);
      expect(svg, file).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      for (const banned of [
        /<text[\s>]/,
        /<image[\s>]/,
        /<script[\s>]/,
        /font-family/,
        /href=/,
        /url\(\s*["']?https?:/,
      ]) {
        expect(svg, `${file} ${banned}`).not.toMatch(banned);
      }
    }
  });

  it("use the Brand Book's colours only, and its gradient in its order", () => {
    for (const file of SVG_LOGOS) {
      const svg = readRepoFile(file);
      const colours = svg.match(/#[0-9A-Fa-f]{6}\b/g) ?? [];
      expect(
        colours.filter((colour) => !LOGO_COLOURS.has(colour.toUpperCase())),
        file,
      ).toEqual([]);
      const stops = [...svg.matchAll(/<stop [^>]*stop-color="(#[0-9A-Fa-f]{6})"/g)].map((m) =>
        (m[1] as string).toUpperCase(),
      );
      expect(stops, file).toEqual(LOGO_GRADIENT);
    }
  });

  it("keep the Brand Book's mark: its viewBox and its two strokes", () => {
    const mark = readRepoFile(`${LOGO_DIR}/posta-mark.svg`);
    expect(mark).toContain('viewBox="3.5 0 172 160"');
    expect(mark).toContain('transform="skewX(-12)"');
    expect(mark).toContain("M11,5 H84 M25,22 H84 M39,39 H84");
    expect(mark).toContain("M80,144 V16 H132 A36,36 0 0 1 132,88 H80");
    expect(mark).toContain('stroke-width="10"');
    expect(mark).toContain('stroke-width="32"');
  });

  it("draw the favicon as the P alone, in a rounded tile, as the book does under 20px", () => {
    const favicon = readRepoFile(`${LOGO_DIR}/posta-favicon.svg`);
    expect(favicon).toContain('viewBox="0 0 16 16"');
    expect(favicon).toContain('rx="3.5"');
    expect(favicon).toContain('transform="skewX(-12)"');
    expect(favicon).toContain("M7.4,11.8 V4.2 H10.45 A2.05,2.05 0 0 1 10.45,8.3 H7.4");
    // No stripes: at this size they close up.
    expect(favicon).not.toContain("H84");
    // The docs app carries the same file.
    expect(readRepoFile("apps/docs/public/logo/posta-favicon.svg")).toBe(favicon);
  });

  it("set the avatar's mark at half the tile's height, with the book's 22.5% corners", () => {
    const avatar = readRepoFile(`${LOGO_DIR}/posta-avatar.svg`);
    const mark = readRepoFile(`${LOGO_DIR}/posta-mark.svg`);
    expect(avatar).toContain('viewBox="0 0 1024 1024"');
    expect(avatar).toContain(`rx="${1024 * 0.225}"`);
    // The mark is 160 tall; at 3.2 it is 512, half of 1024.
    expect(avatar).toContain("scale(3.2)");
    // The same strokes as the mark itself, so the two cannot drift apart.
    for (const stroke of [
      "M11,5 H84 M25,22 H84 M39,39 H84",
      "M80,144 V16 H132 A36,36 0 0 1 132,88 H80",
    ]) {
      expect(mark).toContain(stroke);
      expect(avatar).toContain(stroke);
    }
  });

  it("differ between the two wordmarks only in the word's fill", () => {
    const onDark = readRepoFile(`${LOGO_DIR}/posta-wordmark.svg`);
    const onLight = readRepoFile(`${LOGO_DIR}/posta-wordmark-light.svg`);
    expect(onDark.replace('fill="#FFFFFF"', 'fill="#0A0C10"')).toBe(onLight);
  });

  it("each give their gradient an id of their own, so two inline copies cannot clash", () => {
    const ids = SVG_LOGOS.flatMap((file) =>
      [...readRepoFile(file).matchAll(/<linearGradient[^>]*\bid="([^"]+)"/g)].map(
        (m) => m[1] as string,
      ),
    );
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toMatch(/^posta-[a-z]+-gradient$/);
  });

  it("include a banner the README shows", () => {
    const readme = readRepoFile("README.md");
    const banner = /src="(apps\/web\/public\/logo\/[^"]+)"/.exec(readme)?.[1];
    expect(banner).toBe(`${LOGO_DIR}/posta-banner.svg`);
    expect(filesUnder(LOGO_DIR, [".svg"])).toContain(banner);
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

  it("exist, apart from the email images the product site serves", () => {
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
