import { z } from "zod";
import { type EmailTheme, hasValidTheme } from "./email-theme";

/**
 * The editor `document` jsonb once the editor is Maily: a Tiptap doc node
 * stored verbatim (editor.getJSON()). The `html` column, re-rendered from this
 * on save, stays the source of send. This module is client-safe (it carries no
 * heavy render deps) so both the editor and the server routers share the guard.
 *
 * `theme` is the email's own look (email-theme.ts). It sits on the doc node
 * beside `content`, so it is stored, copied and compared with the body.
 */
export type MailyDoc = { type: "doc"; content?: unknown[]; theme?: EmailTheme };

/**
 * True when a stored `document` is renderable Maily JSON (a Tiptap doc node).
 * Legacy BlockDoc rows carry `version`/`blocks` and no top-level `type: "doc"`,
 * so they fail this guard and route to their stored html instead of a re-render.
 */
export function isMailyDoc(value: unknown): value is MailyDoc {
  return (
    typeof value === "object" && value !== null && (value as { type?: unknown }).type === "doc"
  );
}

/**
 * Permissive input guard for the stored `document`: any Tiptap doc node passes
 * and rides through unchanged (z.unknown keeps every key for storage); a legacy
 * BlockDoc or other shape is rejected so only Maily JSON reaches the renderer.
 * The one key it does check is `theme`: its colours go into the html, so a
 * malformed one is refused here rather than rendered.
 */
export const mailyDocumentSchema = z
  .unknown()
  .refine(isMailyDoc, { message: "document is not renderable Maily JSON" })
  .refine(hasValidTheme, { message: "document theme is not valid" });

/**
 * An editor's state as authored, for telling whether it holds unsaved work: a
 * block body's html and text are rendered from its document, so they are left
 * out (a fresh render can differ from the stored copy with nobody editing).
 */
export function authoredState<T extends { html: string; text: string; document: unknown }>(
  state: T,
): T {
  return isMailyDoc(state.document) ? { ...state, html: "", text: "" } : state;
}
