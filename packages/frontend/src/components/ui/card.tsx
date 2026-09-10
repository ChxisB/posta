import { cn } from '@/lib/utils';

/**
 * The app's one raised surface. Unpadded by default so a card can hold a
 * flush table or its own header/body split; pass `padded` for the common
 * single-block case.
 *
 * `rounded-2xl` and a 6-unit pad, one step softer and roomier than Warden's
 * equivalent. Posta is a product people leave open all day reading lists of
 * mail, not an operator console being scanned under pressure.
 */
export function Card({
  padded = false,
  className = '',
  children,
}: {
  padded?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-panel shadow-elev-sm',
        padded && 'p-6',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className = '',
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-3 border-b border-line-soft px-6 py-4',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('p-6', className)}>{children}</div>;
}

export function CardFooter({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-center gap-2 border-t border-line-soft px-6 py-3.5', className)}>
      {children}
    </div>
  );
}

/**
 * A single headline number. Posta's overview screens are mostly counters
 * (sent today, held, bounced), and every page was previously rolling its own
 * markup for them.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  className = '',
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'green' | 'amber' | 'orange' | 'red' | 'sky';
  className?: string;
}) {
  const TONE = {
    default: 'text-foreground',
    green: 'text-green',
    amber: 'text-amber',
    orange: 'text-orange',
    red: 'text-red',
    sky: 'text-sky',
  } as const;

  return (
    <Card className={cn('p-6', className)}>
      <p className="text-2xs font-semibold tracking-wide text-faint uppercase">{label}</p>
      <p className={cn('mt-2 text-3xl font-semibold tabular-nums', TONE[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>}
    </Card>
  );
}
