"use client";

import { useTranslations } from "next-intl";
import {
  type DragEvent as ReactDragEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { PopoverMenu, type PopoverMenuItem } from "@/components/popover-menu";
import {
  type AuthoringNode,
  blockRangeAt,
  runBlockActionAt,
  runBlockMoveTo,
} from "./block-actions";
import {
  activeBlockIndex,
  announcementFor,
  BLOCK_DRAG_TYPE,
  blockAtY,
  blockMenuEntries,
  gapPositions,
  isMoveTo,
  nearestGap,
  type VerticalSpan,
} from "./block-handle";
import type { TiptapEditor } from "./commands";
import { GripIcon } from "./icons";
import {
  type BlockActionId,
  currentKeyPlatform,
  formatKeysText,
  isChord,
  SHORTCUTS,
} from "./shortcuts";

/** What the handle reads of ProseMirror's view. */
interface EditorViewLike {
  nodeDOM(pos: number): Node | null;
  dom: HTMLElement;
}

const CHORDS = new Map(
  SHORTCUTS.flatMap((entry) => (isChord(entry) ? [[entry.id, entry.keys] as const] : [])),
);

function docOf(editor: TiptapEditor): AuthoringNode {
  return (editor.state as unknown as { doc: AuthoringNode }).doc;
}

/** Each top-level block's place on screen, in document order. */
function blockSpans(editor: TiptapEditor): VerticalSpan[] {
  if (editor.isDestroyed) return [];
  const doc = docOf(editor);
  const view = editor.view as unknown as EditorViewLike;
  const spans: VerticalSpan[] = [];
  let from = 0;
  let previous = 0;
  for (let index = 0; index < doc.childCount; index += 1) {
    const dom = view.nodeDOM(from);
    if (dom instanceof HTMLElement) {
      const rect = dom.getBoundingClientRect();
      spans.push({ top: rect.top, bottom: rect.bottom });
      previous = rect.bottom;
    } else {
      // A block with no element of its own is taken as a line where the one before ends.
      spans.push({ top: previous, bottom: previous });
    }
    from += doc.child(index).nodeSize;
  }
  return spans;
}

function blockElement(editor: TiptapEditor, index: number): HTMLElement | null {
  const doc = docOf(editor);
  let from = 0;
  for (let i = 0; i < index; i += 1) from += doc.child(i).nodeSize;
  const dom = (editor.view as unknown as EditorViewLike).nodeDOM(from);
  return dom instanceof HTMLElement ? dom : null;
}

function isBlockDrag(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes(BLOCK_DRAG_TYPE) === true;
}

/**
 * The handle in the margin of the editor: a grip beside the block the pointer
 * is over (or that holds the cursor), which opens a menu of the block actions
 * and drags the block to another place between blocks. It replaces Maily's own
 * handle, which lets a block be dropped inside a quote, a list or a column and
 * has an English-only menu with no accessible name.
 *
 * - The menu rows are the five block shortcuts, run by the same functions
 *   (block-actions.ts), so the menu, the shortcuts and the drag cannot differ.
 * - A drag only ever lands between top-level blocks, and is one transaction,
 *   so one undo puts it back. The browser scrolls the page near its edges.
 * - It is a tab stop after the editor and a labelled button, and says what
 *   happened in a live region. Touch has no handle (the rail and the
 *   shortcuts are the way): see the pointer: coarse rule in maily-theme.css.
 *
 * It fills the surface it is in (`.po-maily-surface`) without taking its
 * pointer events, and listens on that surface.
 */
export function BlockHandle({ editor }: { editor: TiptapEditor | null }) {
  const t = useTranslations("block-editor");
  const layerRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [focusWithin, setFocusWithin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);
  const [top, setTop] = useState<number | null>(null);
  const [dropTop, setDropTop] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState<{ n: number; text: string } | null>(null);
  // Read by the surface's listeners, which are not re-bound as these change.
  const drag = useRef<{ from: number; gap: number | null } | null>(null);
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;
  // The button is down on the handle: a drag is about to start (see below).
  const pressed = useRef(false);
  // The surface's listeners call the latest announce, which reads this render's catalog and count.
  const announceRef = useRef<(kind: ReturnType<typeof announcementFor>, position?: number) => void>(
    () => {},
  );

  const doc = editor && !editor.isDestroyed ? docOf(editor) : null;
  const count = doc?.childCount ?? 0;
  const selection =
    editor && doc ? (editor.state as unknown as { selection: { from: number } }).selection : null;
  const selected = doc && selection ? (blockRangeAt(doc, selection.from)?.index ?? null) : null;
  const engaged = editor?.isFocused === true || focusWithin || menuOpen || dragFrom !== null;
  const index = activeBlockIndex({ hover, selected, engaged }, count);

  // The editor tells us about each change, and when it gains or loses focus.
  useEffect(() => {
    if (!editor) return;
    const bump = () => setTick((n) => n + 1);
    editor.on("transaction", bump);
    editor.on("focus", bump);
    // Tab from the editor to the grip: the blur renders before the grip has focus, and
    // a handle hidden by it would be gone before focus arrived. Say where focus is going.
    const onBlur = ({ event }: { event: FocusEvent }) => {
      const to = event.relatedTarget;
      if (to instanceof Node && layerRef.current?.contains(to)) setFocusWithin(true);
      bump();
    };
    editor.on("blur", onBlur);
    // An image loading or a window resize moves the blocks without a transaction.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => bump());
    observer?.observe((editor.view as unknown as EditorViewLike).dom);
    return () => {
      editor.off("transaction", bump);
      editor.off("focus", bump);
      editor.off("blur", onBlur);
      observer?.disconnect();
    };
  }, [editor]);

  // The pointer and the drag are listened for on the surface the handle is in.
  useEffect(() => {
    const surface = layerRef.current?.parentElement;
    if (!editor || !surface) return;

    // A drag's start looks like the pointer leaving the page (pointerleave, then dragstart),
    // and a handle that followed it to another block or vanished would be pulled out from
    // under the drag, which the browser ends at once. So hover holds from the press.
    const frozen = () => drag.current !== null || menuOpenRef.current || pressed.current;
    const release = () => {
      pressed.current = false;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (frozen()) return;
      // Over the handle itself, it stays beside the block it is beside.
      if (event.target instanceof Element && event.target.closest(".po-bhandle")) return;
      setHover(blockAtY(blockSpans(editor), event.clientY));
    };
    const onPointerLeave = () => {
      if (!frozen()) setHover(null);
    };
    const onDragOver = (event: DragEvent) => {
      const current = drag.current;
      if (!current || !isBlockDrag(event)) return;
      // Ours: ProseMirror never sees it, so it cannot drop the block into a node.
      event.preventDefault();
      event.stopPropagation();
      const gap = nearestGap(gapPositions(blockSpans(editor)), event.clientY);
      const lands = gap !== null && isMoveTo(current.from, gap);
      current.gap = lands ? gap : null;
      if (event.dataTransfer) event.dataTransfer.dropEffect = lands ? "move" : "none";
      setDropGap(current.gap);
    };
    const onDragLeave = (event: DragEvent) => {
      if (!drag.current || !isBlockDrag(event)) return;
      if (event.relatedTarget instanceof Node && surface.contains(event.relatedTarget)) return;
      drag.current.gap = null;
      setDropGap(null);
    };
    const onDrop = (event: DragEvent) => {
      const current = drag.current;
      if (!current || !isBlockDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      drag.current = null;
      setDragFrom(null);
      setDropGap(null);
      const { from, gap } = current;
      if (gap !== null && runBlockMoveTo(editor, from, gap)) {
        announceRef.current("moved", (gap > from ? gap - 1 : gap) + 1);
      }
    };

    window.addEventListener("pointerup", release, true);
    window.addEventListener("dragend", release, true);
    surface.addEventListener("pointermove", onPointerMove);
    surface.addEventListener("pointerleave", onPointerLeave);
    surface.addEventListener("dragover", onDragOver, true);
    surface.addEventListener("dragleave", onDragLeave, true);
    surface.addEventListener("drop", onDrop, true);
    return () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("dragend", release, true);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerleave", onPointerLeave);
      surface.removeEventListener("dragover", onDragOver, true);
      surface.removeEventListener("dragleave", onDragLeave, true);
      surface.removeEventListener("drop", onDrop, true);
    };
  }, [editor]);

  // Where the handle and the drop line sit, from where the blocks are now.
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!editor || !layer) return;
    const layerTop = layer.getBoundingClientRect().top;
    const spans = blockSpans(editor);
    const span = index === null ? undefined : spans[index];
    const nextTop = span ? Math.round(span.top - layerTop) : null;
    setTop((current) => (current === nextTop ? current : nextTop));
    const gap = dropGap === null ? undefined : gapPositions(spans)[dropGap];
    const nextDrop = gap === undefined ? null : Math.round(gap - layerTop);
    setDropTop((current) => (current === nextDrop ? current : nextDrop));
  });

  if (!editor) return null;

  function announce(kind: ReturnType<typeof announcementFor>, position?: number) {
    const text = t(`handle.announce.${kind}`, { position: position ?? 0, total: count });
    setAnnouncement((current) => ({ n: (current?.n ?? 0) + 1, text }));
  }
  announceRef.current = announce;

  function act(id: BlockActionId, at: number) {
    if (!editor) return;
    if (runBlockActionAt(editor, id, at)) {
      const kind = announcementFor(id);
      announce(kind, id === "moveBlockUp" ? at : id === "moveBlockDown" ? at + 2 : undefined);
    }
    setHover(null);
  }

  const platform = currentKeyPlatform();
  const items: (PopoverMenuItem | null)[] =
    index === null
      ? []
      : blockMenuEntries(index, count).map((entry) => {
          if (!entry) return null;
          const keys = CHORDS.get(entry.id);
          return {
            label: t(`shortcuts.actions.${entry.id}`),
            disabled: entry.disabled,
            danger: entry.danger,
            ...(keys ? { trailing: formatKeysText(keys, platform) } : {}),
            onSelect: () => act(entry.id, index),
          };
        });

  function onDragStart(event: ReactDragEvent<HTMLDivElement>) {
    if (!editor || index === null) return;
    event.dataTransfer.setData(BLOCK_DRAG_TYPE, String(index));
    event.dataTransfer.effectAllowed = "move";
    const element = blockElement(editor, index);
    if (element) event.dataTransfer.setDragImage(element, 0, 0);
    drag.current = { from: index, gap: null };
    setDragFrom(index);
  }

  function onDragEnd() {
    drag.current = null;
    setDragFrom(null);
    setDropGap(null);
  }

  return (
    <div ref={layerRef} className="po-bhandle-layer">
      {index !== null && top !== null ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: the draggable wrapper only starts the drag; the button inside it is the control, with the menu for keyboards
        <div
          className="po-bhandle"
          style={{ top }}
          draggable
          onPointerDown={() => {
            pressed.current = true;
          }}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onFocus={() => setFocusWithin(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setFocusWithin(false);
            }
          }}
        >
          <PopoverMenu
            ariaLabel={t("handle.label")}
            triggerTitle={t("handle.title")}
            triggerClassName="po-bhandle-grip"
            triggerGlyph={<GripIcon size={14} />}
            align="left"
            items={items}
            onOpenChange={(open) => {
              setMenuOpen(open);
              if (!open) setHover(null);
            }}
          />
        </div>
      ) : null}
      {dropTop !== null ? <div className="po-bhandle-drop" style={{ top: dropTop }} /> : null}
      <div className="po-bhandle-live" role="status" aria-live="polite">
        {announcement ? <span key={announcement.n}>{announcement.text}</span> : null}
      </div>
    </div>
  );
}
