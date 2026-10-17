"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "../modal";
import { ModalFooter } from "../modal-footer";
import {
  currentKeyPlatform,
  formatKeys,
  isChord,
  type KeyPlatform,
  opensCheatsheet,
  SHORTCUT_GROUPS,
  type ShortcutEntry,
  type ShortcutGroup,
  SPACE_CAP,
  shortcutGroupKey,
  shortcutLabelKey,
  shortcutsIn,
  typedCaps,
} from "./shortcuts";

/** The groups that carry a line of explanation under their heading. */
const NOTED_GROUPS: ReadonlySet<ShortcutGroup> = new Set(["insert", "blocks"]);

/** Every shortcut, a group at a time, drawn from the one list in `shortcuts.ts`. */
export function ShortcutsList({ platform }: { platform: KeyPlatform }) {
  const t = useTranslations("block-editor");

  const capsOf = (entry: ShortcutEntry): string[] =>
    isChord(entry)
      ? formatKeys(entry.keys, platform)
      : typedCaps(entry.typed).map((cap) => (cap === SPACE_CAP ? t("shortcuts.space") : cap));

  return (
    <div className="po-shortcuts">
      {SHORTCUT_GROUPS.map((group) => {
        const headingId = `po-shortcuts-${group}`;
        return (
          <section key={group} className="po-shortcuts-group" aria-labelledby={headingId}>
            <h3 id={headingId}>{t(shortcutGroupKey(group))}</h3>
            {NOTED_GROUPS.has(group) ? (
              <p className="po-shortcuts-note">{t(`shortcuts.notes.${group}`)}</p>
            ) : null}
            <dl>
              {shortcutsIn(group).map((entry) => (
                <div key={entry.id} className="po-shortcuts-row">
                  <dt>{t(shortcutLabelKey(entry.id))}</dt>
                  <dd>
                    {capsOf(entry).map((cap) => (
                      <kbd key={cap} className="po-keycap po-shortcuts-cap">
                        {cap}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

/** The platform is read when the dialog opens, so it never takes part in hydration. */
function ShortcutsBody() {
  return <ShortcutsList platform={currentKeyPlatform()} />;
}

/** The settings rail's last line: opens the cheatsheet, and says which key does too. */
export function ShortcutsButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("block-editor");
  return (
    <button type="button" className="po-tpl-shortcuts-btn" aria-keyshortcuts="?" onClick={onClick}>
      {t("shortcuts.open")}
      <span className="po-keycap" aria-hidden="true">
        ?
      </span>
    </button>
  );
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("block-editor");
  const tc = useTranslations("common");
  return (
    <Modal open={open} onClose={onClose} title={t("shortcuts.title")} size="wide">
      <ShortcutsBody />
      <ModalFooter>
        <button type="button" className="po-btn po-btn-secondary" onClick={onClose}>
          {tc("close")}
        </button>
      </ModalFooter>
    </Modal>
  );
}

/**
 * Opens the cheatsheet from a bare `?`, and from `show` (the rail's button).
 * `enabled` is off outside the block editor, where most of the list does not
 * apply. Closing hands focus back to what had it, when that is still there.
 */
export function useShortcutsCheatsheet(enabled: boolean) {
  const [open, setOpen] = useState(false);
  const returnTo = useRef<HTMLElement | null>(null);

  /** `from` is where focus returns to; by default what has it now. */
  const show = useCallback((from?: HTMLElement | null) => {
    const origin = from === undefined ? document.activeElement : from;
    returnTo.current = origin instanceof HTMLElement && origin !== document.body ? origin : null;
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    const back = returnTo.current;
    returnTo.current = null;
    if (back?.isConnected) back.focus();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const dialogOpen = document.querySelector('[aria-modal="true"]') !== null;
      const target = event.target instanceof Element ? event.target : null;
      if (!opensCheatsheet(event, { target, dialogOpen })) return;
      event.preventDefault();
      show();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, show]);

  return { open, show, close };
}
