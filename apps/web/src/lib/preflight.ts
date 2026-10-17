/**
 * Preflight: what is likely to go wrong with a template's email, found before
 * it is saved or sent. Pure and client-safe (no render dependencies, like
 * email-doc.ts): it reads the editor's Maily document, the fields beside it,
 * and the html the last render produced, and returns a list of issues. It
 * never blocks anything; the strip that shows the list is advice.
 *
 * Every issue says where it is: a node of the document (a path through its
 * `content` arrays), the subject or preview text field, or the email as a
 * whole. The stored document is `unknown` JSON, so the walk keeps its types
 * loose and reads only the attributes it needs.
 *
 * Deliberately not a rule: a missing unsubscribe link. Templates serve
 * transactional mail too, and broadcasts have their own unsubscribe handling.
 */

import { isMailyDoc } from "./email-doc";
import { type EmailColourKey, themeContrastIssues, themeOf } from "./email-theme";
import { MERGE_TOKEN_RE, type MergeFieldOption, parseMergeToken } from "./merge-fields";
import { PREVIEW_TEXT_SHOWN, previewTextHint } from "./preview-text";

/**
 * Gmail clips a message past about 102 KB of html and hides the rest behind
 * "View entire message". Measured in bytes of the rendered html (UTF-8, before
 * the preheader and unsubscribe footer are added at send), so it is a floor on
 * what a recipient's client receives.
 */
export const GMAIL_CLIP_BYTES = 102 * 1024;

/** From here the email is close enough to the clip that a small edit can cross it. */
export const SIZE_NEAR_BYTES = 90 * 1024;

/** Aliases the send worker replaces by hand, so they are not unknown names. */
const LITERAL_ALIASES: readonly string[] = ["RESEND_UNSUBSCRIBE_URL"];

/** The longest a context snippet runs before it is cut with an ellipsis. */
const CONTEXT_MAX = 60;

/** Deeper than any real email nests; a stored document past it is not walked further. */
const MAX_DEPTH = 100;

export type PreflightSeverity = "error" | "warn";

export type PreflightRuleId =
  | "link-empty"
  | "link-invalid"
  | "link-insecure"
  | "image-src-missing"
  | "image-src-invalid"
  | "image-alt-missing"
  | "merge-field-unknown"
  | "merge-field-no-fallback"
  | "merge-field-malformed"
  | "merge-field-braces"
  | "subject-empty"
  | "preview-text-empty"
  | "preview-text-long"
  | "theme-contrast-low"
  | "size-near"
  | "size-over";

/**
 * Every message the strip can show, a rule's id or a variant of it. Both
 * locales must carry each one under `templates.preflight.issue`.
 */
export const PREFLIGHT_MESSAGE_KEYS = [
  "link-empty",
  "link-invalid",
  "link-insecure",
  "image-src-missing",
  "image-src-invalid",
  "image-alt-missing",
  "merge-field-unknown",
  "merge-field-unknown-suggest",
  "merge-field-no-fallback",
  "merge-field-malformed",
  "merge-field-braces",
  "subject-empty",
  "preview-text-empty",
  "preview-text-long",
  "theme-contrast-text",
  "theme-contrast-heading",
  "theme-contrast-link",
  "theme-contrast-button",
  "size-near",
  "size-over",
] as const;

export type PreflightMessageKey = (typeof PREFLIGHT_MESSAGE_KEYS)[number];

/** The kinds of node an issue can sit on; the strip names the place by this. */
export type PreflightNodeKind =
  | "text"
  | "link"
  | "button"
  | "image"
  | "logo"
  | "inlineImage"
  | "linkCard"
  | "variable";

export type PreflightAt =
  | { scope: "email" }
  | { scope: "subject" }
  | { scope: "previewText" }
  /** A colour in the email's theme: `field` is the one to change. */
  | { scope: "theme"; field: EmailColourKey }
  /** `path` indexes down the document's `content` arrays to the node. */
  | { scope: "node"; path: number[]; node: PreflightNodeKind };

