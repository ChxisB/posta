import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'warning' | 'danger' | 'success';

const TONE: Record<Tone, { wrapper: string; icon: LucideIcon }> = {
  info: { wrapper: 'border-accent/25 bg-accent/6 text-accent', icon: Info },
  warning: { wrapper: 'border-amber/30 bg-amber/8 text-amber', icon: TriangleAlert },
  danger: { wrapper: 'border-red/30 bg-red/8 text-red', icon: CircleAlert },
  success: { wrapper: 'border-green/30 bg-green/8 text-green', icon: CircleCheck },
};

/**
 * Inline notice. Body text is foreground-coloured rather than tinted, the
 * border and icon carry the tone, so a long message stays as readable as
 * ordinary prose.
 *
 * This is what form errors should use. The pre-redesign pages rendered them
 * as `<div className="tag tag-red">{error}</div>`, a pill: uppercase, tiny,
 * pinched to one line, and truncating exactly the API messages an operator
 * needed to read.
 */
export function Callout({
  tone = 'info',
  title,
  action,
  className = '',
  children,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const { wrapper, icon: Icon } = TONE[tone];

  return (
    <div
      className={cn('flex gap-3 rounded-lg border px-4 py-3', wrapper, className)}
      role={tone === 'danger' ? 'alert' : undefined}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
        {children && (
          <div className={cn('text-xs leading-relaxed text-muted', title && 'mt-1')}>
            {children}
          </div>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
