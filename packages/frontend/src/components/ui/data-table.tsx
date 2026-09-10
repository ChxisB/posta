import Link from 'next/link';
import { SkeletonRows } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Layout classes applied to both the header cell and the body cell. */
  className?: string;
  /** Leave this column out of the mobile card list. */
  hideOnCard?: boolean;
  /** Render as the card's headline rather than a labelled row. */
  primary?: boolean;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  getRowKey: (row: T) => string;
  /**
   * Makes rows navigable. A real href rather than an onClick handler, for
   * two reasons: it keeps this component usable from Server Components (see
   * the note below), and it gives middle-click, right-click-open and
   * keyboard activation for free instead of reimplementing them.
   */
  rowHref?: (row: T) => string;
  /** Accessible name for a navigable row, e.g. `(m) => \`Message ${m.id}\``. */
  getRowLabel?: (row: T) => string;
  loading?: boolean;
  loadingRows?: number;
  empty?: React.ReactNode;
  /** When set, shown instead of `empty`: a failed load is not an empty one. */
  error?: React.ReactNode;
  className?: string;
}

/**
 * The app's one table. Renders a real <table> from `md` up inside a
 * horizontal scroll container, and a card list below it, because a
 * six-column table of recipients and delivery states is unreadable on a
 * phone even with scrolling.
 *
 * Deliberately NOT a "use client" module. Two thirds of Posta's pages are
 * Server Components that fetch through lib/api on the server, and `columns`
 * carries `cell` render functions; functions cannot be serialised across the
 * server/client boundary, so a client-only table could not be called from
 * those pages at all. With no directive here the component compiles into
 * whichever context imports it, and both halves of the app share one table.
 *
 * The corollary: nothing in this file may use hooks or event handlers. Row
 * interaction goes through `rowHref`.
 */
export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  rowHref,
  getRowLabel,
  loading = false,
  loadingRows = 5,
  empty,
  error,
  className = '',
}: DataTableProps<T>) {
  if (loading) return <SkeletonRows count={loadingRows} />;
  // Error before empty: an unreachable API must never read as "nothing here".
  if (error) return <>{error}</>;
  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className={className}>
      {/* Desktop / tablet */}
      <div className="-mx-1 hidden overflow-x-auto px-1 md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-soft text-left">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'py-2.5 pr-3 text-2xs font-medium tracking-wide text-faint uppercase',
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={getRowKey(row)}
                className={cn(
                  'border-b border-line-soft last:border-0',
                  rowHref && 'transition-colors hover:bg-panel-2',
                )}
              >
                {columns.map((col, i) => (
                  <td key={col.key} className={cn('py-3 pr-3 align-middle', col.className)}>
                    {/* The link is stretched over the whole row from the
                        first cell, so the row is clickable anywhere while
                        the accessible tree still sees exactly one link. */}
                    {rowHref && i === 0 ? (
                      <Link
                        href={rowHref(row)}
                        aria-label={getRowLabel?.(row)}
                        className="relative after:absolute after:inset-0 after:content-['']"
                      >
                        {col.cell(row)}
                      </Link>
                    ) : (
                      col.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="flex flex-col gap-2.5 md:hidden">
        {rows.map((row) => {
          const cardColumns = columns.filter((c) => !c.hideOnCard);
          const primary = cardColumns.find((c) => c.primary);
          const rest = cardColumns.filter((c) => !c.primary);

          const body = (
            <>
              {primary && <div className="mb-2 font-medium break-all">{primary.cell(row)}</div>}
              <dl className="flex flex-col gap-1.5">
                {rest.map((col) => (
                  <div key={col.key} className="flex items-baseline justify-between gap-3">
                    <dt className="text-2xs tracking-wide text-faint uppercase">{col.header}</dt>
                    <dd className="min-w-0 text-right text-sm break-all">{col.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </>
          );

          return (
            <li key={getRowKey(row)}>
              {rowHref ? (
                <Link
                  href={rowHref(row)}
                  aria-label={getRowLabel?.(row)}
                  className="block rounded-xl border border-line bg-panel p-4 transition-colors hover:bg-panel-2"
                >
                  {body}
                </Link>
              ) : (
                <div className="rounded-xl border border-line bg-panel p-4">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
