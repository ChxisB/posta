import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

/**
 * `brightness` rather than a second colour token for hover: it darkens on the
 * light ground and lightens on the dark one, so a single pair of utilities
 * reads correctly in both themes without doubling every variant.
 */
const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink shadow-elev-sm hover:brightness-95 dark:hover:brightness-110',
  secondary: 'border border-line bg-panel text-foreground shadow-elev-sm hover:bg-panel-2',
  ghost: 'text-muted hover:bg-panel-2 hover:text-foreground',
  danger: 'border border-red/30 text-red hover:bg-red/10',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-xs',
  md: 'h-9 gap-2 rounded-lg px-3.5 text-sm',
  lg: 'h-11 gap-2 rounded-lg px-5 text-sm',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center font-medium whitespace-nowrap transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    >
      {loading && <Loader2 size={14} className="animate-spin-slow" aria-hidden />}
      {children}
    </button>
  );
}

/**
 * Square icon-only button. `label` is required: it becomes the accessible
 * name and the tooltip, so an icon button can never ship unlabelled.
 */
export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className = '',
  children,
  ...props
}: Omit<ButtonProps, 'loading'> & { label: string }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid cursor-pointer place-items-center rounded-lg transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9',
        className,
      )}
    >
      {children}
    </button>
  );
}

const LINK_BASE =
  'inline-flex cursor-pointer items-center justify-center font-medium whitespace-nowrap transition-colors';

/**
 * A link that reads as a button. Use for navigation (an <a> the browser can
 * open in a new tab); use `Button` for actions that run in place.
 */
export function ButtonLink({
  href,
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...props
}: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  variant?: Variant;
  size?: Size;
}) {
  return (
    <Link href={href} {...props} className={cn(LINK_BASE, VARIANT[variant], SIZE[size], className)}>
      {children}
    </Link>
  );
}
