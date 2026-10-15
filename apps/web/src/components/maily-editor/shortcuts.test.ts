import { afterEach, describe, expect, it, vi } from "vitest";
import { isModEnter, saveShortcut } from "@/lib/save-shortcut";
import en from "../../../messages/en/block-editor.json";
import { BLOCK_ACTIONS } from "./block-actions";
import {
  BLOCK_ACTION_IDS,
  blockShortcutFor,
  type Chord,
  type ChordEntry,
  type ChordEvent,
  chordMatches,
  currentKeyPlatform,
  formatKeys,
  formatKeysText,
  isChord,
  isTypingTarget,
  type KeyPlatform,
  keyIsComposing,
  keyPlatform,
  opensCheatsheet,
  parseChord,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  type ShortcutEntry,
  SPACE_CAP,
  shortcutGroupKey,
  shortcutLabelKey,
  shortcutsIn,
  typedCaps,
} from "./shortcuts";

const chords = SHORTCUTS.filter(isChord);

type KeyEvent = ChordEvent & { isComposing?: boolean; keyCode?: number };

/** The keydown that presses this chord on this platform, as a browser reports it. */
function press(keys: string, platform: KeyPlatform, extra: Partial<KeyEvent> = {}): KeyEvent {
  const chord = parseChord(keys) as Chord;
  const named = chord.key.length > 1;
  return {
    key: named ? chord.key : chord.shift ? chord.key.toUpperCase() : chord.key,
    code: named ? chord.key : `Key${chord.key.toUpperCase()}`,
    metaKey: platform === "mac" && chord.mod,
    ctrlKey: platform === "mac" ? chord.ctrl : chord.mod || chord.ctrl,
    shiftKey: chord.shift,
    altKey: chord.alt,
    ...extra,
  };
}

/** A message catalog's value at a dotted path, if there is one. */
function at(catalog: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, part) => {
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)[part]
      : undefined;
  }, catalog);
}

describe("the shortcut list", () => {
  it("gives every entry a unique id", () => {
    const ids = SHORTCUTS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no chord twice, whatever the case of its letter", () => {
    const keys = chords.map((entry) => parseChord(entry.keys));
    const spelled = keys.map((chord) => JSON.stringify(chord));
    expect(new Set(spelled).size).toBe(spelled.length);
  });

  it("has no typed trigger twice", () => {
    const typed = SHORTCUTS.flatMap((entry) => ("typed" in entry ? [entry.typed] : []));
    expect(new Set(typed).size).toBe(typed.length);
  });

  it("holds only chords that parse", () => {
    for (const entry of chords) expect(parseChord(entry.keys), entry.id).not.toBeNull();
  });

  it("puts every entry in a group the cheatsheet shows, and shows every group", () => {
    for (const entry of SHORTCUTS) expect(SHORTCUT_GROUPS, entry.id).toContain(entry.group);
    for (const group of SHORTCUT_GROUPS)
      expect(shortcutsIn(group).length, group).toBeGreaterThan(0);
    expect(shortcutsIn("blocks").map((e) => e.id)).toEqual([
      "moveBlockUp",
      "moveBlockDown",
      "duplicateBlock",
      "deleteBlock",
      "insertParagraphAfter",
    ]);
  });

  it("lists ⌘↵ as save and close, Shift+↵ as a line break and ⌘S as save", () => {
    const keysOf = (id: string) => (SHORTCUTS.find((e) => e.id === id) as ChordEntry).keys;
    expect(keysOf("saveAndClose")).toBe("Mod-Enter");
    expect(keysOf("lineBreak")).toBe("Shift-Enter");
    expect(keysOf("save")).toBe("Mod-s");
  });
});

