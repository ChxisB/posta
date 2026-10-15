"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isReadOnly } from "@/lib/read-only";
import { stableStringify } from "@/lib/stable-json";

export interface RecoveredDraft<T> {
  savedAt: number;
  data: T;
}

/**
 * Crash/close protection for the editor pages: mirrors the current form state
 * into localStorage (never synced anywhere), debounced, one key per entity
 * (`po-draft:broadcast:<id|new>` etc.). A draft identical to the persisted
 * baseline is deleted rather than stored, so the key only exists while there
 * is genuinely unsaved work. Comparisons ignore key order: a document read back
 * from a jsonb column is the saved one, whatever order its keys come in. A page
 * whose state carries derived fields compares through `compareAs`, and one
 * whose editor normalises the persisted state on mount `rebase`s onto that.
 *
 * On mount, an existing differing draft surfaces as `recovered` for the page
 * to offer Restore/Discard, never applied silently. While that offer is
 * pending, the writer stays hands-off so a reload doesn't destroy the draft
 * before the user chose.
 */
export function useLocalDraft<T>({
  storageKey,
  state,
  initialState,
  compareAs,
}: {
  storageKey: string;
  /** The current serializable form state; a new identity schedules a write. */
  state: T;
  /** The persisted state the page mounted with: the "nothing unsaved" shape. */
  initialState: T;
  /** What of a state counts when comparing with the baseline (all of it by default). */
  compareAs?: (state: T) => unknown;
}) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const compareRef = useRef(compareAs);
  compareRef.current = compareAs;
  const fingerprint = useCallback(
    (value: T) => stableStringify(compareRef.current ? compareRef.current(value) : value),
    [],
  );
  const baselineRef = useRef<string>(fingerprint(initialState));

  const [recovered, setRecovered] = useState<RecoveredDraft<T> | null>(null);
  const recoveredPendingRef = useRef(false);

  // One-time read: only a draft that differs from the baseline is worth offering.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as RecoveredDraft<T>;
      if (fingerprint(parsed.data) !== baselineRef.current) {
        recoveredPendingRef.current = true;
        setRecovered(parsed);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Unreadable storage or corrupt draft: behave as if none existed.
    }
  }, [storageKey, fingerprint]);

  // Mirror the latest state: drop the key when it matches the baseline.
  const write = useCallback(() => {
    // Saves are refused under a support view, so a mirrored draft would never
    // be cleared and the customer's content would stay in the operator's browser.
    if (isReadOnly()) return;
    try {
      if (fingerprint(stateRef.current) === baselineRef.current) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ savedAt: Date.now(), data: stateRef.current }),
        );
      }
    } catch {
      // Storage full/unavailable: drafts are best-effort.
    }
  }, [storageKey, fingerprint]);

  // Debounced write on every state change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect is keyed on the state identity; the body reads through a ref so the timeout always sees the latest
  useEffect(() => {
    const id = setTimeout(() => {
      if (recoveredPendingRef.current) return; // don't clobber an unanswered offer
      write();
    }, 800);
    return () => clearTimeout(id);
  }, [state, write]);

  /**
   * After a successful persist: what was saved becomes the baseline (the
   * current state when not given). Edits made while the save was in flight
   * differ from it, so they stay mirrored rather than being dropped.
   */
  const markSaved = useCallback(
    (saved?: T) => {
      baselineRef.current = fingerprint(saved ?? stateRef.current);
      recoveredPendingRef.current = false;
      setRecovered(null);
      write();
    },
    [write, fingerprint],
  );

  /**
   * The editor's own reading of the persisted state becomes the baseline (a
   * rich-text editor fills in default attributes on mount, which is not an
   * edit). Unlike `markSaved`, a pending recovered draft stays on offer, unless
   * it turns out to be no more than that reading.
   */
  const rebase = useCallback(
    (persisted: T) => {
      baselineRef.current = fingerprint(persisted);
      // Otherwise the debounced write that follows the state change compares with it.
      if (!recoveredPendingRef.current) return;
      try {
        const raw = localStorage.getItem(storageKey);
        const parsed = raw ? (JSON.parse(raw) as RecoveredDraft<T>) : null;
        if (parsed && fingerprint(parsed.data) !== baselineRef.current) return;
        localStorage.removeItem(storageKey);
      } catch {
        return;
      }
      recoveredPendingRef.current = false;
      setRecovered(null);
    },
    [storageKey, fingerprint],
  );

  /** The user declined the recovered draft: forget it. */
  const discardRecovered = useCallback(() => {
    recoveredPendingRef.current = false;
    setRecovered(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* best-effort */
    }
  }, [storageKey]);

  /** The user restored the draft: the page applied it; resume mirroring. */
  const acceptRecovered = useCallback(() => {
    recoveredPendingRef.current = false;
    setRecovered(null);
  }, []);

  return { recovered, markSaved, rebase, discardRecovered, acceptRecovered };
}
