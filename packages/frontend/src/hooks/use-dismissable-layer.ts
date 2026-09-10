'use client';

import { useCallback, useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * The modal-layer behaviours that are easy to forget and awkward to test:
 * focus moves into the layer when it opens and returns to whatever opened it
 * when it closes, Tab is trapped inside, Escape dismisses, and background
 * scroll is locked meanwhile.
 *
 * Shared by Dialog (conditionally mounted) and the mobile nav (always
 * mounted, translated off-screen), hence the `active` flag rather than
 * assuming the layer only exists while open.
 */
export function useDismissableLayer<T extends HTMLElement>(active: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    restoreTo.current = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? ref.current)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreTo.current?.focus?.();
    };
  }, [active]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // Wrap at both ends so Tab can never escape into the page behind.
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    },
    [onClose],
  );

  return { ref, onKeyDown };
}
