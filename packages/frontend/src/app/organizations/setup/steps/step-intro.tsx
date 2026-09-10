import { ArrowRight, Wrench } from 'lucide-react';

/**
 * The explanatory block every setup step opens with.
 *
 * Each step used to be a bare form: a couple of labelled inputs and a
 * Continue button, with nothing saying what the step was for, why it
 * mattered, or what would happen when you pressed the button. That is
 * survivable for "Organization name" and genuinely confusing by the time you
 * reach DNS records and sending direction.
 *
 * The three slots answer the three questions someone actually has:
 *   - the heading and body: what am I doing, and why does it matter?
 *   - `needs`: is there anything I have to go and fetch before I can do it?
 *   - `next`: what happens when I press the button?
 *
 * `needs` is the important one. Two steps depend on access the operator may
 * not have to hand — their DNS provider, and a mailbox to receive a test —
 * and finding that out half-way through is what makes people abandon.
 */
export function StepIntro({
  title,
  children,
  needs,
  next,
  optional = false,
}: {
  title: string;
  children: React.ReactNode;
  /** Something the operator must have before this step can be completed. */
  needs?: React.ReactNode;
  /** What pressing the step's primary button actually does. */
  next?: React.ReactNode;
  /** Marks a step that can be skipped without breaking the setup. */
  optional?: boolean;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-line-soft pb-6">
      <div>
        <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
          {title}
          {optional && (
            <span className="rounded-full border border-line bg-panel-2 px-2 py-0.5 text-2xs font-semibold tracking-wide text-muted uppercase">
              Optional
            </span>
          )}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{children}</p>
      </div>

      {needs && (
        <p className="flex items-start gap-2 rounded-lg border border-amber/25 bg-amber/8 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
          <Wrench size={14} className="mt-0.5 shrink-0 text-amber" aria-hidden />
          <span>
            <strong className="font-semibold text-foreground">You&apos;ll need: </strong>
            {needs}
          </span>
        </p>
      )}

      {next && (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-faint">
          <ArrowRight size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold text-muted">Next: </strong>
            {next}
          </span>
        </p>
      )}
    </div>
  );
}
