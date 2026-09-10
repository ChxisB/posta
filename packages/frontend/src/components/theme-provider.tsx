'use client';

import { createContext, useContext, useSyncExternalStore } from 'react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'posta-theme';
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

// Matches THEME_INIT_SCRIPT's light default so hydration never has to
// reconcile a mismatch: useSyncExternalStore renders this until mount, then
// swaps to the real client value. Keep the two in lockstep, if the init
// script's fallback changes this must change with it.
function getServerSnapshot(): Theme {
  return 'light';
}

function setThemeAttribute(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
  listeners.forEach((cb) => cb());
}

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
} | null>(null);

/**
 * Sets data-theme on <html> before hydration so there is no flash of the
 * wrong palette. Must run synchronously, so this string is injected as a
 * blocking inline script rather than executed from a mounted component.
 *
 * This replaces the previous provider, which hid the entire application
 * behind `visibility: hidden` until it had mounted. That did prevent the
 * flash, but it also threw away every server-rendered page: the first paint
 * was a blank screen on every navigation, and the markup Next had already
 * streamed was invisible until React caught up.
 *
 * Light is Posta's identity and dark is a secondary preference, so the OS
 * setting is deliberately NOT consulted: only an explicit choice made
 * through the theme toggle switches away from light, and that choice then
 * persists. Honouring prefers-color-scheme here would mean most visitors
 * never saw the light design at all.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("${STORAGE_KEY}");
    document.documentElement.setAttribute("data-theme", stored === "dark" ? "dark" : "light");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    setThemeAttribute(theme === 'dark' ? 'light' : 'dark');
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeAttribute, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
