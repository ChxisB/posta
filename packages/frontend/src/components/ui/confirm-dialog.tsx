'use client';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';

/**
 * Replaces window.confirm() for destructive actions, of which Posta had ten,
 * every one of them the bare string "Delete this webhook?" with no indication
 * of *which* webhook. This is themed, focus-trapped, can name the exact
 * record being removed, and has somewhere to put the failure when the delete
 * is rejected: the old flow followed confirm() with alert(err.message).
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  /** Shown inside the dialog when the action fails, so it stays open. */
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-muted">{description}</div>
      {error && (
        <Callout tone="danger" className="mt-4">
          {error}
        </Callout>
      )}
    </Dialog>
  );
}
