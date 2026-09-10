import { cn } from '@/lib/utils';

/**
 * Visually hidden until focused, then anchored top-left. Lets a keyboard user
 * jump past the navigation, which on app routes is otherwise a dozen-plus
 * links to tab through before reaching the page itself.
 */
export function SkipLink({
  href,
  className = '',
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={cn(
        'sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]',
        'focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-ink',
        className,
      )}
    >
      {children}
    </a>
  );
}
