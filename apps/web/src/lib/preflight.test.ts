import { describe, expect, it } from "vitest";
import { buildMergeOptions } from "./merge-fields";
import {
  GMAIL_CLIP_BYTES,
  type PreflightInput,
  type PreflightIssue,
  preflight,
  preflightCounts,
  SIZE_NEAR_BYTES,
  scanMergeTokens,
} from "./preflight";

// Maily document builders, loose like the stored JSON.
type Node = Record<string, unknown>;
const doc = (...content: Node[]) => ({ type: "doc", content });
const p = (...content: Node[]) => ({ type: "paragraph", content });
const t = (text: string, marks?: Node[]): Node => ({ type: "text", text, ...(marks && { marks }) });
const link = (href: string, attrs: Node = {}): Node => ({
  type: "link",
  attrs: { href, ...attrs },
});
const bold: Node = { type: "bold" };
const variable = (id: string, fallback?: string): Node => ({
  type: "variable",
  attrs: { id, ...(fallback !== undefined && { fallback }) },
});
const button = (attrs: Node): Node => ({ type: "button", attrs: { text: "Go", ...attrs } });
const image = (attrs: Node): Node => ({
  type: "image",
  attrs: { src: "https://cdn.example.com/hero.png", alt: "A hero", ...attrs },
});

const FIELDS = buildMergeOptions(["plan", "company"]);

/** A template with nothing to flag, to change one thing at a time. */
const CLEAN: PreflightInput = {
  subject: "Welcome",
  previewText: "A short line for the inbox",
  document: doc(p(t("Hello"))),
  html: "<p>Hello</p>",
  mergeFields: FIELDS,
};

const run = (over: Partial<PreflightInput> = {}) => preflight({ ...CLEAN, ...over });
const ids = (issues: PreflightIssue[]) => issues.map((i) => i.id);
const inBody = (...content: Node[]) => run({ document: doc(...content) });

describe("a clean template", () => {
  it("has no issues", () => {
    expect(run()).toEqual([]);
  });

  it("has none with no document either, as an html-authored body", () => {
    expect(run({ document: null, html: "<p>Hello</p>" })).toEqual([]);
  });
});

describe("subject and preview text", () => {
  it.each([[""], ["   "]])("warns about a subject of %j", (subject) => {
    const [issue, ...rest] = run({ subject });
    expect(rest).toEqual([]);
    expect(issue).toMatchObject({
      id: "subject-empty",
      severity: "warn",
      at: { scope: "subject" },
    });
  });

  it("warns, not errors, so a template whose sends bring their own subject is not marked broken", () => {
    expect(run({ subject: "" })[0]?.severity).toBe("warn");
  });

  it("warns about an empty preview text, at its field", () => {
    expect(run({ previewText: " " })).toMatchObject([
      { id: "preview-text-empty", severity: "warn", at: { scope: "previewText" } },
    ]);
  });

  it("warns about a preview text past what inboxes show, counting code points", () => {
    const at130 = "a".repeat(130);
    expect(run({ previewText: at130 })).toEqual([]);
    expect(run({ previewText: `${at130}a` })).toMatchObject([
      { id: "preview-text-long", params: { length: 131, shown: 130 } },
    ]);
    // 130 emoji are 260 UTF-16 units but 130 characters.
    expect(run({ previewText: "😀".repeat(130) })).toEqual([]);
  });

  it("checks the merge tokens in both fields", () => {
    const issues = run({ subject: "Hi {{{NOPE}}}", previewText: "Hi {{first}}" });
    expect(issues).toMatchObject([
      { id: "merge-field-unknown", at: { scope: "subject" } },
      { id: "merge-field-braces", at: { scope: "previewText" } },
    ]);
  });

  it("is clean for a subject with a built-in and a custom field with its fallback", () => {
    expect(run({ subject: "Hi {{{FIRST_NAME}}}, your {{{plan|free}}} plan" })).toEqual([]);
  });
});

