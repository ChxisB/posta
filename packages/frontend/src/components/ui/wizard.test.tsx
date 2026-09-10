import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Wizard, type WizardStep } from './wizard';

const STEPS: WizardStep[] = [
  { key: 'org', label: 'Organization', content: <p>Pick a name</p> },
  { key: 'server', label: 'Server', content: <p>Name the server</p> },
  { key: 'domain', label: 'Domain', content: <p>Add a domain</p> },
];

function setup(overrides: Partial<React.ComponentProps<typeof Wizard>> = {}) {
  const onStepIndexChange = vi.fn();
  const onSubmit = vi.fn();
  const { rerender } = render(
    <Wizard
      steps={STEPS}
      stepIndex={0}
      onStepIndexChange={onStepIndexChange}
      submitLabel="Finish setup"
      onSubmit={onSubmit}
      canSubmit
      {...overrides}
    />,
  );
  return { onStepIndexChange, onSubmit, rerender, user: userEvent.setup() };
}

describe('Wizard', () => {
  it("renders only the current step's content", () => {
    setup();
    expect(screen.getByText('Pick a name')).toBeInTheDocument();
    expect(screen.queryByText('Name the server')).not.toBeInTheDocument();
  });

  it('marks the current step for assistive tech', () => {
    setup({ stepIndex: 1 });
    expect(screen.getByRole('button', { name: 'Step 2: Server' })).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('disables Back on the first step', () => {
    setup();
    expect(screen.getByRole('button', { name: /Back/ })).toBeDisabled();
  });

  it('advances and retreats one step at a time', async () => {
    const { onStepIndexChange, user } = setup({ stepIndex: 1 });
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(onStepIndexChange).toHaveBeenCalledWith(2);
    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(onStepIndexChange).toHaveBeenCalledWith(0);
  });

  it('blocks Next while the current step is unsatisfied', () => {
    // The guarantee the flow depends on: you cannot reach the DNS step
    // without having actually created the domain the records belong to.
    const steps = [{ ...STEPS[0], canAdvance: false }, ...STEPS.slice(1)];
    setup({ steps });
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });

  it('lets the rail jump back to a reached step but not forward past it', async () => {
    const { onStepIndexChange, user } = setup({ stepIndex: 1 });
    await user.click(screen.getByRole('button', { name: 'Step 1: Organization' }));
    expect(onStepIndexChange).toHaveBeenCalledWith(0);

    expect(screen.getByRole('button', { name: 'Step 3: Domain' })).toBeDisabled();
  });

  it('shows submit instead of Next only on the last step', async () => {
    const { onSubmit, user } = setup({ stepIndex: 2 });
    expect(screen.queryByRole('button', { name: /Next/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('blocks submit until every step is satisfied', () => {
    setup({ stepIndex: 2, canSubmit: false });
    expect(screen.getByRole('button', { name: 'Finish setup' })).toBeDisabled();
  });

  it('locks navigation while submitting', () => {
    setup({ stepIndex: 2, submitting: true, submittingLabel: 'Finishing…' });
    expect(screen.getByRole('button', { name: /Back/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Finishing…' })).toBeDisabled();
  });

  it('counts steps for the operator', () => {
    setup({ stepIndex: 1 });
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
  });
});