describe("drift between the list and what is bound", () => {
  const owned = chords.filter((entry) => entry.owner === "posta");

  it("binds every block shortcut in the list, and lists every block shortcut that is bound", () => {
    expect(owned.map((e) => e.id).sort()).toEqual([...BLOCK_ACTION_IDS].sort());
    expect(Object.keys(BLOCK_ACTIONS).sort()).toEqual([...BLOCK_ACTION_IDS].sort());
  });

  it("matches each block shortcut's own keys to its action, on both platforms", () => {
    for (const platform of ["mac", "other"] as const) {
      for (const entry of owned) {
        expect(
          blockShortcutFor(press(entry.keys, platform), platform),
          `${entry.id} ${platform}`,
        ).toBe(entry.id);
      }
    }
  });

  it("has nothing but the block shortcuts answered by blockShortcutFor", () => {
    for (const platform of ["mac", "other"] as const) {
      for (const entry of chords.filter((e) => e.owner !== "posta")) {
        expect(
          blockShortcutFor(press(entry.keys, platform), platform),
          `${entry.id} ${platform}`,
        ).toBeNull();
      }
    }
  });

  it("matches the page's two entries to what the page's listener does", () => {
    for (const platform of ["mac", "other"] as const) {
      expect(saveShortcut(press("Mod-s", platform), false)).toBe("save");
      expect(saveShortcut(press("Mod-Enter", platform), false)).toBe("saveAndClose");
    }
    const page = chords.filter((entry) => entry.owner === "page").map((entry) => entry.id);
    expect(page.sort()).toEqual(["save", "saveAndClose"]);
  });

  it("never lets the page's save listener take another listed chord", () => {
    // ⌘⇧S (strikethrough) and ⌘⇧↵ (paragraph after) once did.
    for (const platform of ["mac", "other"] as const) {
      for (const entry of chords.filter((e) => e.owner !== "page")) {
        const event = press(entry.keys, platform);
        expect(saveShortcut(event, false), `${entry.id} ${platform}`).toBeNull();
        expect(saveShortcut(event, true), `${entry.id} ${platform} under a dialog`).toBeNull();
        expect(isModEnter(event), `${entry.id} ${platform}`).toBe(false);
      }
    }
  });

  it("opens the cheatsheet from the one typed entry that says so", () => {
    expect(SHORTCUTS.find((e) => e.id === "showShortcuts")).toMatchObject({
      typed: "?",
      owner: "page",
    });
    expect(
      opensCheatsheet(
        { key: "?", metaKey: false, ctrlKey: false, shiftKey: true },
        { target: null, dialogOpen: false },
      ),
    ).toBe(true);
  });

  it("gives every entry and group a label", () => {
    for (const catalog of [en]) {
      for (const entry of SHORTCUTS) {
        expect(typeof at(catalog, shortcutLabelKey(entry.id)), entry.id).toBe("string");
      }
      for (const group of SHORTCUT_GROUPS) {
        expect(typeof at(catalog, shortcutGroupKey(group)), group).toBe("string");
      }
    }
  });

  it("has no label for an entry that is not in the list", () => {
    const ids = SHORTCUTS.map((entry) => entry.id).sort();
    for (const catalog of [en]) {
      const labelled = Object.keys(at(catalog, "shortcuts.actions") as object).sort();
      expect(labelled).toEqual(ids);
      const groups = Object.keys(at(catalog, "shortcuts.groups") as object).sort();
      expect(groups).toEqual([...SHORTCUT_GROUPS].sort());
    }
  });
});

describe("keyPlatform", () => {
  it("is mac for Apple systems, in navigator.platform's spelling and user agent data's", () => {
    for (const name of ["MacIntel", "MacPPC", "macOS", "iPhone", "iPad", "iPod"]) {
      expect(keyPlatform(name), name).toBe("mac");
    }
  });

  it("is other for everything else, and when it is unknown", () => {
    for (const name of [
      "Win32",
      "Windows",
      "Linux x86_64",
      "Android",
      "CrOS",
      "",
      null,
      undefined,
    ]) {
      expect(keyPlatform(name), String(name)).toBe("other");
    }
  });

  describe("currentKeyPlatform", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("reads navigator.platform", () => {
      vi.stubGlobal("navigator", { platform: "MacIntel" });
      expect(currentKeyPlatform()).toBe("mac");
      vi.stubGlobal("navigator", { platform: "Win32" });
      expect(currentKeyPlatform()).toBe("other");
    });

    it("prefers user agent data, which is what a Chromium browser trusts", () => {
      vi.stubGlobal("navigator", { platform: "Win32", userAgentData: { platform: "macOS" } });
      expect(currentKeyPlatform()).toBe("mac");
      vi.stubGlobal("navigator", { platform: "MacIntel", userAgentData: { platform: "" } });
      expect(currentKeyPlatform()).toBe("mac");
    });

    it("is other where there is no navigator", () => {
      vi.stubGlobal("navigator", undefined);
      expect(currentKeyPlatform()).toBe("other");
    });
  });
});