describe("size", () => {
  const html = (bytes: number) => "a".repeat(bytes);

  it.each([
    ["well under", 1_000, []],
    ["one byte under the near mark", SIZE_NEAR_BYTES - 1, []],
    ["at the near mark", SIZE_NEAR_BYTES, ["size-near"]],
    ["at the clip itself, which Gmail still shows whole", GMAIL_CLIP_BYTES, ["size-near"]],
    ["one byte over the clip", GMAIL_CLIP_BYTES + 1, ["size-over"]],
  ])("%s", (_name, bytes, expected) => {
    expect(ids(run({ html: html(bytes) }))).toEqual(expected);
  });

  it("measures bytes, not characters", () => {
    // Half the clip in characters, over it in UTF-8 (two bytes each).
    const text = "é".repeat(GMAIL_CLIP_BYTES / 2 + 1);
    expect(text.length).toBeLessThan(GMAIL_CLIP_BYTES);
    expect(ids(run({ html: text }))).toEqual(["size-over"]);
  });

  it("is an error over the clip and a warning near it, both about the whole email", () => {
    expect(run({ html: html(GMAIL_CLIP_BYTES + 1) })).toMatchObject([
      { severity: "error", at: { scope: "email" }, params: { size: 102, limit: 102 } },
    ]);
    expect(run({ html: html(SIZE_NEAR_BYTES) })).toMatchObject([
      { severity: "warn", at: { scope: "email" }, params: { size: 90, limit: 102 } },
    ]);
  });

  it("measures nothing before there is html", () => {
    expect(run({ html: "" })).toEqual([]);
  });
});

describe("links", () => {
  // The same addresses, as a link in text and as a button's link.
  const carriers: [string, (href: string) => Node[], string][] = [
    ["a link in text", (href) => [p(t("Read", [link(href)]))], "link"],
    ["a button", (href) => [button({ url: href })], "button"],
  ];
  const addresses: [string, string[]][] = [
    ["https://example.com", []],
    ["http://example.com", ["link-insecure"]],
    ["mailto:hi@example.com", []],
    ["tel:+441234567890", []],
    ["", ["link-empty"]],
    ["   ", ["link-empty"]],
    ["mailto:", ["link-invalid"]],
    ["javascript:alert(1)", ["link-invalid"]],
    ["example.com", ["link-invalid"]],
    ["/pricing", ["link-invalid"]],
    ["#top", ["link-invalid"]],
    ["https://", ["link-invalid"]],
    ["{{{UNSUBSCRIBE_URL}}}", []],
    ["{{{RESEND_UNSUBSCRIBE_URL}}}", []],
    ["https://example.com/?e={{{EMAIL}}}", []],
    ["{{{company|https://example.com}}}/pricing", []],
    ["{{{NOPE}}}", ["merge-field-unknown"]],
    ["https://example.com/{{{ bad }}}", ["merge-field-malformed"]],
  ];

  for (const [carrier, build, node] of carriers) {
    describe(carrier, () => {
      it.each(addresses)("%j", (href, expected) => {
        const issues = inBody(...build(href));
        expect(ids(issues)).toEqual(expected);
        for (const issue of issues) expect(issue.at).toMatchObject({ scope: "node", node });
      });
    });
  }

  it("flags an unlabelled address by what it is, not by the (empty) text", () => {
    const [issue] = inBody(p(t("Read the guide here", [link("example.com")])));
    expect(issue?.context).toBe("example.com");
  });

  it("names the link's text when its address is missing", () => {
    const [issue] = inBody(p(t("Read the guide", [link("")])));
    expect(issue).toMatchObject({ id: "link-empty", context: "Read the guide" });
  });

  it("checks one link split by bold into several text nodes once", () => {
    const marks = [link("example.com")];
    const issues = inBody(p(t("Read ", marks), t("the guide", [bold, ...marks]), t(" now", marks)));
    expect(ids(issues)).toEqual(["link-invalid"]);
  });

  it("checks two different bad links side by side separately", () => {
    const issues = inBody(p(t("one", [link("a.com")]), t("two", [link("b.com")])));
    expect(ids(issues)).toEqual(["link-invalid", "link-invalid"]);
  });

  it("reads a variable address as a merge field's name", () => {
    const known = inBody(p(t("Go", [link("plan", { isUrlVariable: true })])));
    expect(known.map((i) => i.id)).toEqual(["merge-field-no-fallback"]);
    const unknown = inBody(button({ url: "nope", isUrlVariable: true }));
    expect(ids(unknown)).toEqual(["merge-field-unknown"]);
  });

  it("checks a link card's link", () => {
    const issues = inBody({ type: "linkCard", attrs: { link: "nope.com", title: "Docs" } });
    expect(issues).toMatchObject([
      { id: "link-invalid", context: "nope.com", at: { node: "linkCard" } },
    ]);
  });

  it("locates a link through columns and a section by its path", () => {
    const column = (...content: Node[]) => ({ type: "column", content });
    const issues = inBody(
      p(t("fine")),
      { type: "columns", content: [column(p(t("a"))), column(p(t("b")), p(t("c", [link("")])))] },
      { type: "section", content: [p(t("d")), p(t("e", [link("x.com")]))] },
    );
    expect(issues.map((i) => (i.at.scope === "node" ? i.at.path : null))).toEqual([
      // Columns 1 > column 1 > paragraph 1 > text 0, then section 2 > paragraph 1 > text 0.
      [1, 1, 1, 0],
      [2, 1, 0],
    ]);
  });

  it("does not read the raw html of an html block as text or links", () => {
    const issues = inBody({
      type: "htmlCodeBlock",
      content: [t('<a href="">{{{ bad </a>', [link("")])],
    });
    expect(issues).toEqual([]);
  });
});

