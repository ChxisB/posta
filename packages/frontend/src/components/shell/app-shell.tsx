'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { ToastProvider } from '@/components/providers/toast-provider';
import { SkipLink } from '@/components/ui/skip-link';

/**
 * Chooses the chrome for a route:
 *  - "/" (the public marketing site) renders bare, no dashboard shell.
 *  - The auth pages render centered, also without the shell.
 *  - Every other route gets the full sidebar + topbar frame.
 *
 * Route-driven rather than layout-file-driven so the marketing site and the
 * app can share one root layout, and so a page cannot accidentally ship
 * without the shell by forgetting to opt in.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/') return <>{children}</>;
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up')
  ) {
    return <div className="flex min-h-screen items-center justify-center p-4">{children}</div>;
  }

  return <AppFrame>{children}</AppFrame>;
}

function AppFrame({ children }: { children: React.ReactNode }) {
  // The sidebar is a fixed rail from `lg` up and a slide-over below it, so
  // the open/closed state lives here where both the rail and the topbar's
  // menu button can reach it.
  const [navOpen, setNavOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="min-h-screen lg:grid lg:grid-cols-[268px_1fr]">
        <SkipLink href="#main">Skip to content</SkipLink>
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <main id="main" className="min-w-0 px-4 pt-4 pb-16 sm:px-6 lg:px-8 lg:pt-6">
          <Topbar onOpenNav={() => setNavOpen(true)} />
          {/* One vertical rhythm for every page. Spacing between top-level
              sections lives here rather than as a margin on each one, so a
              page cannot ship a branch that forgets it — which is exactly
              what the empty-state branch of /organizations did, leaving its
              cards flush against the section below. */}
          <div className="mx-auto flex max-w-7xl flex-col gap-6">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
