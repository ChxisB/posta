'use client';

import { ChevronDown } from 'lucide-react';
import { useFieldMeta } from '@/components/ui/field';
import { CONTROL_BASE, controlBorder } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Native <select> with the platform chevron swapped for a themed one. Kept
 * native on purpose: it stays keyboard- and screen-reader-correct and opens
 * as the OS picker on mobile, which no custom listbox matches for free.
 */
export function Select({
  className = '',
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const field = useFieldMeta();
  return (
    <div className={cn('relative', className)}>
      <select
        id={field?.id}
        aria-describedby={field?.describedBy}
        aria-invalid={field?.invalid || undefined}
        {...props}
        className={cn(
          CONTROL_BASE,
          controlBorder(!!field?.invalid),
          'h-9 cursor-pointer appearance-none pr-9 pl-3',
        )}
      >
        {children}
      </select>
      <ChevronDown
        size={15}
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-faint"
      />
    </div>
  );
}

/** Checkbox with its label, for the many boolean flags on servers and routes. */
export function Checkbox({
  label,
  hint,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: React.ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5', className)}>
      <input
        type="checkbox"
        {...props}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-accent"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-foreground">{label}</span>
        {hint && <span className="mt-0.5 block text-2xs leading-relaxed text-faint">{hint}</span>}
      </span>
    </label>
  );
}
