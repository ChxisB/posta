import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  RAILS_INITIAL,
  type RailSide,
  type RailsState,
  type RailTier,
  railDrawer,
  railMode,
  railShown,
} from "@/lib/template-rails";
import en from "../../../../messages/en/templates.json";
import { RailsLayout, railId, railOpenerId } from "./rails-layout";
import type { TemplateRails } from "./use-template-rails";

function render(children: ReactElement): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale: "en", messages: { templates: en }, children }),
  );
}

const noop = () => {};

/** A rails controller frozen at a tier and a state, as the hook would hand it over. */
function rails(tier: RailTier, state: RailsState = RAILS_INITIAL): TemplateRails {
  return {
    ref: noop,
    tier,
    ready: true,
    state,
    modeOf: (side: RailSide) => railMode(tier, side),
    shown: (side: RailSide) => railShown(state, tier, side),
    drawer: railDrawer(state, tier),
    toggleCollapsed: noop,
    openDrawer: noop,
    close: noop,
    show: noop,
    restoreFocus: { current: true },
  };
}

function layout(controller: TemplateRails) {
  const children = createElement("div", { id: "email" }, "the email");
  return render(
    createElement(RailsLayout, {
      rails: controller,
      titles: { left: "Blocks", right: "Settings" },
      left: createElement("p", { id: "left-content" }, "components"),
      right: createElement("p", { id: "right-content" }, "settings"),
      children,
    }),
  );
}

