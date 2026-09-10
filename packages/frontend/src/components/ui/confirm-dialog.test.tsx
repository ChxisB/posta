import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './confirm-dialog';

function setup(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ConfirmDialog
      title="Delete webhook"
      description="This removes the webhook for orders.example.com."
      confirmLabel="Delete"
      destructive
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />,
  );
  return { onConfirm, onClose, user: userEvent.setup() };
}

describe('ConfirmDialog', () => {
  it('exposes itself as a modal named by its title', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Delete webhook' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('names the specific record being deleted', () => {
    // The point of replacing window.confirm(): "Delete this webhook?" gave
    // no way to tell which of several webhooks was about to go.
    setup();
    expect(screen.getByText(/orders\.example\.com/)).toBeInTheDocument();
  });

  it('confirms only when the confirm button is pressed', async () => {
    const { onConfirm, onClose, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Cancel, on the close button and on Escape', async () => {
    const { onClose, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('moves focus into the dialog on open', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('traps Tab inside the dialog', async () => {
    const { user } = setup();
    const dialog = screen.getByRole('dialog');
    // Far more tabs than there are focusable elements: if the trap leaks,
    // focus lands on document.body and this fails.
    for (let i = 0; i < 8; i++) await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('disables cancel but keeps the dialog open while the action runs', () => {
    setup({ loading: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reports a failed action in place rather than closing', () => {
    // Replaces the old `confirm()` then `alert(err.message)` pair, which
    // dropped the operator back to the list with the record still there and
    // no explanation attached to it.
    setup({ error: 'Webhook is referenced by an active route' });
    expect(screen.getByRole('alert')).toHaveTextContent('Webhook is referenced by an active route');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
