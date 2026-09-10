'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'error';

interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

const ToastContext = createContext<{ toast: (tone: Tone, message: string) => void } | null>(null);

/**
 * Transient confirmations and failures.
 *
 * Replaces the `alert(err.message)` calls scattered through the mutation
 * handlers. A native alert blocks the whole tab, cannot be styled, is
 * impossible to test, and puts the browser's own origin string above the
 * message; it also gave a *successful* delete no feedback at all, because
 * nobody wants to interrupt someone to say "that worked".
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((tone: Tone, message: string) => {
    setToasts((current) => [...current, { id: Date.now() + Math.random(), tone, message }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Errors are assertive, successes polite: a failed delete needs to
          interrupt, a successful one does not. */}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  // Errors stay until dismissed. An operator who just lost a delete needs to
  // be able to read the reason, copy it, and act on it.
  useEffect(() => {
    if (toast.tone === 'error') return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [toast.tone, onDismiss]);

  const error = toast.tone === 'error';
  const Icon = error ? CircleAlert : CircleCheck;

  return (
    <div
      role={error ? 'alert' : 'status'}
      className={cn(
        'animate-slide-in pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-panel px-4 py-3 shadow-elev-md',
        error ? 'border-red/30' : 'border-green/30',
      )}
    >
      <Icon
        size={16}
        className={cn('mt-0.5 shrink-0', error ? 'text-red' : 'text-green')}
        aria-hidden
      />
      <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mt-0.5 -mr-1 shrink-0 cursor-pointer rounded p-1 text-faint transition-colors hover:text-foreground"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}
