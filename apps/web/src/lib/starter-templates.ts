/**
 * The starters offered on "New template": each a short email, written as a
 * list of blocks (the spec) plus its copy in the UI language, built into the
 * Maily document the editor opens. The words live in `templates.starters.*` in
 * both catalogs, so a starter reads the same way the rest of the app does.
 *
 * Pure and client-safe, like email-doc.ts: the picker, the editor page and the
 * tests all read it. A starter only ever uses the four built-in merge fields,
 * never an image, and only https links.
 *
 * Copy is plain text with two bits of markup, so a translation can put a merge
 * field or a bold word wherever its grammar wants it:
 *   `[FIRST_NAME|there]`  a merge field, with its fallback
 *   `**Order 1042**`      bold
 * Neither uses a brace or an angle bracket, which the message format reserves.
 */

import type { MailyDoc } from "./email-doc";
import { MERGE_BUILTINS, makeMergeToken } from "./merge-fields";

/** The `starter` a new template's address names when it begins empty, as before starters. */
export const BLANK_STARTER = "blank";

export type StarterId = "welcome" | "password-reset" | "receipt" | "product-update" | "newsletter";

/** Transactional starters carry no unsubscribe link; marketing ones do. */
export type StarterKind = "transactional" | "marketing";

/** What a block says, by key under `templates.starters.<id>`. */
type BlockSpec =
  | { kind: "heading"; level: 1 | 2 | 3; copy: string }
  | { kind: "paragraph"; copy: string }
  | { kind: "list"; ordered?: true; items: readonly string[] }
  | { kind: "button"; copy: string; url: string }
  | { kind: "quote"; copy: string }
  | { kind: "divider" }
  /** A closing line with its unsubscribe link: the sentence, then the link's words. */
  | { kind: "unsubscribe"; copy: string; link: string };

export interface StarterSpec {
  id: StarterId;
  kind: StarterKind;
  blocks: readonly BlockSpec[];
}

/**
 * Links in a starter point at example.com, a name reserved for examples. The
 * author replaces them; `placeholderLinks` finds the ones that are left.
 */
export const PLACEHOLDER_HOST = "example.com";

/**
 * Top-level blocks stay flat (no wrapping section), so each moves, duplicates
 * and deletes on its own with the block shortcuts.
 */
export const STARTERS: readonly StarterSpec[] = [
  {
    id: "welcome",
    kind: "transactional",
    blocks: [
      { kind: "heading", level: 1, copy: "heading" },
      { kind: "paragraph", copy: "greeting" },
      { kind: "paragraph", copy: "intro" },
      { kind: "list", items: ["step1", "step2", "step3"] },
      { kind: "button", copy: "button", url: "https://example.com/start" },
      { kind: "paragraph", copy: "help" },
    ],
  },
  {
    id: "password-reset",
    kind: "transactional",
    blocks: [
      { kind: "heading", level: 2, copy: "heading" },
      { kind: "paragraph", copy: "greeting" },
      { kind: "paragraph", copy: "intro" },
      { kind: "button", copy: "button", url: "https://example.com/reset-password" },
      { kind: "paragraph", copy: "expiry" },
      { kind: "divider" },
      { kind: "paragraph", copy: "ignore" },
    ],
  },
  {
    id: "receipt",
    kind: "transactional",
    blocks: [
      { kind: "heading", level: 2, copy: "heading" },
      { kind: "paragraph", copy: "greeting" },
      { kind: "paragraph", copy: "intro" },
      { kind: "list", items: ["order", "item", "total"] },
      { kind: "button", copy: "button", url: "https://example.com/orders/1042" },
      { kind: "paragraph", copy: "help" },
    ],
  },
  {
    id: "product-update",
    kind: "marketing",
    blocks: [
      { kind: "heading", level: 1, copy: "heading" },
      { kind: "paragraph", copy: "greeting" },
      { kind: "paragraph", copy: "intro" },
      { kind: "heading", level: 3, copy: "firstTitle" },
      { kind: "paragraph", copy: "firstBody" },
      { kind: "heading", level: 3, copy: "secondTitle" },
      { kind: "paragraph", copy: "secondBody" },
      { kind: "button", copy: "button", url: "https://example.com/changelog" },
      { kind: "divider" },
      { kind: "unsubscribe", copy: "footer", link: "unsubscribe" },
    ],
  },
  {
    id: "newsletter",
    kind: "marketing",
    blocks: [
      { kind: "heading", level: 1, copy: "heading" },
      { kind: "paragraph", copy: "greeting" },
      { kind: "paragraph", copy: "intro" },
      { kind: "heading", level: 2, copy: "featureTitle" },
      { kind: "paragraph", copy: "featureBody" },
      { kind: "quote", copy: "quote" },
      { kind: "heading", level: 2, copy: "linksTitle" },
      { kind: "list", items: ["link1", "link2", "link3"] },
      { kind: "paragraph", copy: "signoff" },
      { kind: "divider" },
      { kind: "unsubscribe", copy: "footer", link: "unsubscribe" },
    ],
  },
];