describe("images", () => {
  it("is clean with a source and alt text", () => {
    expect(inBody(image({}))).toEqual([]);
  });

  it.each([[""], ["  "]])(
    "an image with a source of %j is an error, with no alt warning on top",
    (src) => {
      expect(inBody(image({ src, alt: "" }))).toMatchObject([
        { id: "image-src-missing", severity: "error", at: { node: "image" } },
      ]);
    },
  );

  it("warns about missing alt text, naming the file", () => {
    expect(inBody(image({ alt: "" }))).toMatchObject([
      {
        id: "image-alt-missing",
        severity: "warn",
        context: "hero.png",
        params: { node: "image" },
      },
    ]);
  });

  it("takes a title as the description, as the renderer does", () => {
    expect(inBody(image({ alt: "", title: "Our hero shot" }))).toEqual([]);
  });

  it.each([
    ["a relative path", "/hero.png", ["image-src-invalid"]],
    ["a data uri", "data:image/png;base64,AAAA", ["image-src-invalid"]],
    ["a mailto address", "mailto:a@b.com", ["image-src-invalid"]],
    ["a plain http image", "http://cdn.example.com/hero.png", []],
    ["a token leading the address", "{{{company}}}/hero.png", ["merge-field-no-fallback"]],
    ["a malformed token", "https://x.com/{{{ bad }}}.png", ["merge-field-malformed"]],
  ])("%s", (_name, src, expected) => {
    expect(ids(inBody(image({ src })))).toEqual(expected);
  });

  it("reads a variable source as a merge field's name", () => {
    expect(ids(inBody(image({ src: "company|", isSrcVariable: true })))).toEqual([
      "merge-field-unknown",
    ]);
    expect(ids(inBody(image({ src: "EMAIL", isSrcVariable: true })))).toEqual([]);
  });

  it("checks the link an image carries, but not an empty one", () => {
    expect(inBody(image({ externalLink: "" }))).toEqual([]);
    expect(inBody(image({ externalLink: "shop.com" }))).toMatchObject([
      { id: "link-invalid", at: { node: "image" } },
    ]);
  });

  it("treats a logo like an image, and ignores a link it cannot have", () => {
    const logo = (attrs: Node): Node => ({ type: "logo", attrs });
    expect(inBody(logo({ src: "https://x.com/l.png", alt: "" }))).toMatchObject([
      { id: "image-alt-missing", at: { node: "logo" } },
    ]);
    expect(inBody(logo({ src: "https://x.com/l.png", alt: "Acme", externalLink: "bad" }))).toEqual(
      [],
    );
  });

  it("treats an inline image like an image", () => {
    const inline = (attrs: Node): Node => ({ type: "inlineImage", attrs });
    expect(ids(inBody(p(inline({ src: "", alt: "" }))))).toEqual(["image-src-missing"]);
    expect(ids(inBody(p(inline({ src: "https://x.com/i.png", alt: "" }))))).toEqual([
      "image-alt-missing",
    ]);
  });
});

