'use client';

import { UserButton } from '@clerk/nextjs';
import { Menu } from 'lucide-react';
import { IconButton } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * The row above the page content: the mobile nav trigger on the left, and
 * the account controls on the right.
 *
 * The account controls used to live inside the sidebar header, which meant
 * that on a phone signing out required opening the navigation drawer first.
 */
export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2 lg:mb-2 lg:justify-end">
      <IconButton
        label="Open navigation"
        onClick={onOpenNav}
        variant="secondary"
        className="lg:hidden"
      >
        <Menu size={16} />
      </IconButton>
      <div className="ml-auto flex items-center gap-2 lg:ml-0">
        <ThemeToggle />
        <UserButton />
      </div>
    </div>
  );
}