/** The opening tag of the element with this id. */
function tagOf(markup: string, id: string): string {
  return new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`).exec(markup)?.[0] ?? "";
}

describe("RailsLayout structure", () => {
  it("has a labelled aside for each rail, around the email, in left-to-right order", () => {
    const markup = layout(rails("wide"));
    expect(markup).toContain(`<aside id="po-tpl-rail-left"`);
    expect(markup).toContain(`<aside id="po-tpl-rail-right"`);
    expect(tagOf(markup, "po-tpl-rail-left")).toContain('aria-labelledby="po-tpl-rail-left-title"');
    expect(tagOf(markup, "po-tpl-rail-right")).toContain(
      'aria-labelledby="po-tpl-rail-right-title"',
    );
    expect(markup).toMatch(/id="po-tpl-rail-left-title"[^>]*>Blocks<\/h2>/);
    expect(markup).toMatch(/id="po-tpl-rail-right-title"[^>]*>Settings<\/h2>/);
    const left = markup.indexOf("po-tpl-rail-left");
    const email = markup.indexOf('id="email"');
    const right = markup.indexOf("po-tpl-rail-right");
    expect(left).toBeLessThan(email);
    expect(email).toBeLessThan(right);
  });

  it("carries both rails' contents and the email at every tier", () => {
    for (const tier of ["wide", "medium", "narrow"] as const) {
      const markup = layout(rails(tier));
      expect(markup).toContain('id="left-content"');
      expect(markup).toContain('id="right-content"');
      expect(markup).toContain('id="email"');
    }
  });

  it("records the tier and each rail's mode for the stylesheet", () => {
    const wide = layout(rails("wide"));
    expect(wide).toContain('data-tier="wide"');
    expect(tagOf(wide, "po-tpl-rail-left")).toContain('data-mode="docked"');
    expect(tagOf(wide, "po-tpl-rail-right")).toContain('data-mode="docked"');
    const medium = layout(rails("medium"));
    expect(tagOf(medium, "po-tpl-rail-left")).toContain('data-mode="drawer"');
    expect(tagOf(medium, "po-tpl-rail-right")).toContain('data-mode="docked"');
    const narrow = layout(rails("narrow"));
    expect(tagOf(narrow, "po-tpl-rail-left")).toContain('data-mode="drawer"');
    expect(tagOf(narrow, "po-tpl-rail-right")).toContain('data-mode="drawer"');
  });

  it("is not ready until the folded flags have been read", () => {
    expect(layout({ ...rails("wide"), ready: false })).not.toContain("data-ready");
    expect(layout(rails("wide"))).toContain("data-ready");
  });
});

describe("RailsLayout toolbar", () => {
  it("has none when both rails sit beside the email", () => {
    const markup = layout(rails("wide"));
    expect(markup).not.toContain("po-tpl-bar");
    expect(markup).not.toContain(railOpenerId("left"));
  });

  it("opens the components rail from a button when only the settings are docked", () => {
    const markup = layout(rails("medium"));
    const opener = tagOf(markup, railOpenerId("left"));
    expect(opener).toContain('aria-haspopup="dialog"');
    expect(opener).toContain('aria-expanded="false"');
    expect(opener).toContain(`aria-controls="${railId("left")}"`);
    expect(markup).toMatch(/id="po-tpl-open-left"[^>]*>Blocks<\/button>/);
    expect(markup).not.toContain(railOpenerId("right"));
  });

  it("opens both from buttons when narrow, the components first", () => {
    const markup = layout(rails("narrow"));
    expect(markup).toMatch(/id="po-tpl-open-left"[^>]*>Blocks<\/button>/);
    expect(markup).toMatch(/id="po-tpl-open-right"[^>]*>Settings<\/button>/);
    expect(markup.indexOf(railOpenerId("left"))).toBeLessThan(
      markup.indexOf(railOpenerId("right")),
    );
  });

  it("sits in the email's column, ahead of the email", () => {
    const markup = layout(rails("narrow"));
    expect(markup.indexOf("po-tpl-canvas")).toBeLessThan(markup.indexOf("po-tpl-bar"));
    expect(markup.indexOf("po-tpl-bar")).toBeLessThan(markup.indexOf('id="email"'));
  });
});

describe("RailsLayout docked rails", () => {
  it("gives each a hide button and no dialog role", () => {
    const markup = layout(rails("wide"));
    expect(markup).toContain('aria-label="Hide Blocks"');
    expect(markup).toContain('aria-label="Hide Settings"');
    expect(tagOf(markup, "po-tpl-rail-left")).not.toContain("role=");
    expect(tagOf(markup, "po-tpl-rail-left")).not.toContain("aria-modal");
    expect(markup).not.toContain("po-tpl-scrim");
  });

  it("folds one away to a show button, with its contents out of reach", () => {
    const markup = layout(rails("wide", { collapsed: { left: true, right: false }, open: null }));
    expect(tagOf(markup, "po-tpl-rail-left")).toContain("data-collapsed");
    expect(tagOf(markup, "po-tpl-rail-right")).not.toContain("data-collapsed");
    expect(markup).toContain('aria-label="Show Blocks"');
    expect(markup).not.toContain('aria-label="Show Settings"');
    // The folded rail's contents are inert; the other's are not.
    const inner = [...markup.matchAll(/<div class="po-tpl-rail-inner"([^>]*)>/g)].map((m) => m[1]);
    expect(inner[0]).toContain("inert");
    expect(inner[1]).not.toContain("inert");
  });

  it("ignores a fold on a rail that is a drawer at this tier", () => {
    const markup = layout(rails("narrow", { collapsed: { left: true, right: true }, open: null }));
    expect(tagOf(markup, "po-tpl-rail-left")).not.toContain("data-collapsed");
    expect(markup).not.toContain('aria-label="Show ');
  });
});

describe("RailsLayout drawers", () => {
  it("keeps a closed drawer's contents out of reach, with a close button ready", () => {
    const markup = layout(rails("narrow"));
    expect(tagOf(markup, "po-tpl-rail-right")).not.toContain("data-open");
    const inner = [...markup.matchAll(/<div class="po-tpl-rail-inner"([^>]*)>/g)].map((m) => m[1]);
    expect(inner[0]).toContain("inert");
    expect(inner[1]).toContain("inert");
    expect(markup).toContain('aria-label="Close Blocks"');
    expect(markup).not.toContain("po-tpl-scrim");
  });

  it("is a modal dialog, with a scrim and an expanded opener, while open", () => {
    const markup = layout(rails("narrow", { collapsed: RAILS_INITIAL.collapsed, open: "right" }));
    const aside = tagOf(markup, "po-tpl-rail-right");
    expect(aside).toContain("data-open");
    expect(aside).toContain('role="dialog"');
    expect(aside).toContain('aria-modal="true"');
    expect(aside).toContain('aria-labelledby="po-tpl-rail-right-title"');
    expect(tagOf(markup, railOpenerId("right"))).toContain('aria-expanded="true"');
    expect(tagOf(markup, railOpenerId("left"))).toContain('aria-expanded="false"');
    expect(markup).toContain("po-tpl-scrim");
    // The other drawer stays shut.
    expect(tagOf(markup, "po-tpl-rail-left")).not.toContain('role="dialog"');
    const inner = [...markup.matchAll(/<div class="po-tpl-rail-inner"([^>]*)>/g)].map((m) => m[1]);
    expect(inner[0]).toContain("inert");
    expect(inner[1]).not.toContain("inert");
  });

  it("opens the components rail as a drawer on a medium layout", () => {
    const markup = layout(rails("medium", { collapsed: RAILS_INITIAL.collapsed, open: "left" }));
    expect(tagOf(markup, "po-tpl-rail-left")).toContain('role="dialog"');
    expect(tagOf(markup, "po-tpl-rail-right")).not.toContain('role="dialog"');
    expect(markup).toContain("po-tpl-scrim");
  });

  it("hides the scrim from assistive tech", () => {
    const markup = layout(rails("narrow", { collapsed: RAILS_INITIAL.collapsed, open: "left" }));
    expect(markup).toMatch(/class="po-tpl-scrim" aria-hidden="true"/);
  });
});
