'use client';

import { createContext, useContext, useId } from 'react';
import { cn } from '@/lib/utils';

interface FieldMeta {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldMeta | null>(null);

/** Controls call this to inherit their Field's id/aria wiring, if any. */
export function useFieldMeta(): FieldMeta | null {
  return useContext(FieldContext);
}

/**
 * Label + control + hint/error, with the aria wiring done once.
 *
 * Uses an explicit `htmlFor`/`id` pair rather than wrapping the control in
 * the label, so hint and error text land in `aria-describedby` instead of
 * being absorbed into the control's accessible name.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  className = '',
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const base = useId();
  const id = `${base}-control`;
  const hintId = hint ? `${base}-hint` : undefined;
  const errorId = error ? `${base}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-red" aria-hidden>
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </label>

      <FieldContext.Provider value={{ id, describedBy, invalid: !!error }}>
        {children}
      </FieldContext.Provider>

      {error ? (
        <p id={errorId} className="text-2xs text-red">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-2xs leading-relaxed text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