export interface PreflightIssue {
  id: PreflightRuleId;
  severity: PreflightSeverity;
  messageKey: PreflightMessageKey;
  /** Values for the message's placeholders. */
  params?: Record<string, string | number>;
  at: PreflightAt;
  /** A short piece of the email that identifies the spot: a link's address, a button's label. */
  context?: string;
}

export interface PreflightInput {
  subject: string;
  previewText: string;
  /** The editor's Maily document; anything else is an html-authored body. */
  document: unknown;
  /** The html the last render produced (or the source itself for an html-authored body). */
  html: string;
  mergeFields: readonly MergeFieldOption[];
}

export function preflightCounts(issues: readonly PreflightIssue[]): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  for (const issue of issues) if (issue.severity === "error") errors += 1;
  return { errors, warnings: issues.length - errors };
}

// ---------------------------------------------------------------------------
// Merge tokens

interface TokenScan {
  tokens: { name: string; fallback: string | undefined }[];
  /** A `{{{…}}}` group the worker would not resolve, as typed. */
  malformed: string | null;
  /** A `{{name}}` group: two braces, which the worker leaves as typed. */
  braces: string | null;
}

/**
 * The merge tokens in a piece of text, read the way the save guard reads them
 * (see hasWellFormedMergeTokens): each `{{{` opens a group that must be a
 * whole, well-formed token. An opener with no closer counts as malformed too,
 * since it would send as broken text.
 */
export function scanMergeTokens(value: string): TokenScan {
  const scan: TokenScan = { tokens: [], malformed: null, braces: null };
  let rest = "";
  let from = 0;
  for (let open = value.indexOf("{{{"); open !== -1; ) {
    rest += value.slice(from, open);
    const close = value.indexOf("}}}", open + 3);
    if (close === -1) {
      scan.malformed ??= value.slice(open);
      from = value.length;
      break;
    }
    const group = value.slice(open, close + 3);
    const token = parseMergeToken(group);
    if (token) scan.tokens.push({ name: token.name, fallback: token.fallback });
    else scan.malformed ??= group;
    from = close + 3;
    open = value.indexOf("{{{", from);
  }
  rest += value.slice(from);
  scan.braces = /\{\{[^{}]+\}\}/.exec(rest)?.[0] ?? null;
  return scan;
}

/** Lower case, underscores gone: `first_name` and `FIRST_NAME` and `FirstName` agree. */
function looseName(name: string): string {
  return name.replace(/_/g, "").toLowerCase();
}

// ---------------------------------------------------------------------------
// Urls

type UrlKind = "web" | "mail" | "insecure" | "token" | "invalid";

const LEADING_TOKEN_RE = new RegExp(`^${MERGE_TOKEN_RE.source}`);

/**
 * What an address is: a merge token leading it (its scheme comes from the
 * contact's value at send), https, http, mailto/tel, or something an email
 * cannot use (no scheme, a relative path, javascript:).
 */
function urlKind(value: string): UrlKind {
  if (LEADING_TOKEN_RE.test(value)) return "token";
  let url: URL;
  try {
    // A token further in stands for any text, so it probes as a letter.
    url = new URL(value.replace(MERGE_TOKEN_RE, "x"));
  } catch {
    return "invalid";
  }
  if (url.protocol === "https:") return "web";
  if (url.protocol === "http:") return "insecure";
  if ((url.protocol === "mailto:" || url.protocol === "tel:") && url.pathname !== "") return "mail";
  return "invalid";
}

// ---------------------------------------------------------------------------
// The walk

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clip(value: string, max = CONTEXT_MAX): string {
  const chars = [...value.trim().replace(/\s+/g, " ")];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
}

