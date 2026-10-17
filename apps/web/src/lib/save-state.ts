/**
 * The one save state an editor's header shows, most urgent first:
 *
 * - `saving`: a save is in flight;
 * - `error`: the last save failed, and it stays until a save succeeds, edits
 *   or not (the local draft and the leave prompt keep the changes meanwhile);
 * - `preparing`: there are changes, but Save waits on the server render of
 *   a new block body (it has no html to save yet);
 * - `dirty`: changes since the last save, including any typed while a save
 *   was in flight;
 * - `saved`: nothing unsaved, last saved `at` (epoch ms);
 * - `new`: a new template nobody has typed into, never saved.
 */
export type SaveState =
  | { kind: "saving" }
  | { kind: "error" }
  | { kind: "preparing" }
  | { kind: "dirty" }
  | { kind: "saved"; at: number }
  | { kind: "new" };

export function saveState(input: {
  saving: boolean;
  failed: boolean;
  dirty: boolean;
  preparing: boolean;
  savedAt: number | null;
}): SaveState {
  if (input.saving) return { kind: "saving" };
  if (input.failed) return { kind: "error" };
  if (input.dirty) return input.preparing ? { kind: "preparing" } : { kind: "dirty" };
  if (input.savedAt !== null) return { kind: "saved", at: input.savedAt };
  return { kind: "new" };
}

/** When it was saved: the time alone today ("2:32 PM" / "14:32"), else with the day ("Oct 12, 2:32 PM"). */
export function formatSavedAt(at: number, locale: string, now: Date = new Date()): string {
  const when = new Date(at);
  const today = when.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(locale, {
    ...(today ? {} : { month: "short", day: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  }).format(when);
}
