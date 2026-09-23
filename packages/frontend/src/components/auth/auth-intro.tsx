import Link from 'next/link';
import { Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The heading above Clerk's form on /login, /sign-up and /start. Clerk's own
 * title only ever says "Sign in to Posta"; this is where the page explains
 * what signing in here actually does, which differs on a fresh installation.
 *
 * `align="start"` is for the AuthSplit pages, whose frame already shows the
 * brand mark, so the heading drops it and lines up with the form's left edge.
 */
export function AuthIntro({
  eyebrow,
  title,
  align = 'center',
  children,
}: {
  eyebrow?: string;
  title: string;
  align?: 'center' | 'start';
  children?: React.ReactNode;
}) {
  const centered = align === 'center';

  return (
    <div className={cn('mb-6', centered && 'text-center')}>
      {centered && (
        <Link href="/" className="mb-8 inline-flex items-center gap-2.5 text-foreground">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink">
            <Mail size={17} strokeWidth={2.25} aria-hidden />
          </span>
          <span className="text-lg font-bold tracking-tight">Posta</span>
        </Link>
      )}
      {eyebrow && (
        <p className="mb-2 text-xs font-semibold tracking-wide text-accent uppercase">{eyebrow}</p>
      )}
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {children && (
        <div
          className={cn('mt-3 text-sm leading-relaxed text-muted', centered && 'mx-auto max-w-sm')}
        >
          {children}
        </div>
      )}
    </div>
  );
}
