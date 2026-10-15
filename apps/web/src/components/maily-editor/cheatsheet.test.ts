import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en/block-editor.json";
import { ShortcutsButton, ShortcutsList } from "./cheatsheet";
import {
  isChord,
  type KeyPlatform,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  shortcutGroupKey,
  shortcutLabelKey,
  shortcutsIn,
} from "./shortcuts";

function render(children: ReactElement): string {
  const messages = { "block-editor": en };
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale: "en", messages, children }),
  );
}

function list(platform: KeyPlatform): string {
  return render(createElement(ShortcutsList, { platform }));
}

/** The row holding a label, as markup. */
function rowOf(markup: string, label: string): string {
  const row = markup
    .split('<div class="po-shortcuts-row">')
    .find((chunk) => chunk.startsWith(`<dt>${label}</dt>`));
  if (!row) throw new Error(`no row for ${label}`);
  return row;
}

describe("ShortcutsList", () => {
  it("is a section for each group, named by its heading, in the list's order", () => {
    const markup = list("mac");
    let at = -1;
    for (const group of SHORTCUT_GROUPS) {
      const id = `po-shortcuts-${group}`;
      expect(markup).toContain(`<section class="po-shortcuts-group" aria-labelledby="${id}">`);
      expect(markup).toContain(`<h3 id="${id}">`);
      const next = markup.indexOf(`id="${id}"`);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
  });

  it("shows every shortcut in the list once, as a term and its keycaps", () => {
    const markup = list("mac");
    expect(markup.match(/<dt>/g)).toHaveLength(SHORTCUTS.length);
    expect(markup.match(/<dd>/g)).toHaveLength(SHORTCUTS.length);
    for (const entry of SHORTCUTS) {
      expect(markup, entry.id).toContain(
        `<dt>${en.shortcuts.actions[entry.id as keyof typeof en.shortcuts.actions]}</dt>`,
      );
    }
  });

  it("keeps each group's rows under its own heading", () => {
    const markup = list("mac");
    for (const group of SHORTCUT_GROUPS) {
      const start = markup.indexOf(`id="po-shortcuts-${group}"`);
      const end = markup.indexOf("</section>", start);
      const section = markup.slice(start, end);
      expect(section.match(/<dt>/g), group).toHaveLength(shortcutsIn(group).length);
    }
  });

  it("writes a Mac's keycaps as glyphs, in Apple's order", () => {
    const markup = list("mac");
    expect(rowOf(markup, "Duplicate block")).toContain(
      '<kbd class="po-keycap po-shortcuts-cap">⇧</kbd><kbd class="po-keycap po-shortcuts-cap">⌘</kbd><kbd class="po-keycap po-shortcuts-cap">D</kbd>',
    );
    expect(rowOf(markup, "Save and close")).toContain(">⌘</kbd>");
    expect(rowOf(markup, "Save and close")).toContain(">↵</kbd>");
    expect(markup).not.toContain(">Ctrl</kbd>");
  });

  it("writes everyone else's as words", () => {
    const markup = list("other");
    expect(rowOf(markup, "Duplicate block")).toContain(">Ctrl</kbd>");
    expect(rowOf(markup, "Duplicate block")).toContain(">Shift</kbd>");
    expect(rowOf(markup, "Move block up")).toContain(">↑</kbd>");
    expect(rowOf(markup, "Delete block")).toContain(">⌫</kbd>");
    expect(markup).not.toContain("⌘");
  });

  it("shows what to type as it is, with Space spelled out", () => {
    expect(rowOf(list("mac"), "Heading 1")).toBeDefined();
    const markup = list("mac");
    const typed = SHORTCUTS.filter((entry) => !isChord(entry));
    expect(typed.length).toBeGreaterThan(0);
    expect(markup).toContain(">###</kbd>");
    expect(markup).toContain(">Space</kbd>");
    expect(markup).toContain(">?</kbd>");
  });

  it("explains the groups that need it, and only those", () => {
    const markup = list("mac");
    expect(markup.match(/class="po-shortcuts-note"/g)).toHaveLength(2);
    expect(markup).toContain(en.shortcuts.notes.insert);
    expect(markup).toContain(en.shortcuts.notes.blocks);
  });

  it("has a label and a heading for everything it draws", () => {
    for (const entry of SHORTCUTS) {
      const key = shortcutLabelKey(entry.id).replace("shortcuts.actions.", "");
      expect(en.shortcuts.actions, entry.id).toHaveProperty(key);
    }
    for (const group of SHORTCUT_GROUPS) {
      expect(en.shortcuts.groups, group).toHaveProperty(
        shortcutGroupKey(group).replace("shortcuts.groups.", ""),
      );
    }
  });
});

describe("ShortcutsButton", () => {
  it("is a plain button that names the key that does the same", () => {
    const markup = render(createElement(ShortcutsButton, { onClick: () => {} }));
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-keyshortcuts="?"');
    expect(markup).toContain("Shortcuts");
    expect(markup).toContain('<span class="po-keycap" aria-hidden="true">?</span>');
  });
});