/** The file name at the end of an image address, to tell one image from another. */
function fileName(src: string): string {
  const last = src.split(/[?#]/)[0]?.split("/").pop() ?? "";
  return clip(last);
}

class Checker {
  readonly issues: PreflightIssue[] = [];
  private readonly byName = new Map<string, MergeFieldOption>();
  private readonly loose = new Map<string, string>();

  constructor(fields: readonly MergeFieldOption[]) {
    for (const field of fields) {
      this.byName.set(field.name, field);
      const key = looseName(field.name);
      if (!this.loose.has(key)) this.loose.set(key, field.name);
    }
  }

  add(issue: PreflightIssue): void {
    this.issues.push(issue);
  }

  /** A merge field's name: known, spelt as the list spells it, and with a fallback where it needs one. */
  checkName(name: string, fallback: string | undefined, at: PreflightAt, context?: string): void {
    const field = this.byName.get(name);
    if (!field) {
      if (LITERAL_ALIASES.includes(name)) return;
      const suggestion = this.loose.get(looseName(name));
      this.add({
        id: "merge-field-unknown",
        severity: "error",
        messageKey:
          suggestion !== undefined ? "merge-field-unknown-suggest" : "merge-field-unknown",
        params: suggestion !== undefined ? { name, suggestion } : { name },
        at,
        ...(context !== undefined && { context }),
      });
      return;
    }
    // A contact property can be missing on a contact, which leaves a gap. The
    // built-ins are not flagged: the editor deliberately hides Maily's
    // "required" marker for them, so the strip adds no noise there either.
    if (!field.builtin && (fallback === undefined || fallback === "")) {
      this.add({
        id: "merge-field-no-fallback",
        severity: "warn",
        messageKey: "merge-field-no-fallback",
        params: { name },
        at,
        ...(context !== undefined && { context }),
      });
    }
  }

  /** Everything the tokens typed into a piece of text can get wrong. Returns false when it is malformed. */
  checkTokens(value: string, at: PreflightAt, context?: string): boolean {
    if (!value.includes("{{")) return true;
    const scan = scanMergeTokens(value);
    if (scan.malformed !== null) {
      this.add({
        id: "merge-field-malformed",
        severity: "error",
        messageKey: "merge-field-malformed",
        params: { example: "{{{FIRST_NAME}}}" },
        at,
        context: clip(scan.malformed),
      });
    }
    if (scan.braces !== null) {
      this.add({
        id: "merge-field-braces",
        severity: "warn",
        messageKey: "merge-field-braces",
        params: { example: "{{{FIRST_NAME}}}" },
        at,
        context: clip(scan.braces),
      });
    }
    for (const token of scan.tokens) this.checkName(token.name, token.fallback, at, context);
    return scan.malformed === null;
  }

  /** A link's address: present, a usable scheme, https rather than http. */
  checkLink(
    value: string,
    isVariable: boolean,
    node: PreflightNodeKind,
    at: PreflightAt,
    label: string,
  ): void {
    const address = value.trim();
    if (address === "") {
      this.add({
        id: "link-empty",
        severity: "error",
        messageKey: "link-empty",
        params: { node },
        at,
        ...(label !== "" && { context: label }),
      });
      return;
    }
    // A variable address is a merge field's name, not a url.
    if (isVariable) {
      this.checkName(address, undefined, at, label || undefined);
      return;
    }
    if (!this.checkTokens(address, at, clip(address))) return;
    const kind = urlKind(address);
    if (kind === "invalid") {
      this.add({
        id: "link-invalid",
        severity: "error",
        messageKey: "link-invalid",
        params: { node },
        at,
        context: clip(address),
      });
    } else if (kind === "insecure") {
      this.add({
        id: "link-insecure",
        severity: "warn",
        messageKey: "link-insecure",
        params: { node },
        at,
        context: clip(address),
      });
    }
  }

  /** An image, logo or inline image: its source, its alt text, and where it links. */
  checkImage(attrs: Json, node: PreflightNodeKind, at: PreflightAt, linkable: boolean): void {
    const src = str(attrs.src).trim();
    const context = src === "" ? undefined : fileName(src);
    if (src === "") {
      this.add({
        id: "image-src-missing",
        severity: "error",
        messageKey: "image-src-missing",
        params: { node },
        at,
      });
    } else if (attrs.isSrcVariable === true) {
      this.checkName(src, undefined, at, context);
    } else if (this.checkTokens(src, at, context)) {
      const kind = urlKind(src);
      if (kind !== "web" && kind !== "insecure" && kind !== "token") {
        this.add({
          id: "image-src-invalid",
          severity: "error",
          messageKey: "image-src-invalid",
          params: { node },
          at,
          context: clip(src),
        });
      }
    }
    // Maily falls back to the title, then to "Image", for a missing alt: only
    // a title is a description. Alt text on an image with no source is moot.
    if (src !== "" && str(attrs.alt).trim() === "" && str(attrs.title).trim() === "") {
      this.add({
        id: "image-alt-missing",
        severity: "warn",
        messageKey: "image-alt-missing",
        params: { node },
        at,
        ...(context !== undefined && { context }),
      });
    }
    // An empty link is no link at all, the usual case, so only a filled one is checked.
    const link = str(attrs.externalLink).trim();
    if (linkable && link !== "") {
      this.checkLink(link, attrs.isExternalLinkVariable === true, "image", at, context ?? "");
    }
  }

  walkChildren(parent: Json, path: number[], depth: number, raw: boolean): void {
    const children = Array.isArray(parent.content) ? (parent.content as unknown[]) : [];
    for (let i = 0; i < children.length; i += 1) {
      this.walk(children[i], asObject(children[i - 1]), [...path, i], depth, raw);
    }
  }

  walk(value: unknown, prev: Json | null, path: number[], depth: number, raw = false): void {
    const node = asObject(value);
    if (!node || depth > MAX_DEPTH) return;
    const type = str(node.type);
    const attrs = asObject(node.attrs) ?? {};
    const at = (kind: PreflightNodeKind): PreflightAt => ({ scope: "node", path, node: kind });

    switch (type) {
      case "text": {
        // The raw html of an html block is not text a recipient reads as typed.
        if (raw) return;
        const text = str(node.text);
        this.checkTokens(text, at("text"), clip(text));
        const marks = Array.isArray(node.marks) ? node.marks : [];
        for (const markValue of marks) {
          const mark = asObject(markValue);
          if (mark?.type !== "link") continue;
          const markAttrs = asObject(mark.attrs) ?? {};
          const href = str(markAttrs.href);
          // One link split by bold or italic is several text nodes; check it once.
          const before = (Array.isArray(prev?.marks) ? prev.marks : [])
            .map(asObject)
            .find((m) => m?.type === "link");
          if (before && str(asObject(before.attrs)?.href) === href) continue;
          this.checkLink(href, markAttrs.isUrlVariable === true, "link", at("link"), clip(text));
        }
        return;
      }
      case "variable": {
        const id = str(attrs.id);
        if (id !== "") this.checkName(id, str(attrs.fallback), at("variable"));
        return;
      }
      case "button": {
        const label = str(attrs.text);
        this.checkLink(
          str(attrs.url),
          attrs.isUrlVariable === true,
          "button",
          at("button"),
          clip(label),
        );
        if (attrs.isTextVariable === true) {
          if (label.trim() !== "")
            this.checkName(label.trim(), undefined, at("button"), clip(label));
        } else {
          this.checkTokens(label, at("button"), clip(label));
        }
        return;
      }
      case "image":
        this.checkImage(attrs, "image", at("image"), true);
        return;
      case "inlineImage":
        this.checkImage(attrs, "inlineImage", at("inlineImage"), true);
        return;
      case "logo":
        this.checkImage(attrs, "logo", at("logo"), false);
        return;
      case "linkCard":
        this.checkLink(str(attrs.link), false, "linkCard", at("linkCard"), clip(str(attrs.title)));
        return;
      default:
        break;
    }
    this.walkChildren(node, path, depth + 1, raw || type === "htmlCodeBlock");
  }
}

// ---------------------------------------------------------------------------
// The checks

const utf8 = new TextEncoder();

/** The colour to change first for each pair that can read badly: the one a person chose to write with. */
const THEME_PAIR_FIELD: Record<"text" | "heading" | "link" | "button", EmailColourKey> = {
  text: "text",
  heading: "heading",
  link: "link",
  button: "buttonText",
};

/** Errors first, then warnings, each in the order found (document order for nodes). */
export function preflight(input: PreflightInput): PreflightIssue[] {
  const checker = new Checker(input.mergeFields);

  const subject = input.subject.trim();
  const subjectAt: PreflightAt = { scope: "subject" };
  if (subject === "") {
    checker.add({
      id: "subject-empty",
      severity: "warn",
      messageKey: "subject-empty",
      at: subjectAt,
    });
  } else {
    checker.checkTokens(subject, subjectAt);
  }

  const previewAt: PreflightAt = { scope: "previewText" };
  const { length, hint } = previewTextHint(input.previewText);
  if (hint === "empty") {
    checker.add({
      id: "preview-text-empty",
      severity: "warn",
      messageKey: "preview-text-empty",
      at: previewAt,
    });
  } else {
    if (hint === "long") {
      checker.add({
        id: "preview-text-long",
        severity: "warn",
        messageKey: "preview-text-long",
        params: { length, shown: PREVIEW_TEXT_SHOWN },
        at: previewAt,
      });
    }
    checker.checkTokens(input.previewText.trim(), previewAt);
  }

  if (isMailyDoc(input.document)) {
    checker.walkChildren(input.document as unknown as Json, [], 0, false);
  } else if (input.html.includes("{{")) {
    // An html-authored body has no nodes to walk; its tokens are read from the
    // source, once per name, and point at the email as a whole.
    const scope: PreflightAt = { scope: "email" };
    const source = new Checker(input.mergeFields);
    source.checkTokens(input.html, scope);
    const seen = new Set<string>();
    for (const issue of source.issues) {
      const key = `${issue.messageKey}:${JSON.stringify(issue.params ?? {})}`;
      if (seen.has(key)) continue;
      seen.add(key);
      checker.add(issue);
    }
  }

  // The theme's colours, for a block body (an html-authored one has none).
  // Advice only: low contrast still sends, and the panel says the same.
  if (isMailyDoc(input.document)) {
    for (const { pair, ratio } of themeContrastIssues(themeOf(input.document))) {
      checker.add({
        id: "theme-contrast-low",
        severity: "warn",
        messageKey: `theme-contrast-${pair}`,
        // Rounded down: a ratio just under the line never reads as the line.
        params: { ratio: Math.floor(ratio * 10) / 10 },
        at: { scope: "theme", field: THEME_PAIR_FIELD[pair] },
      });
    }
  }

  const bytes = input.html === "" ? 0 : utf8.encode(input.html).length;
  const sizeParams = { size: Math.round(bytes / 1024), limit: GMAIL_CLIP_BYTES / 1024 };
  if (bytes > GMAIL_CLIP_BYTES) {
    checker.add({
      id: "size-over",
      severity: "error",
      messageKey: "size-over",
      params: sizeParams,
      at: { scope: "email" },
    });
  } else if (bytes >= SIZE_NEAR_BYTES) {
    checker.add({
      id: "size-near",
      severity: "warn",
      messageKey: "size-near",
      params: sizeParams,
      at: { scope: "email" },
    });
  }

  const rank = (issue: PreflightIssue) => (issue.severity === "error" ? 0 : 1);
  return checker.issues.sort((a, b) => rank(a) - rank(b));
}
