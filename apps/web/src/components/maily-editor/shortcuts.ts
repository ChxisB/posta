import type { ShortcutKey } from "@/lib/save-shortcut";

/**
 * Every keyboard shortcut a block editor page offers, in one list. It drives
 * the behaviour (the block shortcuts are matched from it) and the cheatsheet
 * (the dialog is drawn from it), and a drift test holds the two together, so a
 * shortcut that exists is on the cheatsheet and one on the cheatsheet exists.
 */

export type ShortcutGroup = "insert" | "write" | "text" | "blocks" | "page";

/** The order the cheatsheet shows the groups in. */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  "insert",
  "write",
  "text",
  "blocks",
  "page",
];

/**
 * Who answers the key:
 * - `posta`: bound in `MailyEditor` from this list (`blockShortcutFor`).
 * - `editor`: built into the editor (Tiptap's keymaps and input rules, Maily's
 *   slash menu). Listed because it works; checked in the browser, not here.
 * - `page`: the template page's own listener (`saveShortcut`), or the
 *   cheatsheet's `?`.
 */
export type ShortcutOwner = "posta" | "editor" | "page";

/** What the block shortcuts do; `block-actions.ts` holds one function for each. */
export const BLOCK_ACTION_IDS = [
  "moveBlockUp",
  "moveBlockDown",
  "duplicateBlock",
  "deleteBlock",
  "insertParagraphAfter",
] as const;
export type BlockActionId = (typeof BLOCK_ACTION_IDS)[number];

interface EntryBase {
  /** The entry's name, and the key of its label in `block-editor.shortcuts.actions`. */
  id: string;
  group: ShortcutGroup;
  owner: ShortcutOwner;
}

/** Held keys, in Tiptap's spelling: `Mod-Shift-ArrowUp`. Mod is ⌘ on a Mac and Ctrl elsewhere. */
export interface ChordEntry extends EntryBase {
  keys: string;
}

/** Characters to type, as in `# ` for a heading: it shows as keycaps, not as a chord. */
export interface TypedEntry extends EntryBase {
  typed: string;
}

export type ShortcutEntry = ChordEntry | TypedEntry;

export const SHORTCUTS: readonly ShortcutEntry[] = [
  // Insert
  { id: "slashMenu", typed: "/", group: "insert", owner: "editor" },
  { id: "heading1Rule", typed: "# ", group: "insert", owner: "editor" },
  { id: "heading2Rule", typed: "## ", group: "insert", owner: "editor" },
  { id: "heading3Rule", typed: "### ", group: "insert", owner: "editor" },
  { id: "bulletRule", typed: "- ", group: "insert", owner: "editor" },
  { id: "orderedRule", typed: "1. ", group: "insert", owner: "editor" },
  { id: "quoteRule", typed: "> ", group: "insert", owner: "editor" },
  { id: "dividerRule", typed: "---", group: "insert", owner: "editor" },

  // Write
  { id: "bold", keys: "Mod-b", group: "write", owner: "editor" },
  { id: "italic", keys: "Mod-i", group: "write", owner: "editor" },
  { id: "underline", keys: "Mod-u", group: "write", owner: "editor" },
  { id: "strike", keys: "Mod-Shift-s", group: "write", owner: "editor" },
  { id: "code", keys: "Mod-e", group: "write", owner: "editor" },
  { id: "lineBreak", keys: "Shift-Enter", group: "write", owner: "editor" },
  { id: "undo", keys: "Mod-z", group: "write", owner: "editor" },
  { id: "redo", keys: "Mod-Shift-z", group: "write", owner: "editor" },

  // Text
  { id: "heading1", keys: "Mod-Alt-1", group: "text", owner: "editor" },
  { id: "heading2", keys: "Mod-Alt-2", group: "text", owner: "editor" },
  { id: "heading3", keys: "Mod-Alt-3", group: "text", owner: "editor" },
  { id: "bulletList", keys: "Mod-Shift-8", group: "text", owner: "editor" },
  { id: "orderedList", keys: "Mod-Shift-7", group: "text", owner: "editor" },
  { id: "quote", keys: "Mod-Shift-b", group: "text", owner: "editor" },
  { id: "alignLeft", keys: "Mod-Shift-l", group: "text", owner: "editor" },
  { id: "alignCenter", keys: "Mod-Shift-e", group: "text", owner: "editor" },
  { id: "alignRight", keys: "Mod-Shift-r", group: "text", owner: "editor" },

  // Blocks: a top-level block is a paragraph, a list, a column set, an image...
  { id: "moveBlockUp", keys: "Mod-Shift-ArrowUp", group: "blocks", owner: "posta" },
  { id: "moveBlockDown", keys: "Mod-Shift-ArrowDown", group: "blocks", owner: "posta" },
  { id: "duplicateBlock", keys: "Mod-Shift-d", group: "blocks", owner: "posta" },
  { id: "deleteBlock", keys: "Mod-Shift-Backspace", group: "blocks", owner: "posta" },
  { id: "insertParagraphAfter", keys: "Mod-Shift-Enter", group: "blocks", owner: "posta" },

  // Page
  { id: "save", keys: "Mod-s", group: "page", owner: "page" },
  { id: "saveAndClose", keys: "Mod-Enter", group: "page", owner: "page" },
  { id: "showShortcuts", typed: "?", group: "page", owner: "page" },
];

