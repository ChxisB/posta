'use client';

import { useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from '@/components/ui/button';
import { useDismissableLayer } from '@/hooks/use-dismissable-layer';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<Size, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Modal dialog. Mount it when it should be open (`{open && <Dialog .../>}`).
 *
 * Handles the things a hand-rolled modal usually misses: focus moves into the
 * dialog on open and returns to the trigger on close, Tab is trapped inside,
 * Escape closes, background scroll is locked, and the title is wired up as
 * the accessible name.
 */
export function Dialog({
  title,
  description,
  onClose,
  size = 'md',
  footer,
  className = '',
  children,
}: {
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  size?: Size;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const base = useId();
  const titleId = `${base}-title`;
  const descId = description ? `${base}-desc` : undefined;
  const { ref: panelRef, onKeyDown } = useDismissableLayer<HTMLDivElement>(true, onClose);

  // Mounted only from client state (`{open && <Dialog/>}`), so `document`
  // always exists by the time this runs.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="animate-fade-in fixed inset-0 bg-foreground/25 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          'animate-rise-in relative my-auto w-full rounded-2xl border border-line bg-panel shadow-elev-lg outline-none',
          SIZE[size],
          className,
        )}
      >
        <div className="flex items-start gap-3 border-b border-line-soft px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm leading-relaxed text-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} className="-mt-1 -mr-1.5">
            <X size={16} />
          </IconButton>
        </div>

        <div className="px-6 py-4">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
