import { describe, expect, it } from "vitest";
import { isModEnter, saveShortcut } from "./save-shortcut";

const key = (
  k: string,
  mod: "meta" | "ctrl" | null = "meta",
  extra: { shiftKey?: boolean; altKey?: boolean } = {},
) => ({
  key: k,
  metaKey: mod === "meta",
  ctrlKey: mod === "ctrl",
  ...extra,
});

describe("saveShortcut", () => {
  it("saves on ⌘S and saves and closes on ⌘↵, with Ctrl as well", () => {
    expect(saveShortcut(key("s"), false)).toBe("save");
    expect(saveShortcut(key("Enter"), false)).toBe("saveAndClose");
    expect(saveShortcut(key("s", "ctrl"), false)).toBe("save");
    expect(saveShortcut(key("Enter", "ctrl"), false)).toBe("saveAndClose");
  });

  it("ignores keys without the modifier, and other modified keys", () => {
    expect(saveShortcut(key("s", null), false)).toBeNull();
    expect(saveShortcut(key("Enter", null), false)).toBeNull();
    expect(saveShortcut(key("k"), false)).toBeNull();
  });

  it("leaves ⌘⇧ and ⌘⌥ chords to the editor: they are other shortcuts", () => {
    for (const mod of ["meta", "ctrl"] as const) {
      for (const extra of [
        { shiftKey: true },
        { altKey: true },
        { shiftKey: true, altKey: true },
      ]) {
        expect(saveShortcut(key("Enter", mod, extra), false)).toBeNull();
        expect(saveShortcut(key("s", mod, extra), false)).toBeNull();
        // Not even swallowed under a dialog: ⌘⇧S is no business of the page's.
        expect(saveShortcut(key("s", mod, extra), true)).toBeNull();
      }
    }
  });

  it("reads Shift and Alt as not held when the event does not say", () => {
    expect(saveShortcut({ key: "s", metaKey: true, ctrlKey: false }, false)).toBe("save");
    expect(saveShortcut(key("s", "meta", { shiftKey: false, altKey: false }), false)).toBe("save");
  });

  it("leaves ⌘↵ to an open dialog and does nothing on ⌘S beneath it", () => {
    expect(saveShortcut(key("Enter"), true)).toBeNull();
    // Still swallowed, so the browser's save-page dialog never opens.
    expect(saveShortcut(key("s"), true)).toBe("suppress");
  });
});

describe("isModEnter", () => {
  it("is ⌘↵ or Ctrl+↵ only", () => {
    expect(isModEnter(key("Enter"))).toBe(true);
    expect(isModEnter(key("Enter", "ctrl"))).toBe(true);
    expect(isModEnter(key("Enter", null))).toBe(false);
    expect(isModEnter(key("s"))).toBe(false);
  });

  it("is not ⌘⇧↵ or ⌘⌥↵, which the editor uses for itself", () => {
    expect(isModEnter(key("Enter", "meta", { shiftKey: true }))).toBe(false);
    expect(isModEnter(key("Enter", "ctrl", { altKey: true }))).toBe(false);
  });
});