describe("merge fields", () => {
  it("does not flag a built-in with no fallback", () => {
    expect(inBody(p(t("Hi "), variable("FIRST_NAME"), variable("EMAIL")))).toEqual([]);
  });

  it("warns about a contact property with no fallback, and not with one", () => {
    expect(inBody(p(variable("plan")))).toMatchObject([
      { id: "merge-field-no-fallback", severity: "warn", params: { name: "plan" } },
    ]);
    expect(inBody(p(variable("plan", "free")))).toEqual([]);
    expect(ids(inBody(p(variable("plan", ""))))).toEqual(["merge-field-no-fallback"]);
  });

  it("errors on a name nobody has", () => {
    expect(inBody(p(variable("NOPE")))).toMatchObject([
      {
        id: "merge-field-unknown",
        severity: "error",
        messageKey: "merge-field-unknown",
        params: { name: "NOPE" },
      },
    ]);
  });

  it.each([
    ["first_name", "FIRST_NAME"],
    ["FirstName", "FIRST_NAME"],
    ["Plan", "plan"],
    ["COMPANY", "company"],
  ])("suggests %s's likely spelling", (name, suggestion) => {
    expect(inBody(p(variable(name)))).toMatchObject([
      { messageKey: "merge-field-unknown-suggest", params: { name, suggestion } },
    ]);
  });

  it("checks tokens typed into text the same way", () => {
    expect(ids(inBody(p(t("Hi {{{FIRST_NAME|friend}}}, {{{plan}}} {{{NOPE}}}"))))).toEqual([
      "merge-field-unknown",
      "merge-field-no-fallback",
    ]);
  });

  it("accepts the Resend unsubscribe alias the worker replaces by hand", () => {
    expect(inBody(p(t("{{{RESEND_UNSUBSCRIBE_URL}}}")))).toEqual([]);
  });

  it.each([
    ["spaces inside", "{{{ FIRST_NAME }}}"],
    ["a dash in the name", "{{{first-name}}}"],
    ["an opening brace in the fallback", "{{{plan|a{b}}}"],
    ["a closing brace in the fallback", "{{{plan|a}b}}}"],
    ["no closing braces", "Hi {{{FIRST_NAME"],
    ["four opening braces", "{{{{FIRST_NAME}}}"],
  ])("errors on a malformed token: %s", (_name, text) => {
    const found = ids(inBody(p(t(text))));
    expect(found).toContain("merge-field-malformed");
  });

  it("warns, once, about two braces, which the worker leaves as typed", () => {
    expect(inBody(p(t("Hi {{first_name}}")))).toMatchObject([
      { id: "merge-field-braces", severity: "warn", context: "{{first_name}}" },
    ]);
  });

  it("does not take the inside of a good token for two braces", () => {
    expect(inBody(p(t("{{{FIRST_NAME}}} and {{{plan|x}}}")))).toEqual([]);
  });

  it("checks a button's label, which can be a variable", () => {
    expect(ids(inBody(button({ url: "https://x.com", text: "Hi {{{NOPE}}}" })))).toEqual([
      "merge-field-unknown",
    ]);
    expect(
      ids(inBody(button({ url: "https://x.com", text: "NOPE", isTextVariable: true }))),
    ).toEqual(["merge-field-unknown"]);
  });

  it("checks a variable inside an html block, but not the block's markup", () => {
    const block = { type: "htmlCodeBlock", content: [t("<b>{{{ bad</b>"), variable("NOPE")] };
    expect(ids(inBody(block))).toEqual(["merge-field-unknown"]);
  });

  it("follows the field list it is given", () => {
    const plain = inBody(p(variable("tier", "gold")));
    expect(ids(plain)).toEqual(["merge-field-unknown"]);
    const withTier = preflight({
      ...CLEAN,
      document: doc(p(variable("tier", "gold"))),
      mergeFields: buildMergeOptions(["tier"]),
    });
    expect(withTier).toEqual([]);
  });
});

describe("an html-authored body", () => {
  const source = (html: string) => run({ document: null, html });

  it("reads tokens from the source, once per name, for the whole email", () => {
    const issues = source("<p>{{{NOPE}}} and {{{NOPE}}} and {{{plan}}}</p>");
    expect(issues).toMatchObject([
      { id: "merge-field-unknown", at: { scope: "email" }, params: { name: "NOPE" } },
      { id: "merge-field-no-fallback", at: { scope: "email" }, params: { name: "plan" } },
    ]);
  });

  it("flags two braces and a malformed token", () => {
    expect(ids(source("<p>Hi {{name}} {{{ x }}}</p>")).sort()).toEqual([
      "merge-field-braces",
      "merge-field-malformed",
    ]);
  });

  it("does not look at links or images, which have no nodes to point at", () => {
    expect(source('<a href="">x</a><img src="">')).toEqual([]);
  });

  it("treats a legacy block document the same way", () => {
    const legacy = { version: 1, blocks: [] };
    expect(ids(run({ document: legacy, html: "<p>{{{NOPE}}}</p>" }))).toEqual([
      "merge-field-unknown",
    ]);
  });

  it("still measures size", () => {
    expect(ids(source("a".repeat(GMAIL_CLIP_BYTES + 1)))).toEqual(["size-over"]);
  });
});