export function starterById(id: string): StarterSpec | undefined {
  return STARTERS.find((starter) => starter.id === id);
}

/** What a starter needs to be read in a language. */
export interface StarterCopy {
  /** A key under `templates.starters` ("welcome.heading"), as the message in the UI language. */
  text(key: string): string;
  /** A merge field's label in the editor's pills ("First name"), from `merge-fields`. */
  fieldLabel(labelKey: string): string;
}

type Json = Record<string, unknown>;

const FIELD_LABEL_KEYS = new Map(MERGE_BUILTINS.map((field) => [field.name, field.labelKey]));

const INLINE_RE = /\*\*(.+?)\*\*|\[([A-Z][A-Z0-9_]*)(?:\|([^\]]*))?\]/g;

/** One piece of a line of copy: words (bold or not) or a merge field. */
export type CopyPart =
  | { kind: "text"; text: string; bold: boolean }
  | { kind: "field"; name: string; fallback: string };

/** Split a line of copy at its markup. A line with none comes back as one text part. */
export function parseCopy(copy: string): CopyPart[] {
  const parts: CopyPart[] = [];
  let at = 0;
  for (const match of copy.matchAll(INLINE_RE)) {
    const index = match.index ?? 0;
    if (index > at) parts.push({ kind: "text", text: copy.slice(at, index), bold: false });
    if (match[1] !== undefined) parts.push({ kind: "text", text: match[1], bold: true });
    else parts.push({ kind: "field", name: match[2] ?? "", fallback: match[3] ?? "" });
    at = index + match[0].length;
  }
  if (at < copy.length) parts.push({ kind: "text", text: copy.slice(at), bold: false });
  return parts;
}

/**
 * A line of copy as the merge tokens the worker resolves, for the subject and
 * the preview text (bold has no meaning there, so its markers are dropped).
 */
export function copyAsTokens(copy: string): string {
  return parseCopy(copy)
    .map((part) =>
      part.kind === "field"
        ? makeMergeToken(part.name, part.fallback === "" ? undefined : part.fallback)
        : part.text,
    )
    .join("");
}

function inline(copy: string, fieldLabel: StarterCopy["fieldLabel"]): Json[] {
  return parseCopy(copy)
    .filter((part) => part.kind === "field" || part.text !== "")
    .map((part): Json => {
      if (part.kind === "field") {
        const labelKey = FIELD_LABEL_KEYS.get(part.name);
        return {
          type: "variable",
          attrs: {
            id: part.name,
            label: labelKey !== undefined ? fieldLabel(labelKey) : part.name,
            fallback: part.fallback === "" ? null : part.fallback,
          },
        };
      }
      return {
        type: "text",
        text: part.text,
        ...(part.bold && { marks: [{ type: "bold" }] }),
      };
    });
}

const paragraph = (content: Json[]): Json => ({
  type: "paragraph",
  attrs: { textAlign: "left" },
  content,
});