describe("parseChord", () => {
  it("reads modifiers and a key", () => {
    expect(parseChord("Mod-Shift-ArrowUp")).toEqual({
      mod: true,
      ctrl: false,
      alt: false,
      shift: true,
      key: "ArrowUp",
    });
    expect(parseChord("Shift-Enter")).toEqual({
      mod: false,
      ctrl: false,
      alt: false,
      shift: true,
      key: "Enter",
    });
    expect(parseChord("Mod-Alt-1")).toEqual({
      mod: true,
      ctrl: false,
      alt: true,
      shift: false,
      key: "1",
    });
    expect(parseChord("Ctrl-Alt-x")).toEqual({
      mod: false,
      ctrl: true,
      alt: true,
      shift: false,
      key: "x",
    });
  });

  it("lower-cases a letter, so Mod-D and Mod-d are one chord", () => {
    expect(parseChord("Mod-D")).toEqual(parseChord("Mod-d"));
  });

  it("is null for nothing, a bare modifier, an unknown or repeated modifier", () => {
    for (const bad of ["", "-", "Mod-", "Hyper-d", "Mod-Mod-d", "Shift-Shift-Enter"]) {
      expect(parseChord(bad), bad).toBeNull();
    }
  });
});

describe("formatKeys", () => {
  it("writes Apple's glyphs in Apple's order on a Mac", () => {
    expect(formatKeys("Mod-Shift-d", "mac")).toEqual(["⇧", "⌘", "D"]);
    expect(formatKeys("Mod-Enter", "mac")).toEqual(["⌘", "↵"]);
    expect(formatKeys("Mod-Alt-1", "mac")).toEqual(["⌥", "⌘", "1"]);
    expect(formatKeys("Ctrl-Alt-Shift-x", "mac")).toEqual(["⌃", "⌥", "⇧", "X"]);
    expect(formatKeys("Shift-Enter", "mac")).toEqual(["⇧", "↵"]);
  });

  it("writes words elsewhere, Ctrl first", () => {
    expect(formatKeys("Mod-Shift-d", "other")).toEqual(["Ctrl", "Shift", "D"]);
    expect(formatKeys("Mod-Enter", "other")).toEqual(["Ctrl", "↵"]);
    expect(formatKeys("Mod-Alt-1", "other")).toEqual(["Ctrl", "Alt", "1"]);
    expect(formatKeys("Shift-Enter", "other")).toEqual(["Shift", "↵"]);
  });

  it("names the arrows, backspace and escape", () => {
    expect(formatKeys("Mod-Shift-ArrowUp", "mac")).toEqual(["⇧", "⌘", "↑"]);
    expect(formatKeys("Mod-Shift-ArrowDown", "other")).toEqual(["Ctrl", "Shift", "↓"]);
    expect(formatKeys("Mod-ArrowLeft", "mac").at(-1)).toBe("←");
    expect(formatKeys("Mod-ArrowRight", "mac").at(-1)).toBe("→");
    expect(formatKeys("Mod-Shift-Backspace", "mac")).toEqual(["⇧", "⌘", "⌫"]);
    expect(formatKeys("Escape", "other")).toEqual(["Esc"]);
  });

  it("writes a letter in capitals", () => {
    expect(formatKeys("Mod-b", "mac")).toEqual(["⌘", "B"]);
  });

  it("is empty for a chord that does not parse", () => {
    expect(formatKeys("Hyper-d", "mac")).toEqual([]);
    expect(formatKeys("", "other")).toEqual([]);
  });

  it("joins the keycaps as one string", () => {
    expect(formatKeysText("Mod-Shift-d", "mac")).toBe("⇧⌘D");
    expect(formatKeysText("Mod-Shift-d", "other")).toBe("Ctrl+Shift+D");
    expect(formatKeysText("Mod-Enter", "mac")).toBe("⌘↵");
  });

  it("gives every chord in the list keycaps on both platforms", () => {
    for (const entry of chords) {
      expect(formatKeys(entry.keys, "mac").length, entry.id).toBeGreaterThan(0);
      expect(formatKeys(entry.keys, "other").length, entry.id).toBeGreaterThan(0);
    }
  });
});

