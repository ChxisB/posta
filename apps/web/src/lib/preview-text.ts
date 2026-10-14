/**
 * Inbox preview (preheader) text: the line most inboxes show after the
 * subject. Templates and broadcasts store it beside their body, never in it;
 * it is injected (injectPreheader) wherever the html is sent or previewed.
 * Client-safe: the editors and the routers share these rules.
 */

/** The stored limit, the same as a subject's. Inboxes show far less. */
export const PREVIEW_TEXT_MAX = 998;

/** Past about this many characters, most inboxes cut the line off. */
export const PREVIEW_TEXT_SHOWN = 130;

export type PreviewTextHint = "empty" | "fits" | "long";

/**
 * The field's counter and its gentle hint, never a limit. Empty lets inboxes
 * show the body's opening line instead; past PREVIEW_TEXT_SHOWN the end is cut.
 * A short line needs no hint: the preheader's padding keeps the body out of it.
 */
export function previewTextHint(value: string): { length: number; hint: PreviewTextHint } {
  // Code points, so an emoji counts once, as inboxes show it.
  const length = [...value.trim()].length;
  return {
    length,
    hint: length === 0 ? "empty" : length > PREVIEW_TEXT_SHOWN ? "long" : "fits",
  };
}
