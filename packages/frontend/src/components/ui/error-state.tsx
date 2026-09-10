import { CloudOff, RotateCw, TriangleAlert } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { ButtonLink } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A failed request is not an empty list.
 *
 * Every list in the app previously showed its "nothing here yet" copy when a
 * fetch failed, so an unreachable API read as "no domains configured", which
 * sends the operator off to add one that already exists. This states what
 * actually happened and offers the only useful next action.
 *
 * No "use client" and no onRetry callback, for the same reason as DataTable:
 * most of the pages that need this render on the server. Retry is a link
 * back to the current route, which re-runs the server fetch.
 */
export function ErrorState({
  error,
  retryHref,
  what = 'this',
  className = '',
}: {
  error: unknown;
  /** Route to reload to retry, usually the current path. */
  retryHref?: string;
  /** What failed to load, e.g. "your messages". Used in the message. */
  what?: string;
  className?: string;
}) {
  const { title, detail, offline } = describe(error, what);
  const Icon = offline ? CloudOff : TriangleAlert;

  return (
    <div
      className={cn('flex flex-col items-center px-6 py-12 text-center', className)}
      role="alert"
    >
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full border border-red/25 bg-red/8 text-red">
        <Icon size={19} strokeWidth={1.75} aria-hidden />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted">{detail}</p>
      {retryHref && (
        <ButtonLink href={retryHref} variant="secondary" size="sm" className="mt-5">
          <RotateCw size={13} aria-hidden /> Try again
        </ButtonLink>
      )}
    </div>
  );
}

/**
 * Turns a thrown value into something an operator can act on. The
 * distinction that matters is "the API isn't answering" (check the service)
 * versus "the API answered and said no" (a permission or request problem).
 */
function describe(
  error: unknown,
  what: string,
): { title: string; detail: string; offline: boolean } {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return {
        title: 'Not authorised',
        detail:
          "Your session may have expired, or this organisation doesn't have access to it. Try signing in again.",
        offline: false,
      };
    }
    if (error.status === 404) {
      return {
        title: 'Not found',
        detail: `The API has no record of ${what}. It may have been deleted, or the link may be out of date.`,
        offline: false,
      };
    }
    if (error.status >= 500) {
      return {
        title: 'The API hit an error',
        detail: `${error.message}. The request reached the server, so this is worth checking in the web-server logs.`,
        offline: false,
      };
    }
    return { title: `Couldn't load ${what}`, detail: error.message, offline: false };
  }

  // fetch() rejects rather than resolving when the server can't be reached:
  // a stopped API, a port that moved, or NEXT_PUBLIC_API_URL pointing
  // somewhere else.
  return {
    title: "Can't reach the API",
    detail: `Posta's API didn't respond, so ${what} couldn't be loaded. Check that the web-server package is running and that NEXT_PUBLIC_API_URL points at it.`,
    offline: true,
  };
}