describe("typedCaps", () => {
  it("shows the characters and then a Space cap when a space finishes the trigger", () => {
    expect(typedCaps("# ")).toEqual(["#", SPACE_CAP]);
    expect(typedCaps("### ")).toEqual(["###", SPACE_CAP]);
    expect(typedCaps("1. ")).toEqual(["1.", SPACE_CAP]);
    expect(typedCaps("> ")).toEqual([">", SPACE_CAP]);
  });

  it("shows a trigger with no space as it is", () => {
    expect(typedCaps("/")).toEqual(["/"]);
    expect(typedCaps("---")).toEqual(["---"]);
    expect(typedCaps("?")).toEqual(["?"]);
  });
});

describe("chordMatches", () => {
  const up = parseChord("Mod-Shift-ArrowUp") as Chord;
  const base = { key: "ArrowUp", metaKey: false, ctrlKey: false, shiftKey: true, altKey: false };

  it("takes ⌘ on a Mac and Ctrl elsewhere as Mod", () => {
    expect(chordMatches({ ...base, metaKey: true }, up, "mac")).toBe(true);
    expect(chordMatches({ ...base, ctrlKey: true }, up, "other")).toBe(true);
  });

  it("does not take the other platform's key", () => {
    expect(chordMatches({ ...base, ctrlKey: true }, up, "mac")).toBe(false);
    expect(chordMatches({ ...base, metaKey: true }, up, "other")).toBe(false);
  });

  it("is exact: a held key the chord lacks, or a missing one, is another shortcut", () => {
    expect(chordMatches({ ...base, metaKey: true, altKey: true }, up, "mac")).toBe(false);
    expect(chordMatches({ ...base, metaKey: true, ctrlKey: true }, up, "mac")).toBe(false);
    expect(chordMatches({ ...base, ctrlKey: true, metaKey: true }, up, "other")).toBe(false);
    expect(chordMatches({ ...base, metaKey: true, shiftKey: false }, up, "mac")).toBe(false);
    expect(chordMatches({ ...base, metaKey: false }, up, "mac")).toBe(false);
  });

  it("matches a letter whatever its case, and by position on a layout with other letters", () => {
    const d = parseChord("Mod-Shift-d") as Chord;
    const mac = { metaKey: true, ctrlKey: false, shiftKey: true, altKey: false };
    expect(chordMatches({ ...mac, key: "D" }, d, "mac")).toBe(true);
    expect(chordMatches({ ...mac, key: "d" }, d, "mac")).toBe(true);
    expect(chordMatches({ ...mac, key: "в", code: "KeyD" }, d, "mac")).toBe(true);
    expect(chordMatches({ ...mac, key: "e", code: "KeyE" }, d, "mac")).toBe(false);
  });

  it("matches a named key by name", () => {
    const bs = parseChord("Mod-Shift-Backspace") as Chord;
    expect(
      chordMatches(
        { key: "Backspace", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false },
        bs,
        "mac",
      ),
    ).toBe(true);
    expect(
      chordMatches(
        { key: "Delete", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false },
        bs,
        "mac",
      ),
    ).toBe(false);
  });
});

