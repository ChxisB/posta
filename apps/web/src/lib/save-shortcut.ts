/** The parts of a keydown the save shortcuts read. */
export interface ShortcutKey {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
}

/** ⌘↵ on a Mac, Ctrl+↵ elsewhere. */
export function isModEnter(event: ShortcutKey): boolean {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey);
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
  if (!(event.metaKey || event.ctrlKey)) return null;
  if (event.key === "s") return dialogOpen ? "suppress" : "save";
  if (event.key === "Enter") return dialogOpen ? null : "saveAndClose";
  return null;
}
