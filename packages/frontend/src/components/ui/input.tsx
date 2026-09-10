'use client';

import { Search } from 'lucide-react';
import { useFieldMeta } from '@/components/ui/field';
import { cn } from '@/lib/utils';

/** Shared shell for text-like controls so input, select and textarea match. */
export const CONTROL_BASE =
  'w-full rounded-lg border bg-panel text-sm text-foreground transition-colors placeholder:text-faint disabled:cursor-not-allowed disabled:opacity-60';

export function controlBorder(invalid: boolean) {
  return invalid
    ? 'border-red/60 focus:border-red'
    : 'border-line hover:border-faint/60 focus:border-accent';
}

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const field = useFieldMeta();
  return (
    <input
      id={field?.id}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid || undefined}
      {...props}
      className={cn(CONTROL_BASE, controlBorder(!!field?.invalid), 'h-9 px-3', className)}
    />
  );
}

export function Textarea({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const field = useFieldMeta();
  return (
    <textarea
      id={field?.id}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid || undefined}
      {...props}
      className={cn(
        CONTROL_BASE,
        controlBorder(!!field?.invalid),
        'min-h-20 resize-y px-3 py-2 leading-relaxed',
        className,
      )}
    />
  );
}

/** Monospace variant, for API keys, DNS records and SMTP credentials. */
export function CodeInput({
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} className={cn('font-mono text-xs', className)} />;
}

/**
 * Text input with a leading search icon. A component rather than a `pl-9` at
 * the call site because the icon offset conflicts with Input's own padding,
 * and `cn` deliberately doesn't merge conflicting utilities.
 *
 * `label` is required: a placeholder is not an accessible name.
 */
export function SearchInput({
  label,
  className = '',
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search
        size={15}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
      />
      <input
        type="search"
        aria-label={label}
        {...props}
        className={cn(CONTROL_BASE, controlBorder(false), 'h-9 pr-3 pl-9')}
      />
    </div>
  );
}
