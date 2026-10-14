import { describe, expect, it } from "vitest";
import { isModEnter, saveShortcut } from "./save-shortcut";

const key = (k: string, mod: "meta" | "ctrl" | null = "meta") => ({
  key: k,
  metaKey: mod === "meta",
  ctrlKey: mod === "ctrl",
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
});