function block(spec: BlockSpec, say: (key: string) => string, copy: StarterCopy): Json {
  const line = (key: string) => inline(say(key), copy.fieldLabel);
  switch (spec.kind) {
    case "heading":
      return {
        type: "heading",
        attrs: { textAlign: "left", level: spec.level },
        content: line(spec.copy),
      };
    case "paragraph":
      return paragraph(line(spec.copy));
    case "list":
      return {
        type: spec.ordered ? "orderedList" : "bulletList",
        content: spec.items.map((item) => ({
          type: "listItem",
          content: [paragraph(line(item))],
        })),
      };
    case "button":
      return {
        type: "button",
        attrs: {
          text: say(spec.copy),
          isTextVariable: false,
          url: spec.url,
          isUrlVariable: false,
          alignment: "left",
          variant: "filled",
          borderRadius: "smooth",
        },
      };
    case "quote":
      return { type: "blockquote", content: [paragraph(line(spec.copy))] };
    case "divider":
      return { type: "horizontalRule" };
    case "unsubscribe":
      return paragraph([
        // The space between the sentence and its link is not left to a translator.
        ...inline(`${say(spec.copy)} `, copy.fieldLabel),
        {
          type: "text",
          text: say(spec.link),
          marks: [
            {
              type: "link",
              attrs: {
                href: "UNSUBSCRIBE_URL",
                isUrlVariable: true,
                target: "_blank",
                rel: "noopener noreferrer nofollow",
              },
            },
          ],
        },
      ]);
  }
}

/** A starter as the editor opens it: the fields beside the body, and the body. */
export interface StarterTemplate {
  id: StarterId;
  kind: StarterKind;
  name: string;
  /** One line for its card. */
  description: string;
  /** Merge tokens spelled out, as the subject field holds them. */
  subject: string;
  previewText: string;
  document: MailyDoc;
}

/** Build a starter in the language `copy` speaks. */
export function buildStarter(spec: StarterSpec, copy: StarterCopy): StarterTemplate {
  const say = (key: string) => copy.text(`${spec.id}.${key}`);
  return {
    id: spec.id,
    kind: spec.kind,
    name: say("name"),
    description: say("description"),
    subject: copyAsTokens(say("subject")),
    previewText: copyAsTokens(say("previewText")),
    document: { type: "doc", content: spec.blocks.map((b) => block(b, say, copy)) },
  };
}

const PLACEHOLDER_URL_RE = new RegExp(
  `^https?://(?:[^/?#@]*@)?(?:[a-z0-9-]+\\.)*${PLACEHOLDER_HOST.replace(".", "\\.")}(?::\\d+)?(?:[/?#]|$)`,
  "i",
);

/** True for an address on the reserved example host. */
export function isPlaceholderUrl(url: string): boolean {
  return PLACEHOLDER_URL_RE.test(url.trim());
}

/**
 * How many links in a document still point at the example host: buttons and
 * text links. The editor's note about them reads this live, so it goes away as
 * the author replaces them.
 */
export function placeholderLinks(document: unknown): number {
  let count = 0;
  const visit = (value: unknown, depth: number): void => {
    if (typeof value !== "object" || value === null || depth > 40) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const node = value as Json;
    const attrs = (typeof node.attrs === "object" && node.attrs !== null ? node.attrs : {}) as Json;
    if (node.type === "button" && attrs.isUrlVariable !== true) {
      if (typeof attrs.url === "string" && isPlaceholderUrl(attrs.url)) count += 1;
    }
    if (Array.isArray(node.marks)) {
      for (const mark of node.marks as Json[]) {
        const markAttrs = (
          typeof mark?.attrs === "object" && mark.attrs !== null ? mark.attrs : {}
        ) as Json;
        if (
          mark?.type === "link" &&
          markAttrs.isUrlVariable !== true &&
          typeof markAttrs.href === "string" &&
          isPlaceholderUrl(markAttrs.href)
        )
          count += 1;
      }
    }
    if (Array.isArray(node.content)) visit(node.content, depth + 1);
  };
  visit((document as Json | null)?.content, 0);
  return count;
}
