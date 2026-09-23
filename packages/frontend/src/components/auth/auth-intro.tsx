import Link from 'next/link';
import { Mail } from 'lucide-react';

/**
 * The heading above Clerk's card on /login and /sign-up. Clerk's own title
 * only ever says "Sign in to Posta"; this is where the page explains what
 * signing in here actually does, which differs on a fresh installation.
 */
export function AuthIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 text-center">
      <Link href="/" className="inline-flex items-center gap-2.5 text-foreground">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink">
          <Mail size={17} strokeWidth={2.25} aria-hidden />
        </span>
        <span className="text-lg font-bold tracking-tight">Posta</span>
      </Link>
      {eyebrow && (
        <p className="mt-8 text-xs font-semibold tracking-wide text-accent uppercase">{eyebrow}</p>
      )}
      <h1 className={eyebrow ? 'mt-2 text-2xl font-bold tracking-tight' : 'mt-8 text-2xl font-bold tracking-tight'}>
        {title}
      </h1>
      {children && (
        <div className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">{children}</div>
      )}
    </div>
  );
}
