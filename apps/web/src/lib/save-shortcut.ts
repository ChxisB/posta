/** The parts of a keydown the save shortcuts read. */
export interface ShortcutKey {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  /** Optional, so a caller with only the two Mod keys still fits; absent reads as not held. */
  shiftKey?: boolean;
  altKey?: boolean;
}

/**
 * ⌘ (or Ctrl) held on its own. Shift or Alt turn it into another shortcut:
 * ⌘⇧S is the editor's strikethrough and ⌘⇧↵ adds a paragraph, so neither may
 * save or be swallowed by the page.
 */
function modOnly(event: ShortcutKey): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
}

/** ⌘↵ on a Mac, Ctrl+↵ elsewhere. */
export function isModEnter(event: ShortcutKey): boolean {
  return event.key === "Enter" && modOnly(event);
}

/**
 * What an editor page does with a keydown, matching the keycaps on its
 * buttons: ⌘S saves, ⌘↵ saves and closes. "suppress" only stops the browser's
 * own action (its save-page dialog).
 *
 * An open dialog owns the keys: ⌘↵ is its confirm, which Modal handles, so
 * the page must not also save and leave; ⌘S does nothing beneath it.
 */
export function saveShortcut(
  event: ShortcutKey,
  dialogOpen: boolean,
): "save" | "saveAndClose" | "suppress" | null {
  if (!modOnly(event)) return null;
  if (event.key === "s") return dialogOpen ? "suppress" : "save";
  if (event.key === "Enter") return dialogOpen ? null : "saveAndClose";
  return null;
}
