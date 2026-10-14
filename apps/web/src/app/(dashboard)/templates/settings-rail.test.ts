import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "../../../../messages/en/templates.json";
import { EditorFields } from "./editor-fields";
import { PREVIEW_TEXT_FIELD_ID, SUBJECT_FIELD_ID } from "./field-ids";
import { SettingsRail } from "./settings-rail";

function render(children: ReactElement): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale: "en", messages: { templates: en }, children }),
  );
}

const noop = () => {};

function rail(over: Partial<Parameters<typeof SettingsRail>[0]> = {}) {
  return render(
    createElement(SettingsRail, {
      name: "Welcome",
      subject: "Hello",
      previewText: "Start here",
      onName: noop,
      onSubject: noop,
      onPreviewText: noop,
      checks: createElement("p", { id: "checks" }, "checks"),
      ...over,
    }),
  );
}

describe("SettingsRail", () => {
  it("holds the three fields, with the ids a preflight row focuses", () => {
    const markup = rail();
    expect(markup).toContain('id="tpl-name"');
    expect(markup).toContain(`id="${SUBJECT_FIELD_ID}"`);
    expect(markup).toContain(`id="${PREVIEW_TEXT_FIELD_ID}"`);
    expect(markup).toContain('value="Welcome"');
    expect(markup).toContain('value="Hello"');
  });

  it("puts the checks under the fields, after a rule", () => {
    const markup = rail();
    expect(markup).toContain('class="po-tpl-settings-checks"');
    expect(markup.indexOf(PREVIEW_TEXT_FIELD_ID)).toBeLessThan(markup.indexOf('id="checks"'));
  });

  it("has a theme slot only when something fills it", () => {
    expect(rail()).not.toContain("po-tpl-settings-theme");
    const markup = rail({ theme: createElement("p", { id: "theme" }, "theme") });
    expect(markup).toContain("po-tpl-settings-theme");
    expect(markup.indexOf("po-tpl-settings-theme")).toBeLessThan(
      markup.indexOf("po-tpl-settings-checks"),
    );
  });

  it("has a footer line only when something fills it, after the checks", () => {
    expect(rail()).not.toContain("po-tpl-settings-foot");
    const markup = rail({ footer: createElement("p", { id: "foot" }, "foot") });
    expect(markup).toContain('class="po-tpl-settings-foot"');
    expect(markup.indexOf('id="checks"')).toBeLessThan(markup.indexOf("po-tpl-settings-foot"));
    expect(markup.indexOf("po-tpl-settings-foot")).toBeLessThan(markup.indexOf('id="foot"'));
  });

  it("stacks its fields in one column with no width cap", () => {
    const markup = rail();
    expect(markup).toMatch(/class="po-tpl-meta" data-stacked="true"/);
    expect(markup).not.toContain("max-width");
  });
});

describe("EditorFields", () => {
  function fields(stacked?: boolean, wide = false) {
    return render(
      createElement(EditorFields, {
        wide,
        ...(stacked === undefined ? {} : { stacked }),
        name: "",
        subject: "",
        previewText: "",
        onName: noop,
        onSubject: noop,
        onPreviewText: noop,
      }),
    );
  }

  it("keeps its capped, two-column row by default", () => {
    const markup = fields();
    expect(markup).toContain("max-width:720px");
    expect(markup).not.toContain("data-stacked");
    expect(fields(undefined, true)).toContain("max-width:1200px");
  });

  it("stacks, uncapped, when asked", () => {
    const markup = fields(true);
    expect(markup).toContain('data-stacked="true"');
    expect(markup).not.toContain("max-width");
  });
});
