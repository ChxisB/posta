import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mailyDocumentSchema } from "./email-doc";
import { renderEmailDocument } from "./email-render";
import { MERGE_BUILTINS, MERGE_TOKEN_RE } from "./merge-fields";
import { preflight } from "./preflight";
import { PREVIEW_TEXT_SHOWN } from "./preview-text";
import {
  buildStarter,
  copyAsTokens,
  isPlaceholderUrl,
  parseCopy,
  placeholderLinks,
  STARTERS,
  type StarterCopy,
  type StarterSpec,
  starterById,
} from "./starter-templates";

const LOCALES = ["en"] as const;
type Locale = (typeof LOCALES)[number];

function catalog(locale: Locale, file: string): Record<string, unknown> {
  const path = fileURLToPath(new URL(`../../messages/${locale}/${file}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

/** The starters' copy as the app reads it: the real catalog for a language. */
function copyFor(locale: Locale): StarterCopy & { missing: string[] } {
  const starters = (catalog(locale, "templates").starters ?? {}) as Record<string, unknown>;
  const labels = catalog(locale, "merge-fields");
  const missing: string[] = [];
  return {
    missing,
    text(key) {
      const value = key.split(".").reduce<unknown>((node, part) => {
        return typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined;
      }, starters);
      if (typeof value !== "string") {
        missing.push(key);
        return "";
      }
      return value;
    },
    fieldLabel: (labelKey) => String(labels[labelKey]),
  };
}

type Node = { type?: string; attrs?: Record<string, unknown>; marks?: Node[]; content?: Node[] };

function nodesOf(value: unknown): Node[] {
  const out: Node[] = [];
  const visit = (node: Node) => {
    out.push(node);
    for (const child of node.content ?? []) visit(child);
    for (const mark of node.marks ?? []) visit(mark);
  };
  visit(value as Node);
  return out;
}

const ALLOWED_FIELDS = new Set(MERGE_BUILTINS.map((field) => field.name));

/** Every `{{{NAME…}}}` token in a string, by name. */
function tokenNames(value: string): string[] {
  return [...value.matchAll(new RegExp(MERGE_TOKEN_RE.source, "g"))].map((m) => m[1] ?? "");
}

describe("the set", () => {
  it("has five starters with unique ids, and finds each by id", () => {
    const ids = STARTERS.map((starter) => starter.id);
    expect(ids).toEqual(["welcome", "password-reset", "receipt", "product-update", "newsletter"]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(starterById(id)?.id).toBe(id);
    expect(starterById("blank")).toBeUndefined();
    expect(starterById("nope")).toBeUndefined();
  });

  it("splits into transactional ones without an unsubscribe link and marketing ones with", () => {
    expect(STARTERS.filter((s) => s.kind === "transactional").map((s) => s.id)).toEqual([
      "welcome",
      "password-reset",
      "receipt",
    ]);
    expect(STARTERS.filter((s) => s.kind === "marketing").map((s) => s.id)).toEqual([
      "product-update",
      "newsletter",
    ]);
  });
});

describe.each(LOCALES)("starters in %s", (locale) => {
  const copy = copyFor(locale);
  const built = STARTERS.map((spec) => ({ spec, starter: buildStarter(spec, copy) }));

  it("finds every line of copy in the catalog, and the catalog holds nothing else", () => {
    expect(copy.missing).toEqual([]);
    const starters = catalog(locale, "templates").starters as Record<string, unknown>;
    const keysOf = (spec: StarterSpec) => {
      const keys = new Set(["name", "description", "subject", "previewText"]);
      for (const block of spec.blocks) {
        if ("copy" in block) keys.add(block.copy);
        if (block.kind === "list") for (const item of block.items) keys.add(item);
        if (block.kind === "unsubscribe") keys.add(block.link);
      }
      return [...keys].sort();
    };
    for (const spec of STARTERS) {
      expect(Object.keys(starters[spec.id] as object).sort(), spec.id).toEqual(keysOf(spec));
    }
  });

  for (const { spec, starter } of built) {
    describe(spec.id, () => {
      it("parses as a Maily document", () => {
        expect(mailyDocumentSchema.safeParse(starter.document).success).toBe(true);
        expect(JSON.parse(JSON.stringify(starter.document))).toEqual(starter.document);
      });

      it("keeps its top-level blocks flat", () => {
        const types = (starter.document.content as Node[]).map((node) => node.type);
        expect(types.length).toBeGreaterThan(3);
        expect(types).not.toContain("section");
        expect(types).not.toContain("columns");
      });

      it("uses only the built-in merge fields, each with a fallback but the unsubscribe link", () => {
        const variables = nodesOf(starter.document).filter((node) => node.type === "variable");
        for (const variable of variables) {
          const id = String(variable.attrs?.id);
          expect(ALLOWED_FIELDS.has(id), id).toBe(true);
          expect(String(variable.attrs?.fallback ?? "").length, id).toBeGreaterThan(0);
        }
        const used = [...tokenNames(starter.subject), ...tokenNames(starter.previewText)];
        for (const name of used) expect(ALLOWED_FIELDS.has(name), name).toBe(true);
        expect(starter.subject).not.toMatch(/[[\]]/);
        expect(starter.previewText).not.toMatch(/[[\]]/);
      });

      it("has an unsubscribe link only when it is marketing", () => {
        const links = nodesOf(starter.document).filter(
          (node) => node.type === "link" && node.attrs?.href === "UNSUBSCRIBE_URL",
        );
        expect(links.length).toBe(spec.kind === "marketing" ? 1 : 0);
        for (const link of links) expect(link.attrs?.isUrlVariable).toBe(true);
      });

      it("renders to html and text", async () => {
        const { html, text } = await renderEmailDocument(starter.document);
        expect(html.length).toBeGreaterThan(500);
        expect(text.trim().length).toBeGreaterThan(40);
        const tokens = tokenNames(html);
        for (const name of tokens) expect(ALLOWED_FIELDS.has(name), name).toBe(true);
        expect(tokens.includes("UNSUBSCRIBE_URL")).toBe(spec.kind === "marketing");
      });

      it("has no image, no remote image and no link but https", async () => {
        const nodes = nodesOf(starter.document);
        const images = new Set(["image", "inlineImage", "logo", "linkCard"]);
        expect(nodes.filter((node) => images.has(String(node.type)))).toEqual([]);
        const { html } = await renderEmailDocument(starter.document);
        expect(html).not.toMatch(/<img/i);
        expect(html).not.toMatch(/javascript:/i);
        for (const node of nodes) {
          const url = node.type === "button" ? node.attrs?.url : node.attrs?.href;
          if (typeof url !== "string" || node.attrs?.isUrlVariable === true) continue;
          expect(url, String(node.type)).toMatch(/^https:\/\//);
        }
      });

      it("passes preflight with nothing to report", async () => {
        const { html } = await renderEmailDocument(starter.document);
        const issues = preflight({
          subject: starter.subject,
          previewText: starter.previewText,
          document: starter.document,
          html,
          mergeFields: MERGE_BUILTINS,
        });
        expect(issues).toEqual([]);
      });

      it("has a name, a subject and a preview text that fits", () => {
        expect(starter.name.trim()).not.toBe("");
        expect(starter.name.length).toBeLessThanOrEqual(60);
        expect(starter.subject.trim()).not.toBe("");
        expect(starter.subject.length).toBeLessThanOrEqual(80);
        expect(starter.previewText.trim()).not.toBe("");
        expect([...starter.previewText].length).toBeLessThanOrEqual(PREVIEW_TEXT_SHOWN);
      });

      it("keeps to the house voice: no exclamation marks, no curly quotes, no double spaces", () => {
        const spoken = [
          starter.name,
          starter.subject,
          starter.previewText,
          ...nodesOf(starter.document).flatMap((node) =>
            node.type === "text" ? [String((node as { text?: string }).text)] : [],
          ),
          copy.text(`${spec.id}.description`),
        ];
        for (const line of spoken) {
          expect(line, line).not.toContain("!");
          expect(line, line).not.toMatch(/[‘’“”]/);
          expect(line, line).not.toContain("  ");
        }
      });

      it("points its links at example.com until they are replaced", () => {
        const count = placeholderLinks(starter.document);
        const hasLinks = spec.blocks.some((block) => block.kind === "button");
        expect(count > 0).toBe(hasLinks);
      });
    });
  }

  it("gives each starter its own name, subject and body", () => {
    expect(new Set(built.map(({ starter }) => starter.name)).size).toBe(built.length);
    expect(new Set(built.map(({ starter }) => JSON.stringify(starter.document))).size).toBe(
      built.length,
    );
  });
});

describe("the English starters, as the editor opens them", () => {
  const copy = copyFor("en");
  const starter = (id: string) => buildStarter(starterById(id) as StarterSpec, copy);

  it("opens the welcome email with a greeting that carries the first name and a fallback", () => {
    const welcome = starter("welcome");
    expect(welcome.name).toBe("Welcome email");
    expect(welcome.subject).toBe("Welcome, {{{FIRST_NAME|there}}}");
    const [heading, greeting] = welcome.document.content as Node[];
    expect(heading).toEqual({
      type: "heading",
      attrs: { textAlign: "left", level: 1 },
      content: [{ type: "text", text: "Welcome aboard" }],
    });
    expect(greeting).toEqual({
      type: "paragraph",
      attrs: { textAlign: "left" },
      content: [
        { type: "text", text: "Hi " },
        {
          type: "variable",
          attrs: { id: "FIRST_NAME", label: "First name", fallback: "there" },
        },
        { type: "text", text: "," },
      ],
    });
  });

  it("writes a button, a list and a divider as the editor's own nodes", () => {
    const reset = starter("password-reset").document.content as Node[];
    expect(reset.find((node) => node.type === "button")).toEqual({
      type: "button",
      attrs: {
        text: "Choose a new password",
        isTextVariable: false,
        url: "https://example.com/reset-password",
        isUrlVariable: false,
        alignment: "left",
        variant: "filled",
        borderRadius: "smooth",
      },
    });
    expect(reset.some((node) => node.type === "horizontalRule")).toBe(true);
    const list = starter("welcome").document.content?.find((node) => {
      return (node as Node).type === "bulletList";
    }) as Node;
    expect(list.content?.map((item) => item.type)).toEqual(["listItem", "listItem", "listItem"]);
  });

  it("closes a marketing starter with the sentence and its unsubscribe link", () => {
    const content = starter("newsletter").document.content as Node[];
    const footer = content.at(-1) as Node;
    expect(footer.content?.map((node) => (node as { text?: string }).text)).toEqual([
      "You are getting this because you subscribed. ",
      "Unsubscribe",
    ]);
    expect(footer.content?.[1]?.marks).toEqual([
      {
        type: "link",
        attrs: {
          href: "UNSUBSCRIBE_URL",
          isUrlVariable: true,
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      },
    ]);
  });

  it("renders the first name as the worker's token, fallback included", async () => {
    const { html } = await renderEmailDocument(starter("welcome").document);
    expect(html).toContain("{{{FIRST_NAME|there}}}");
  });

  it("puts a bold label on each line of a receipt", () => {
    const list = (starter("receipt").document.content as Node[]).find(
      (node) => node.type === "bulletList",
    ) as Node;
    const first = list.content?.[0]?.content?.[0]?.content as Node[];
    expect(first).toEqual([
      { type: "text", text: "Order:", marks: [{ type: "bold" }] },
      { type: "text", text: " 1042" },
    ]);
  });
});

describe("parseCopy", () => {
  it("returns plain copy as one text part", () => {
    expect(parseCopy("Thanks for signing up.")).toEqual([
      { kind: "text", text: "Thanks for signing up.", bold: false },
    ]);
  });

  it("finds a merge field with its fallback, and one without", () => {
    expect(parseCopy("Hi [FIRST_NAME|there], [EMAIL]")).toEqual([
      { kind: "text", text: "Hi ", bold: false },
      { kind: "field", name: "FIRST_NAME", fallback: "there" },
      { kind: "text", text: ", ", bold: false },
      { kind: "field", name: "EMAIL", fallback: "" },
    ]);
  });

  it("finds bold, and leaves a bracket that is not a field as words", () => {
    expect(parseCopy("**Total:** 24.00 [approx]")).toEqual([
      { kind: "text", text: "Total:", bold: true },
      { kind: "text", text: " 24.00 [approx]", bold: false },
    ]);
  });

  it("allows a fallback with spaces and accents", () => {
    expect(parseCopy("Olá, [FIRST_NAME|por aí]")).toEqual([
      { kind: "text", text: "Olá, ", bold: false },
      { kind: "field", name: "FIRST_NAME", fallback: "por aí" },
    ]);
  });

  it("returns nothing for empty copy", () => {
    expect(parseCopy("")).toEqual([]);
  });
});

describe("copyAsTokens", () => {
  it("spells a field as the token the worker resolves", () => {
    expect(copyAsTokens("Welcome, [FIRST_NAME|there]")).toBe("Welcome, {{{FIRST_NAME|there}}}");
    expect(copyAsTokens("[EMAIL]")).toBe("{{{EMAIL}}}");
  });

  it("drops bold markers and leaves plain copy alone", () => {
    expect(copyAsTokens("Your **receipt**")).toBe("Your receipt");
    expect(copyAsTokens("Reset your password")).toBe("Reset your password");
  });
});

describe("isPlaceholderUrl", () => {
  it.each([
    ["https://example.com", true],
    ["https://example.com/reset", true],
    ["https://www.example.com/a?b=1", true],
    ["http://example.com:8080/", true],
    ["HTTPS://EXAMPLE.COM/x", true],
    ["https://example.com#top", true],
    ["https://example.com.evil.test/", false],
    ["https://notexample.com/", false],
    ["https://example.community/", false],
    ["https://acme.test/example.com", false],
    ["https://user@example.com/", true],
    ["mailto:hi@example.com", false],
    ["UNSUBSCRIBE_URL", false],
    ["", false],
  ])("%s -> %s", (url, expected) => {
    expect(isPlaceholderUrl(url)).toBe(expected);
  });
});

describe("placeholderLinks", () => {
  const button = (url: string, extra: Record<string, unknown> = {}) => ({
    type: "button",
    attrs: { text: "Go", url, ...extra },
  });
  const linked = (href: string, extra: Record<string, unknown> = {}) => ({
    type: "paragraph",
    content: [{ type: "text", text: "here", marks: [{ type: "link", attrs: { href, ...extra } }] }],
  });
  const doc = (...content: unknown[]) => ({ type: "doc", content });

  it("counts buttons and text links on the example host", () => {
    expect(
      placeholderLinks(doc(button("https://example.com/a"), linked("https://example.com/b"))),
    ).toBe(2);
  });

  it("finds them inside a list, a quote or a column", () => {
    const nested = {
      type: "bulletList",
      content: [{ type: "listItem", content: [linked("https://example.com/x")] }],
    };
    expect(placeholderLinks(doc(nested))).toBe(1);
  });

  it("ignores real addresses, variable addresses and anything that is not a document", () => {
    expect(placeholderLinks(doc(button("https://acme.test/start")))).toBe(0);
    expect(placeholderLinks(doc(button("https://example.com", { isUrlVariable: true })))).toBe(0);
    expect(placeholderLinks(doc(linked("https://example.com", { isUrlVariable: true })))).toBe(0);
    expect(placeholderLinks(null)).toBe(0);
    expect(placeholderLinks({ version: 1, blocks: [] })).toBe(0);
    expect(placeholderLinks(doc())).toBe(0);
  });

  it("reaches zero once the links are replaced", () => {
    const before = doc(button("https://example.com/a"));
    expect(placeholderLinks(before)).toBe(1);
    expect(placeholderLinks(doc(button("https://acme.test/a")))).toBe(0);
  });
});