export function isChord(entry: ShortcutEntry): entry is ChordEntry {
  return "keys" in entry;
}

/** The entries of one group, in the list's order. */
export function shortcutsIn(group: ShortcutGroup): ShortcutEntry[] {
  return SHORTCUTS.filter((entry) => entry.group === group);
}

/** The key of an entry's label in the `block-editor` catalog. */
export function shortcutLabelKey(id: string): string {
  return `shortcuts.actions.${id}`;
}

/** The key of a group's heading in the `block-editor` catalog. */
export function shortcutGroupKey(group: ShortcutGroup): string {
  return `shortcuts.groups.${group}`;
}

// ---- Platforms and key names --------------------------------------------

/** Keycaps differ by platform: ⌘⇧D on Apple systems, Ctrl+Shift+D elsewhere. */
export type KeyPlatform = "mac" | "other";

/** The platform a `navigator.platform` (MacIntel) or user agent data (macOS) string names. */
export function keyPlatform(platform: string | null | undefined): KeyPlatform {
  return /mac|ip(hone|ad|od)/i.test(platform ?? "") ? "mac" : "other";
}

/**
 * This browser's platform. Read when a key is pressed or a dialog opens, never
 * during the first render, so it cannot make hydration disagree with the server.
 */
export function currentKeyPlatform(): KeyPlatform {
  if (typeof navigator === "undefined") return "other";
  const data = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  return keyPlatform(data?.platform || navigator.platform);
}

type Modifier = "Mod" | "Ctrl" | "Alt" | "Shift";
const MODIFIERS: readonly Modifier[] = ["Mod", "Ctrl", "Alt", "Shift"];

export interface Chord {
  mod: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** `ArrowUp`, `Enter`, a digit, or a lower-case letter. */
  key: string;
}

/** Reads `Mod-Shift-ArrowUp`; null when it names a modifier twice, an unknown one, or no key. */
export function parseChord(keys: string): Chord | null {
  const parts = keys.split("-");
  const key = parts.pop();
  if (!key) return null;
  const chord: Chord = { mod: false, ctrl: false, alt: false, shift: false, key: normalKey(key) };
  const seen = new Set<string>();
  for (const part of parts) {
    if (!MODIFIERS.includes(part as Modifier) || seen.has(part)) return null;
    seen.add(part);
    if (part === "Mod") chord.mod = true;
    else if (part === "Ctrl") chord.ctrl = true;
    else if (part === "Alt") chord.alt = true;
    else chord.shift = true;
  }
  return chord;
}

function normalKey(key: string): string {
  return /^[A-Za-z]$/.test(key) ? key.toLowerCase() : key;
}

const KEY_CAPS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Enter: "↵",
  Backspace: "⌫",
  Escape: "Esc",
};

/**
 * The keycaps of a chord, one string each. A Mac gets Apple's glyphs in
 * Apple's order (⌃⌥⇧⌘, then the key): `Mod-Shift-d` is ⇧⌘D. Elsewhere it is
 * words in the order Windows menus use: Ctrl, Alt, Shift, then the key.
 * Empty for a chord that does not parse.
 */
export function formatKeys(keys: string, platform: KeyPlatform): string[] {
  const chord = parseChord(keys);
  if (!chord) return [];
  const caps: string[] = [];
  if (platform === "mac") {
    if (chord.ctrl) caps.push("⌃");
    if (chord.alt) caps.push("⌥");
    if (chord.shift) caps.push("⇧");
    if (chord.mod) caps.push("⌘");
  } else {
    if (chord.mod || chord.ctrl) caps.push("Ctrl");
    if (chord.alt) caps.push("Alt");
    if (chord.shift) caps.push("Shift");
  }
  caps.push(KEY_CAPS[chord.key] ?? chord.key.toUpperCase());
  return caps;
}

