import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BLANK_STARTER,
  buildStarter,
  STARTERS,
  type StarterTemplate,
} from "@/lib/starter-templates";
import common from "../../../../../messages/en/common.json";
import mergeFieldsEn from "../../../../../messages/en/merge-fields.json";
import templatesEn from "../../../../../messages/en/templates.json";
import commonPt from "../../../../../messages/pt-BR/common.json";
import mergeFieldsPt from "../../../../../messages/pt-BR/merge-fields.json";
import templatesPt from "../../../../../messages/pt-BR/templates.json";
import { NewTemplate } from "./new-template";
import { StarterPicker, StarterSketch } from "./starter-picker";

type Locale = "en" | "pt-BR";

const CATALOGS = {
  en: { common, templates: templatesEn, "merge-fields": mergeFieldsEn },
  "pt-BR": { common: commonPt, templates: templatesPt, "merge-fields": mergeFieldsPt },
} as const;

function render(children: ReactElement, locale: Locale = "en"): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale, messages: CATALOGS[locale], children }),
  );
}

/** The starters as the picker gets them, in a language, from the real catalog. */
function startersIn(locale: Locale): StarterTemplate[] {
  const { templates, "merge-fields": fields } = CATALOGS[locale];
  const lookup = (path: string, tree: unknown) =>
    path.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], tree);
  return STARTERS.map((spec) =>
    buildStarter(spec, {
      text: (key) => String(lookup(`starters.${key}`, templates)),
      fieldLabel: (key) => String(lookup(key, fields)),
    }),
  );
}

function picker(locale: Locale = "en"): string {
  return render(createElement(StarterPicker, { starters: startersIn(locale) }), locale);
}

/** The cards, as markup, in the order they appear. */
function cards(markup: string): string[] {
  return markup.split('<li class="po-starter-item">').slice(1);
}

describe("StarterPicker", () => {
  it("is a labelled list with the blank card first, then one card per starter in order", () => {
    const markup = picker();
    expect(markup).toContain(`aria-label="${templatesEn.starters.picker.listLabel}"`);
    const found = cards(markup);
    expect(found).toHaveLength(STARTERS.length + 1);
    expect(found[0]).toContain("po-starter-blank");
    expect(found[0]).toContain(`href="/templates/new?starter=${BLANK_STARTER}"`);
    STARTERS.forEach((spec, index) => {
      expect(found[index + 1]).toContain(`href="/templates/new?starter=${spec.id}"`);
    });
  });

  it("names each card, with its kind and its one line", () => {
    const found = cards(picker());
    expect(found[0]).toContain(templatesEn.starters.picker.blank);
    expect(found[0]).toContain(templatesEn.starters.picker.blankHint);
    const built = startersIn("en");
    built.forEach((starter, index) => {
      const card = found[index + 1] ?? "";
      expect(card, starter.id).toContain(`${starter.name}<span class="po-starter-kind">`);
      expect(card, starter.id).toContain(
        `<span class="po-starter-kind">${templatesEn.starters.picker.kind[starter.kind]}</span>`,
      );
      expect(card, starter.id).toContain(
        `<span class="po-starter-desc">${starter.description}</span>`,
      );
    });
  });

  it("says which starters are marketing and which transactional", () => {
    const markup = picker();
    const marketing = STARTERS.filter((spec) => spec.kind === "marketing").length;
    expect(
      markup.match(
        new RegExp(`po-starter-kind">${templatesEn.starters.picker.kind.marketing}<`, "g"),
      ),
    ).toHaveLength(marketing);
    expect(
      markup.match(
        new RegExp(`po-starter-kind">${templatesEn.starters.picker.kind.transactional}<`, "g"),
      ),
    ).toHaveLength(STARTERS.length - marketing);
  });

  it("states what it is for, under the page title, with a way back to the list of templates", () => {
    const markup = picker();
    expect(markup).toContain(`<h1`);
    expect(markup).toContain(templatesEn.editor.newTitle);
    expect(markup).toContain(templatesEn.starters.picker.hint);
    expect(markup).toContain('href="/templates"');
  });

  it("keeps the sketches out of the accessibility tree, so a card reads as its words", () => {
    const found = cards(picker());
    for (const card of found) expect(card).toContain('aria-hidden="true"');
    expect(
      found.slice(1).every((card) => card.includes('<span class="po-sketch" aria-hidden="true">')),
    ).toBe(true);
  });

  it("reads in Brazilian Portuguese, from its own catalog", () => {
    const markup = picker("pt-BR");
    expect(markup).toContain(templatesPt.starters.picker.blank);
    expect(markup).toContain(templatesPt.starters.picker.hint);
    for (const starter of startersIn("pt-BR")) expect(markup).toContain(starter.name);
    expect(markup).not.toContain(templatesEn.starters.picker.blank);
    expect(markup).not.toContain(templatesEn.starters.picker.hint);
  });
});

describe("StarterSketch", () => {
  it("draws a shape for every kind of block", () => {
    const every = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [] },
        { type: "heading", attrs: { level: 2 }, content: [] },
        { type: "heading", attrs: { level: 3 }, content: [] },
        { type: "paragraph", content: [{ type: "text", text: "x".repeat(60) }] },
        { type: "bulletList", content: [{ type: "listItem" }] },
        { type: "blockquote", content: [] },
        { type: "button", attrs: { text: "Go" } },
        { type: "horizontalRule" },
      ],
    };
    const markup = render(createElement(StarterSketch, { document: every }));
    for (const part of [
      'class="po-sketch-heading" data-level="1"',
      'class="po-sketch-heading" data-level="2"',
      'class="po-sketch-heading" data-level="3"',
      'class="po-sketch-text"',
      'class="po-sketch-line" data-last="false"',
      'class="po-sketch-line" data-last="true"',
      'class="po-sketch-list"',
      'class="po-sketch-item"',
      'class="po-sketch-dot"',
      'class="po-sketch-quote"',
      'class="po-sketch-button"',
      'class="po-sketch-divider"',
    ]) {
      expect(markup, part).toContain(part);
    }
  });

  it("shows the top of a long email only: the newsletter's sketch ends before its footer", () => {
    const newsletter = startersIn("en").find((starter) => starter.id === "newsletter");
    if (!newsletter) throw new Error("no newsletter starter");
    const markup = render(createElement(StarterSketch, { document: newsletter.document }));
    expect(markup).toContain("po-sketch-quote");
    expect(markup).not.toContain("po-sketch-divider");
    expect(
      markup.match(/class="po-sketch-(heading|text|list|quote|button|divider)"/g),
    ).toHaveLength(8);
  });

  it("holds no words: it is drawn from shapes alone", () => {
    const starter = startersIn("en")[0];
    if (!starter) throw new Error("no starters");
    const markup = render(createElement(StarterSketch, { document: starter.document }));
    expect(markup.replace(/<[^>]*>/g, "")).toBe("");
  });

  it("is an empty frame for a document with nothing in it", () => {
    expect(render(createElement(StarterSketch, { document: { type: "doc", content: [] } }))).toBe(
      '<span class="po-sketch" aria-hidden="true"></span>',
    );
  });
});

describe("NewTemplate", () => {
  it("shows the picker when no starter is named, or one that does not exist", () => {
    for (const starter of [undefined, "", "nope", "WELCOME", "__proto__", "constructor"]) {
      const markup = render(createElement(NewTemplate, { starter }));
      expect(markup, String(starter)).toContain('class="po-starters"');
    }
  });
});