describe("blockShortcutFor", () => {
  it("is null for keys that are not block shortcuts", () => {
    const mac = { metaKey: true, ctrlKey: false, shiftKey: false, altKey: false };
    expect(blockShortcutFor({ ...mac, key: "d" }, "mac")).toBeNull();
    expect(blockShortcutFor({ ...mac, key: "ArrowUp" }, "mac")).toBeNull();
    expect(blockShortcutFor({ ...mac, key: "Enter" }, "mac")).toBeNull();
    expect(blockShortcutFor({ ...mac, key: "Backspace" }, "mac")).toBeNull();
    expect(
      blockShortcutFor(
        { key: "Enter", metaKey: false, ctrlKey: false, shiftKey: true, altKey: false },
        "mac",
      ),
    ).toBeNull();
    expect(
      blockShortcutFor(
        { key: "a", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false },
        "other",
      ),
    ).toBeNull();
  });

  it("is ⌘⇧↵ for a paragraph after, which is not ⌘↵", () => {
    expect(blockShortcutFor(press("Mod-Shift-Enter", "mac"), "mac")).toBe("insertParagraphAfter");
    expect(blockShortcutFor(press("Mod-Enter", "mac"), "mac")).toBeNull();
  });

  it("never fires while an input method is composing", () => {
    for (const platform of ["mac", "other"] as const) {
      for (const id of BLOCK_ACTION_IDS) {
        const keys = (SHORTCUTS.find((e) => e.id === id) as ChordEntry).keys;
        expect(
          blockShortcutFor(press(keys, platform, { isComposing: true }), platform),
          id,
        ).toBeNull();
        // Browsers report 229 as the key code of a composing keydown.
        expect(blockShortcutFor(press(keys, platform, { keyCode: 229 }), platform), id).toBeNull();
      }
    }
  });
});

describe("keyIsComposing", () => {
  it("reads isComposing and the 229 key code", () => {
    expect(keyIsComposing({ isComposing: true })).toBe(true);
    expect(keyIsComposing({ keyCode: 229 })).toBe(true);
    expect(keyIsComposing({ isComposing: false, keyCode: 13 })).toBe(false);
    expect(keyIsComposing({})).toBe(false);
  });
});

describe("isTypingTarget", () => {
  it("is a field, a select, a textarea", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "input"]) {
      expect(isTypingTarget({ tagName }), tagName).toBe(true);
    }
  });

  it("is anything editable, which is the email and the code editor", () => {
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("is anything that says it is a text box", () => {
    expect(isTypingTarget({ tagName: "DIV", role: "textbox" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", role: "combobox" })).toBe(true);
  });

  it("is not a button, a link, the page", () => {
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget({ tagName: "A", role: null })).toBe(false);
    expect(isTypingTarget({ tagName: "BODY", isContentEditable: false })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });
});

describe("opensCheatsheet", () => {
  const question = { key: "?", metaKey: false, ctrlKey: false, shiftKey: true, altKey: false };
  const outside = { target: { tagName: "BODY" }, dialogOpen: false };

  it("opens on a bare ? outside any field, with Shift or without it", () => {
    expect(opensCheatsheet(question, outside)).toBe(true);
    expect(opensCheatsheet({ ...question, shiftKey: false }, outside)).toBe(true);
    expect(opensCheatsheet(question, { target: { tagName: "BUTTON" }, dialogOpen: false })).toBe(
      true,
    );
  });

  it("does not open from other keys, or with ⌘, Ctrl or Alt held", () => {
    expect(opensCheatsheet({ ...question, key: "/" }, outside)).toBe(false);
    expect(opensCheatsheet({ ...question, metaKey: true }, outside)).toBe(false);
    expect(opensCheatsheet({ ...question, ctrlKey: true }, outside)).toBe(false);
    expect(opensCheatsheet({ ...question, altKey: true }, outside)).toBe(false);
  });

  it("does not open while the person types, in the email or the code editor or a field", () => {
    for (const target of [
      { tagName: "INPUT" },
      { tagName: "TEXTAREA" },
      { tagName: "DIV", isContentEditable: true },
    ]) {
      expect(opensCheatsheet(question, { target, dialogOpen: false })).toBe(false);
    }
  });

  it("does not open over a dialog, or when someone has already taken the key, or while composing", () => {
    expect(opensCheatsheet(question, { ...outside, dialogOpen: true })).toBe(false);
    expect(opensCheatsheet({ ...question, defaultPrevented: true }, outside)).toBe(false);
    expect(opensCheatsheet({ ...question, isComposing: true }, outside)).toBe(false);
    expect(opensCheatsheet({ ...question, keyCode: 229 }, outside)).toBe(false);
  });
});

describe("list shape", () => {
  it("types every entry as a chord or typed characters", () => {
    for (const entry of SHORTCUTS as readonly ShortcutEntry[]) {
      expect("keys" in entry !== "typed" in entry, entry.id).toBe(true);
    }
  });
});
