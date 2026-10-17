"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import {
  browserRailStorage,
  RAILS_INITIAL,
  type RailMode,
  type RailSide,
  type RailsState,
  type RailTier,
  railDrawer,
  railMode,
  railShown,
  railsReduce,
  railTier,
  readRailPrefs,
  writeRailPrefs,
} from "@/lib/template-rails";

/**
 * The tier the layout is in, from the width of the element the returned `ref`
 * is set on. Until it has been measured the tier is "narrow" (nothing docked,
 * so a server render never has rails the window cannot hold).
 */
export function useRailTier(): { ref: (element: HTMLElement | null) => void; tier: RailTier } {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { ref: setElement, tier: railTier(width) };
}

export interface TemplateRails {
  /** Set on the layout's root: its width decides the tier. */
  ref: (element: HTMLElement | null) => void;
  tier: RailTier;
  /** False until the folded flags have been read, so the first paint does not animate them in. */
  ready: boolean;
  state: RailsState;
  modeOf: (side: RailSide) => RailMode;
  /** Visible and reachable: docked and not folded, or its drawer open. */
  shown: (side: RailSide) => boolean;
  /** The drawer showing now, if any. */
  drawer: RailSide | null;
  /** A docked rail folds away or comes back; remembered. */
  toggleCollapsed: (side: RailSide) => void;
  openDrawer: (side: RailSide) => void;
  /** `focus: false` leaves focus where it is (the person is about to use the email). */
  close: (options?: { focus?: boolean }) => void;
  /** Make a rail visible whichever way it shows. */
  show: (side: RailSide) => void;
  /** Whether the closing drawer should hand focus back to what opened it. */
  restoreFocus: { current: boolean };
}

/**
 * The editor's rails: the tier the width allows, what the person folded away
 * (remembered in `localStorage`, read after mount), and the drawer showing.
 */
export function useTemplateRails(): TemplateRails {
  const { ref, tier } = useRailTier();
  const [state, dispatch] = useReducer(railsReduce, RAILS_INITIAL);
  const [ready, setReady] = useState(false);
  const touched = useRef(false);
  const restoreFocus = useRef(true);

  // Before the first paint, so a rail the person folded never flashes open.
  useLayoutEffect(() => {
    dispatch({ type: "load", collapsed: readRailPrefs(browserRailStorage()) });
    setReady(true);
  }, []);

  // Only a fold the person made is written, never what was read back.
  useEffect(() => {
    if (touched.current) writeRailPrefs(browserRailStorage(), state.collapsed);
  }, [state.collapsed]);

  useEffect(() => {
    dispatch({ type: "tier", tier });
  }, [tier]);

  const toggleCollapsed = useCallback((side: RailSide) => {
    touched.current = true;
    dispatch({ type: "toggle-collapsed", side });
  }, []);
  const openDrawer = useCallback((side: RailSide) => dispatch({ type: "open", side }), []);
  const close = useCallback((options?: { focus?: boolean }) => {
    restoreFocus.current = options?.focus !== false;
    dispatch({ type: "close" });
  }, []);
  const show = useCallback((side: RailSide) => dispatch({ type: "show", side, tier }), [tier]);

  return {
    ref,
    tier,
    ready,
    state,
    modeOf: (side) => railMode(tier, side),
    shown: (side) => railShown(state, tier, side),
    drawer: railDrawer(state, tier),
    toggleCollapsed,
    openDrawer,
    close,
    show,
    restoreFocus,
  };
}
