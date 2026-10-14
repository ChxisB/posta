"use client";

import { useLocale, useTranslations } from "next-intl";
import { isReadOnly } from "@/lib/read-only";
import { formatSavedAt, type SaveState } from "@/lib/save-state";
import { SAVED_FADE_MS } from "@/lib/saved-flash";

/**
 * The header's save state, always shown: one polite live region whose text
 * changes as the state does, and a "Try again" beside it after a failed save.
 */
export function SaveStatus({
  state,
  fresh,
  onRetry,
}: {
  state: SaveState;
  /** Just saved: the "Saved" line shows in the success colour for a moment. */
  fresh: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations("templates");
  const locale = useLocale();
  const label =
    state.kind === "saved"
      ? `✓ ${t("editor.stateSaved", { time: formatSavedAt(state.at, locale) })}`
      : state.kind === "error"
        ? // A support view never mirrors a draft, so there is nothing kept to promise.
          isReadOnly()
          ? t("editor.saveError")
          : t("editor.stateError")
        : t(STATE_KEYS[state.kind]);
  const color =
    state.kind === "error"
      ? "var(--po-danger)"
      : state.kind === "saved" && fresh
        ? "var(--po-success)"
        : "var(--po-muted)";
  return (
    <>
      <span
        role="status"
        aria-live="polite"
        style={{
          color,
          fontSize: "var(--po-fs-label)",
          transition: `color ${SAVED_FADE_MS}ms var(--po-ease)`,
        }}
      >
        {label}
      </span>
      {state.kind === "error" ? (
        <button type="button" className="po-btn po-btn-ghost po-btn-sm" onClick={onRetry}>
          {t("editor.retry")}
        </button>
      ) : null}
    </>
  );
}

const STATE_KEYS = {
  new: "editor.stateNew",
  dirty: "editor.stateDirty",
  preparing: "editor.statePreparing",
  saving: "editor.stateSaving",
} as const;
