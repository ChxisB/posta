'use client';

import { cn } from '@/lib/utils';

export interface FilterOption<V extends string> {
  value: V;
  label: React.ReactNode;
  count?: number;
  /** Tailwind text colour class for the leading dot, e.g. "text-green". */
  dotClass?: string;
}

/**
 * A row of mutually exclusive filter toggles.
 *
 * `aria-pressed` rather than plain buttons so the active filter is
 * announced, and a group `label` so the set has a name.
 */
export function FilterPills<V extends string>({
  options,
  value,
  onChange,
  label,
  allLabel = 'All',
  allCount,
  className = '',
}: {
  options: FilterOption<V>[];
  value: V | 'all';
  onChange: (next: V | 'all') => void;
  label: string;
  allLabel?: string;
  allCount?: number;
  className?: string;
}) {
  const entries = [
    { key: 'all', value: 'all' as const, label: allLabel, count: allCount, dotClass: undefined },
    ...options.map((o) => ({
      key: o.value,
      value: o.value,
      label: o.label,
      count: o.count,
      dotClass: o.dotClass,
    })),
  ];

  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {entries.map((entry) => {
        const active = value === entry.value;
        return (
          <button
            key={entry.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(entry.value)}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
              active
                ? 'border-accent bg-accent/10 font-medium text-accent'
                : 'border-line bg-panel text-muted hover:bg-panel-2 hover:text-foreground',
            )}
          >
            {entry.dotClass && (
              <span
                aria-hidden
                className={cn('h-1.5 w-1.5 rounded-full bg-current', entry.dotClass)}
              />
            )}
            {entry.label}
            {entry.count !== undefined && (
              <span className="tabular-nums text-faint">{entry.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
