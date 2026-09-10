import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * An empty state should say what's missing and offer the next action.
 *
 * Accepts both shapes so call sites can migrate incrementally: the bare
 * `<EmptyState>Some text.</EmptyState>` form renders that text as the
 * description.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
  children,
}: {
  icon?: LucideIcon;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const body = description ?? children;

  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-full border border-line bg-panel-2 text-faint">
          <Icon size={19} strokeWidth={1.75} aria-hidden />
        </div>
      )}
      {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
      {body && (
        <p className={cn('max-w-sm text-sm leading-relaxed text-muted', title && 'mt-1')}>{body}</p>
      )}
      {action && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>
      )}
    </div>
  );
}
