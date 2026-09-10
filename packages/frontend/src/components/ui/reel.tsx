'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';

/**
 * A looping, step-based micro-demo built from real DOM.
 *
 * Deliberately not a video, canvas or animation library: each frame is
 * ordinary markup, so a reel can be composed from the app's own primitives
 * (MessageStatusPill, KindTag, Card…) and cannot drift away from how the
 * product actually looks. It also costs nothing to ship — no asset, no
 * dependency — and stays crisp at any density.
 *
 * Three things every reel gets for free:
 *  - It pauses while off-screen. A page carrying several of these should not
 *    be running several timers against a tab nobody is looking at.
 *  - It respects prefers-reduced-motion by holding the final frame, so the
 *    information is still conveyed without the movement.
 *  - It is exposed as a single `role="img"` with a narrated label rather than
 *    a pile of animating nodes, so assistive tech gets one clear description
 *    instead of noise.
 */

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

/** True once the element is at least partly on screen. */
function useInView(ref: React.RefObject<HTMLElement | null>): boolean {
  // Where IntersectionObserver doesn't exist (SSR, older test environments)
  // assume visible, so a reel degrades to simply playing rather than never
  // starting. Decided in the initialiser rather than an effect: nothing
  // rendered depends on it, so the server/client difference is not a
  // hydration mismatch.
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((e) => e.isIntersecting)),
      { rootMargin: '80px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return inView;
}

/**
 * Advances through `timings` (one duration in ms per step) and wraps around.
 * Holds on step 0 while inactive, so a paused reel shows its opening frame.
 */
function useReelStep(timings: number[], active: boolean): number {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active || timings.length <= 1) return;
    const id = setTimeout(() => setStep((s) => (s + 1) % timings.length), timings[step] ?? 1200);
    return () => clearTimeout(id);
  }, [active, step, timings]);

  return step;
}

export function Reel({
  label,
  timings,
  render,
  className = '',
}: {
  /** Narrates the whole sequence for assistive tech. Required. */
  label: string;
  /** How long each step is held, in ms. Length defines the step count. */
  timings: number[];
  render: (step: number) => React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reducedMotion = usePrefersReducedMotion();

  const active = inView && !reducedMotion;
  const step = useReelStep(timings, active);
  // With motion suppressed, hold the last frame: it carries the outcome.
  const shown = reducedMotion ? timings.length - 1 : step;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className={cn('relative overflow-hidden select-none', className)}
    >
      {render(shown)}
    </div>
  );
}

/** The framed surface a reel plays inside. */
export function ReelStage({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-2xl border border-line bg-panel p-4 shadow-elev-md', className)}>
      {children}
    </div>
  );
}

/**
 * One animated line in a reel. `show` drives it: rows appear and settle, and
 * can be nudged by `offsetY` to simulate reordering.
 */
export function ReelRow({
  show,
  offsetY = 0,
  delayMs = 0,
  className = '',
  children,
}: {
  show: boolean;
  offsetY?: number;
  delayMs?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn('transition-all duration-500 ease-[cubic-bezier(.2,.8,.2,1)]', className)}
      style={{
        opacity: show ? 1 : 0,
        transform: `translateY(${show ? offsetY : 8}px)`,
        transitionDelay: `${delayMs}ms`,
      }}
    >
      {children}
    </div>
  );
}
