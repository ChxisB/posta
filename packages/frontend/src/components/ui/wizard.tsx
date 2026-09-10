'use client';

import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Card, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface WizardStep {
  /** Stable identity for the step. */
  key: string;
  /** Short name, shown on the step rail. */
  label: string;
  content: React.ReactNode;
  /** When false, Next is blocked on this step. Defaults to true. */
  canAdvance?: boolean;
}

/**
 * Shared chrome for a guided flow: a step rail, a body, and Back / Next /
 * submit navigation.
 *
 * A page rather than a dialog, which is where this differs from Warden's
 * wizard. Posta's onboarding is eight steps long, includes waiting on DNS
 * propagation, and is resumed across sessions from localStorage; a modal is
 * the wrong container for something you are expected to leave and come back
 * to, and it has nowhere to put eight step labels.
 *
 * The guarantees live here rather than in each flow: Next is blocked until
 * the current step is satisfied, submit is blocked until every step is, and
 * the rail only lets you jump back to a step you have already reached.
 * `stepIndex` is controlled by the caller so a summary step can send the
 * operator back to one earlier answer.
 */
export function Wizard({
  steps,
  stepIndex,
  onStepIndexChange,
  submitLabel,
  submittingLabel,
  onSubmit,
  canSubmit,
  submitting = false,
  className = '',
}: {
  steps: WizardStep[];
  stepIndex: number;
  onStepIndexChange: (index: number) => void;
  submitLabel: string;
  submittingLabel?: string;
  onSubmit: () => void;
  canSubmit: boolean;
  submitting?: boolean;
  className?: string;
}) {
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const canAdvance = step?.canAdvance !== false;

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <StepRail steps={steps} stepIndex={stepIndex} onStepIndexChange={onStepIndexChange} />

      <Card>
        <div className="p-6">{step?.content}</div>
        <CardFooter>
          <Button
            variant="ghost"
            onClick={() => onStepIndexChange(Math.max(stepIndex - 1, 0))}
            disabled={stepIndex === 0 || submitting}
          >
            <ArrowLeft size={14} aria-hidden /> Back
          </Button>
          <span className="ml-auto text-xs tabular-nums text-faint">
            Step {stepIndex + 1} of {steps.length}
          </span>
          {isLast ? (
            <Button variant="primary" onClick={onSubmit} disabled={!canSubmit} loading={submitting}>
              {submitting ? (submittingLabel ?? submitLabel) : submitLabel}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => onStepIndexChange(Math.min(stepIndex + 1, steps.length - 1))}
              disabled={!canAdvance}
            >
              Next <ArrowRight size={14} aria-hidden />
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

/**
 * Named steps, not bare numbers. With eight of them "you are on 4 of 8" is
 * not enough to tell you whether the next screen wants a DNS record or an
 * SMTP password. Labels collapse away below `md`, where the dots plus the
 * "Step n of m" counter in the footer carry the same information.
 */
function StepRail({
  steps,
  stepIndex,
  onStepIndexChange,
}: {
  steps: WizardStep[];
  stepIndex: number;
  onStepIndexChange: (index: number) => void;
}) {
  return (
    <ol className="flex items-center gap-1.5 overflow-x-auto pb-1" aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < stepIndex;
        const active = i === stepIndex;
        const reachable = i <= stepIndex;
        return (
          <li key={s.key} className="flex flex-1 items-center gap-1.5">
            <button
              type="button"
              onClick={() => reachable && onStepIndexChange(i)}
              disabled={!reachable}
              aria-label={`Step ${i + 1}: ${s.label}`}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-full py-1 pr-3 pl-1 transition-colors',
                reachable ? 'cursor-pointer hover:bg-panel-2' : 'cursor-default',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full text-2xs font-bold transition-colors',
                  active
                    ? 'bg-accent text-accent-ink'
                    : done
                      ? 'bg-accent/15 text-accent'
                      : 'bg-panel-2 text-faint',
                )}
              >
                {done ? <Check size={12} /> : i + 1}
              </span>
              <span
                aria-hidden
                className={cn(
                  'hidden text-xs whitespace-nowrap md:inline',
                  active ? 'font-medium text-foreground' : 'text-faint',
                )}
              >
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span aria-hidden className={cn('h-px flex-1', done ? 'bg-accent/40' : 'bg-line')} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Consistent heading + body for the content of one wizard step. */
export function WizardStepBody({
  title,
  description,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}