/** The same keycaps as one string: `⇧⌘D`, or `Ctrl+Shift+D`. */
export function formatKeysText(keys: string, platform: KeyPlatform): string {
  return formatKeys(keys, platform).join(platform === "mac" ? "" : "+");
}

/** The keycap word the cheatsheet translates; every other typed cap is shown as it is. */
export const SPACE_CAP = "Space";

/** The keycaps for typing `# `: the characters, then a Space cap if one ends them. */
export function typedCaps(typed: string): string[] {
  return typed.endsWith(" ") ? [typed.trimEnd(), SPACE_CAP] : [typed];
}

// ---- Matching a keydown --------------------------------------------------

/** The parts of a keydown a chord is matched on. */
export interface ChordEvent extends ShortcutKey {
  /** Where the key is, for layouts whose letters are not Latin. */
  code?: string;
}

function letterOf(event: ChordEvent): string {
  if (/^[A-Za-z]$/.test(event.key)) return event.key.toLowerCase();
  // On a Cyrillic or Greek layout the key says "в", but the code still says KeyD.
  const physical = /^Key([A-Z])$/.exec(event.code ?? "");
  return physical?.[1]?.toLowerCase() ?? event.key;
}

/**
 * True when the keydown is exactly this chord: the same modifiers and no
 * others, with Mod meaning ⌘ alone on a Mac and Ctrl alone elsewhere. Exact,
 * so ⌘⇧D is not ⌘D and Ctrl+⌘ on a Mac is neither.
 */
export function chordMatches(event: ChordEvent, chord: Chord, platform: KeyPlatform): boolean {
  // Mod is the platform's own key (⌘, or Ctrl); the Windows key is never part of a chord.
  const wantMeta = platform === "mac" && chord.mod;
  const wantCtrl = platform === "mac" ? chord.ctrl : chord.mod || chord.ctrl;
  if (wantMeta !== !!event.metaKey || wantCtrl !== !!event.ctrlKey) return false;
  if (chord.shift !== !!event.shiftKey) return false;
  if (chord.alt !== !!event.altKey) return false;
  return letterOf(event) === chord.key || event.key === chord.key;
}

/** An input method editor is composing text, so keys belong to it, not to shortcuts. */
export function keyIsComposing(event: { isComposing?: boolean; keyCode?: number }): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

const BLOCK_CHORDS: ReadonlyArray<{ id: BlockActionId; chord: Chord }> = SHORTCUTS.flatMap(
  (entry) => {
    if (entry.owner !== "posta" || !isChord(entry)) return [];
    const chord = parseChord(entry.keys);
    return chord ? [{ id: entry.id as BlockActionId, chord }] : [];
  },
);

/** The block shortcut this keydown is, or null. Never while an IME is composing. */
export function blockShortcutFor(
  event: ChordEvent & { isComposing?: boolean; keyCode?: number },
  platform: KeyPlatform,
): BlockActionId | null {
  if (keyIsComposing(event)) return null;
  for (const { id, chord } of BLOCK_CHORDS) {
    if (chordMatches(event, chord, platform)) return id;
  }
  return null;
}

// ---- The cheatsheet's own key ---------------------------------------------

/** Where a keydown landed, as far as "is the person typing here" goes. */
export interface KeyTarget {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
  readonly role?: string | null;
}

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const TYPING_ROLES = new Set(["textbox", "combobox", "searchbox", "spinbutton"]);

/** A field, a select, or anything editable (the email, the code editor): `?` there is just a question mark. */
export function isTypingTarget(target: KeyTarget | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  if (TYPING_TAGS.has((target.tagName ?? "").toUpperCase())) return true;
  return TYPING_ROLES.has(target.role ?? "");
}

/**
 * Whether a keydown opens the cheatsheet: a bare `?` (Shift comes with it on
 * most layouts) that no one else has taken, outside anything the person types
 * into, with no dialog already open and no IME composing.
 */
export function opensCheatsheet(
  event: ChordEvent & { defaultPrevented?: boolean; isComposing?: boolean; keyCode?: number },
  context: { target: KeyTarget | null | undefined; dialogOpen: boolean },
): boolean {
  if (event.key !== "?") return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (event.defaultPrevented || keyIsComposing(event)) return false;
  if (context.dialogOpen) return false;
  return !isTypingTarget(context.target);
}
