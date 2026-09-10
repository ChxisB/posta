'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface Tab {
  href: string;
  label: string;
}

/**
 * Link-based tab strip for sibling routes. Links rather than buttons because
 * each tab is a real, addressable route, so tabs are shareable and survive a
 * refresh.
 */
export function TabNav({
  tabs,
  ariaLabel,
  className = '',
}: {
  tabs: Tab[];
  ariaLabel: string;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={ariaLabel} className={cn('border-b border-line', className)}>
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-block border-b-2 px-3.5 py-2.5 text-sm whitespace-nowrap transition-colors',
                  active
                    ? 'border-accent font-medium text-accent'
                    : 'border-transparent text-muted hover:border-line hover:text-foreground',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