describe("the list", () => {
  const mixed = () =>
    run({
      subject: "",
      previewText: "",
      document: doc(p(t("a", [link("x.com")])), image({ alt: "" }), button({ url: "" })),
      html: "a".repeat(GMAIL_CLIP_BYTES + 1),
    });

  it("lists errors before warnings, each in the order found", () => {
    expect(ids(mixed())).toEqual([
      "link-invalid",
      "link-empty",
      "size-over",
      "subject-empty",
      "preview-text-empty",
      "image-alt-missing",
    ]);
  });

  it("gives every issue a message, a severity and a place", () => {
    for (const issue of mixed()) {
      expect(issue.messageKey).toBeTruthy();
      expect(["error", "warn"]).toContain(issue.severity);
      expect(["email", "subject", "previewText", "node"]).toContain(issue.at.scope);
      if (issue.at.scope === "node") {
        expect(Array.isArray(issue.at.path)).toBe(true);
        expect(issue.at.node).toBeTruthy();
      }
    }
  });

  it("counts errors and warnings", () => {
    expect(preflightCounts(mixed())).toEqual({ errors: 3, warnings: 3 });
    expect(preflightCounts([])).toEqual({ errors: 0, warnings: 0 });
  });
});

describe("a stored document that is not what the editor writes", () => {
  it("does not throw on odd content", () => {
    const odd = { type: "doc", content: [null, 4, "x", [], { type: 7 }, { type: "text" }, p()] };
    expect(() => run({ document: odd })).not.toThrow();
    expect(run({ document: odd })).toEqual([]);
  });

  it("does not throw on a document nested far deeper than any email", () => {
    let node: Node = p(t("deep", [link("x.com")]));
    for (let i = 0; i < 300; i += 1) node = { type: "blockquote", content: [node] };
    expect(() => run({ document: doc(node) })).not.toThrow();
  });
});

describe("scanMergeTokens", () => {
  it("reads names and fallbacks", () => {
    expect(scanMergeTokens("a {{{A}}} b {{{b_1|hello there}}}")).toEqual({
      tokens: [
        { name: "A", fallback: undefined },
        { name: "b_1", fallback: "hello there" },
      ],
      malformed: null,
      braces: null,
    });
  });

  it("keeps the first malformed group as typed", () => {
    expect(scanMergeTokens("{{{ a }}} {{{ b }}}").malformed).toBe("{{{ a }}}");
  });
});

describe("theme contrast", () => {
  const themed = (theme: Record<string, string>, ...content: Node[]) =>
    run({ document: { ...doc(...(content.length ? content : [p(t("Hello"))])), theme } });

  it("is quiet for a theme that reads", () => {
    expect(
      themed({
        email: "#18181b",
        text: "#e4e4e7",
        heading: "#ffffff",
        link: "#93c5fd",
        button: "#ffffff",
        buttonText: "#111827",
      }),
    ).toEqual([]);
  });

  it("warns about a dark email whose link colour was left at the default, and points at the link colour", () => {
    const [issue, ...rest] = themed({ email: "#18181b", text: "#e4e4e7", heading: "#ffffff" });
    expect(rest).toEqual([]);
    expect(issue).toMatchObject({
      id: "theme-contrast-low",
      severity: "warn",
      messageKey: "theme-contrast-link",
      at: { scope: "theme", field: "link" },
      params: { ratio: 1 },
    });
  });

  it("names the pair, and points text at its colour and a button at the button's text colour", () => {
    const issues = themed({ text: "#cccccc", buttonText: "#eeeeee", button: "#ffffff" });
    expect(issues.map((i) => [i.messageKey, i.at])).toEqual([
      ["theme-contrast-button", { scope: "theme", field: "buttonText" }],
      ["theme-contrast-text", { scope: "theme", field: "text" }],
    ]);
  });

  it("rounds the ratio down to one decimal, so just under the line never reads as the line", () => {
    // #777777 on white is 4.48:1
    const [issue] = themed({ text: "#777777" });
    expect(issue?.params).toEqual({ ratio: 4.4 });
  });

  it("is only ever a warning, so it never counts as an error", () => {
    const issues = themed({
      email: "#000000",
      text: "#000000",
      heading: "#000000",
      link: "#000000",
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.severity === "warn")).toBe(true);
    expect(preflightCounts(issues).errors).toBe(0);
  });

  it("comes after the issues in the body, and before any size warning", () => {
    const issues = run({
      document: {
        ...doc(p(t("Read", [link("http://example.com")]))),
        theme: { text: "#cccccc" },
      },
      html: `<p>${"x".repeat(SIZE_NEAR_BYTES)}</p>`,
    });
    expect(ids(issues)).toEqual(["link-insecure", "theme-contrast-low", "size-near"]);
  });

  it("ignores a theme that does not validate, as the render does", () => {
    expect(themed({ text: "red" })).toEqual([]);
  });

  it("has nothing to say about an html-authored body, which has no theme", () => {
    expect(run({ document: null, html: "<p style='color:#ccc'>Hello</p>" })).toEqual([]);
  });
});
