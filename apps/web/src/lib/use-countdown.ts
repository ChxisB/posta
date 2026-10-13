"use client";

import { useEffect, useState } from "react";

/**
 * Milliseconds left until `until`, ticking once a second and floored at zero;
 * the interval is cleared when the target changes and when the caller
 * unmounts. A new target is measured during the render that brings it, so a
 * countdown never paints a frame of zero before its first tick — callers read
 * zero as "the window closed". Zero while `until` is null, which is also what
 * a server render sees, so hydration agrees.
 */
export function useCountdown(until: Date | null): number {
  const target = until?.getTime() ?? 0;
  const [state, setState] = useState({ target: 0, left: 0 });
  if (state.target !== target) {
    setState({ target, left: target === 0 ? 0 : Math.max(0, target - Date.now()) });
  }
  useEffect(() => {
    if (target === 0) return;
    const id = setInterval(
      () => setState({ target, left: Math.max(0, target - Date.now()) }),
      1000,
    );
    return () => clearInterval(id);
  }, [target]);
  return state.target === target ? state.left : 0;
}
