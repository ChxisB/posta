'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mail, X } from 'lucide-react';
import {
  FOOTER_ITEMS,
  isItemActive,
  navContextFromPath,
  navSections,
  type NavItem,
} from '@/components/shell/nav';
import { IconButton } from '@/components/ui/button';
import { useDismissableLayer } from '@/hooks/use-dismissable-layer';
import { cn } from '@/lib/utils';

/**
 * A fixed rail from `lg` up, and a slide-over below it. One component for
 * both so the nav model is rendered once, rather than the previous file's
 * two full copies of the link list that had to be edited in lockstep.
 */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const sections = navSections(navContextFromPath(pathname));
  const { ref, onKeyDown } = useDismissableLayer<HTMLDivElement>(open, onClose);

  return (
    <>
      {/* Backdrop, mobile only. */}
      {open && (
        <div
          className="animate-fade-in fixed inset-0 z-40 bg-foreground/25 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <div
        ref={ref}
        onKeyDown={open ? onKeyDown : undefined}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col border-r border-line bg-panel outline-none',
          'lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0',
          open ? 'animate-slide-in-left' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3.5">
          <Brand />
          <IconButton
            label="Close navigation"
            size="sm"
            onClick={onClose}
            className="ml-auto lg:hidden"
          >
            <X size={16} />
          </IconButton>
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.label} className="mb-5 last:mb-0">
              <h2 className="px-3 pb-1.5 text-2xs font-semibold tracking-wider text-faint uppercase">
                {section.label}
              </h2>
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} pathname={pathname} onNavigate={onClose} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <ul className="flex flex-col gap-0.5 border-t border-line-soft px-3 py-3">
          {FOOTER_ITEMS.map((item) => (
            <li key={item.href}>
              <NavLink item={item} pathname={pathname} onNavigate={onClose} />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = isItemActive(item, pathname);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-accent/10 font-medium text-accent'
          : 'text-muted hover:bg-panel-2 hover:text-foreground',
      )}
    >
      <Icon size={16} strokeWidth={active ? 2.25 : 2} aria-hidden />
      {item.label}
    </Link>
  );
}

export function Brand({ href = '/organizations' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink">
        <Mail size={17} strokeWidth={2.25} aria-hidden />
      </span>
      <span className="text-lg font-bold tracking-tight text-foreground">Posta</span>
    </Link>
  );
}
