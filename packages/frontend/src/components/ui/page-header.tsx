import { cn } from '@/lib/utils';

/**
 * The title block at the top of a route. Replaces the per-page pattern of a
 * heading plus a paragraph of explanatory prose stuffed inside the first
 * card, so the explanation sits with the page rather than with its content.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className = '',
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Rendered above the title, e.g. a back link to the parent resource. */
  breadcrumb?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(className)}>
      {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
