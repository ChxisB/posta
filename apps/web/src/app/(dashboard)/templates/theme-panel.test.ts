import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_THEME,
  EMAIL_COLOUR_KEYS,
  EMAIL_THEME_PRESETS,
  type EmailTheme,
} from "@/lib/email-theme";
import enCommon from "../../../../messages/en/common.json";
import enTemplates from "../../../../messages/en/templates.json";
import { ThemePanel } from "./theme-panel";

function render(children: ReactElement): string {
  const messages = { templates: enTemplates, common: enCommon };
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale: "en", messages, children }),
  );
}

const noop = () => {};

function panel(theme?: EmailTheme) {
  return render(createElement(ThemePanel, { theme, onChange: noop }));
}

/** The text of the pressed segment in each segmented row, in order. */
function pressed(markup: string): string[] {
  return [...markup.matchAll(/<button[^>]*aria-pressed="true"[^>]*>([^<]*)<\/button>/g)].map(
    (m) => m[1] ?? "",
  );
}

describe("ThemePanel", () => {
  it("is a labelled section with a title and a line saying whose look it is", () => {
    const markup = panel();
    expect(markup).toMatch(/<section[^>]*aria-labelledby="([^"]+)"/);
    const id = /aria-labelledby="([^"]+)"/.exec(markup)?.[1];
    expect(markup).toContain(`id="${id}"`);
    expect(markup).toContain(">Email theme</h3>");
    expect(markup).toContain("The editor stays in your dashboard theme.");
  });

  it("offers the three presets, with Default pressed for an email with no theme", () => {
    const markup = panel();
    for (const name of ["Default", "Dark", "Soft"]) expect(markup).toContain(`>${name}</button>`);
    expect(pressed(markup)).toEqual(["Default", "Square", "None"]);
  });

  it("presses the preset an email's theme equals, and none when it is a mix", () => {
    const dark = EMAIL_THEME_PRESETS.find((p) => p.id === "dark")?.theme;
    expect(pressed(panel(dark))[0]).toBe("Dark");
    // no preset is pressed, so the first pressed segment is the corners row
    expect(pressed(panel({ ...dark, link: "#ffffff" }))).toEqual(["Square", "None"]);
  });

  it("has a labelled picker and hex field for each of the seven colours, at the defaults", () => {
    const markup = panel();
    expect(EMAIL_COLOUR_KEYS).toHaveLength(7);
    expect(markup.match(/type="color"/g)).toHaveLength(7);
    for (const label of [
      "Page background",
      "Email background",
      "Text",
      "Headings",
      "Links",
      "Buttons",
      "Button text",
    ]) {
      expect(markup).toContain(`>${label}</label>`);
      expect(markup).toContain(`aria-label="${label}, colour picker"`);
    }
    for (const key of EMAIL_COLOUR_KEYS) {
      expect(markup).toContain(`value="${DEFAULT_EMAIL_THEME[key]}"`);
    }
  });

  it("points each label at its hex field", () => {
    const markup = panel();
    const labels = [...markup.matchAll(/<label for="([^"]+)" class="po-etheme-colour-label"/g)];
    expect(labels).toHaveLength(7);
    for (const [, id] of labels) expect(markup).toContain(`<input id="${id}"`);
  });

  it("shows the colours of the theme it is given", () => {
    const markup = panel({ page: "#0b0b0e", button: "#7046e8" });
    expect(markup).toContain('value="#0b0b0e"');
    expect(markup).toContain('value="#7046e8"');
  });

  it("has no error note until a hex field holds something that is not a colour", () => {
    expect(panel()).not.toContain("Use a hex colour");
    expect(panel()).not.toContain('aria-invalid="true"');
  });

  it("names the font in use, and has corners and space around as segmented rows", () => {
    expect(panel()).toContain("Inter");
    expect(panel({ font: "georgia" })).toContain("Georgia");
    const markup = panel({ corners: "round", spacing: "large" });
    expect(markup).toContain('aria-label="Corners"');
    expect(markup).toContain('aria-label="Space around"');
    expect(pressed(markup)).toContain("Round");
    expect(pressed(markup)).toContain("Large");
  });

  it("says nothing about readability for the shipped looks", () => {
    expect(panel()).not.toContain("Hard to read");
    for (const p of EMAIL_THEME_PRESETS) expect(panel(p.theme)).not.toContain("Hard to read");
  });

  it("warns, in words, about a pairing that is hard to read, with the ratio", () => {
    const markup = panel({ text: "#cccccc" });
    expect(markup).toContain("Hard to read");
    expect(markup).toMatch(/Text on the email background is 1\.\d:1\. Aim for 4\.5:1 or more\./);
    expect(markup).not.toContain("Headings on the email background");
  });

  it("warns about the usual slip: a dark email with the link left at the default", () => {
    const markup = panel({ email: "#18181b", text: "#e4e4e7", heading: "#ffffff" });
    expect(markup).toContain("Links on the email background are 1.0:1");
  });

  it("rounds a ratio down, so one just under the line never reads as the line", () => {
    // #767676 on white is 4.54:1; #777777 is 4.48:1 and must show as 4.4, not 4.5
    const markup = panel({ text: "#777777" });
    expect(markup).toContain("Text on the email background is 4.4:1");
  });

  it("can reset only when there is something to reset", () => {
    expect(panel()).toMatch(/<button[^>]*disabled=""[^>]*>Reset to default<\/button>/);
    expect(panel({ corners: "soft" })).toMatch(
      /<button(?![^>]*disabled)[^>]*>Reset to default<\/button>/,
    );
  });
});
