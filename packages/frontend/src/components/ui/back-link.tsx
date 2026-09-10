import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Link back to the parent resource, for the top of a detail or form page. */
export function BackLink({
  href,
  className = '',
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-foreground',
        className,
      )}
    >
      <ArrowLeft size={13} aria-hidden />
      {children}
    </Link>
  );
}
