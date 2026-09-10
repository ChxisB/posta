'use client';

import { Check, ExternalLink, Minus, Sparkles } from 'lucide-react';
import type { WizardState } from '../wizard-client';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  state: WizardState;
  onFinish: () => void;
}

const NEXT_STEPS = [
  {
    title: 'Confirm DNS has propagated',
    body: 'SPF, DKIM and MX can take up to 48 hours. Until they resolve, receiving servers may treat your mail as unauthenticated.',
  },
  {
    title: 'Add a tracking domain',
    body: 'Click and open tracking served from your own domain rather than a shared one, which receiving servers trust more.',
  },
  {
    title: 'Add more servers',
    body: 'A separate server per environment keeps development sending away from your production reputation.',
  },
];

export default function StepSummary({ state, onFinish }: Props) {
  /**
   * `done` is what the wizard actually recorded. The DNS step is the one
   * exception: publishing records happens outside Posta, so the wizard can
   * only confirm it generated them, not that they resolve. Marking it "Done"
   * would claim something the wizard has not verified.
   */
  const steps = [
    { label: 'Organization', done: !!state.orgPermalink, value: state.orgName },
    { label: 'Server', done: !!state.serverId, value: state.serverName },
    { label: 'Domain', done: !!state.domainId, value: state.domainName },
    {
      label: 'DNS records',
      done: !!state.domainId,
      value: 'Generated — verify they have propagated',
    },
    { label: 'Credentials', done: !!state.credentialId, value: state.credentialName },
    {
      label: 'Test send',
      done: state.testSent,
      value: state.testSent ? 'Message accepted' : 'Skipped',
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <div className="flex flex-col gap-6">
      <div
        className={cn(
          'flex items-center gap-4 rounded-2xl border p-5',
          allDone ? 'border-green/30 bg-green/6' : 'border-amber/30 bg-amber/6',
        )}
      >
        <span
          className={cn(
            'grid h-12 w-12 shrink-0 place-items-center rounded-xl',
            allDone ? 'bg-green/15 text-green' : 'bg-amber/15 text-amber',
          )}
        >
          <Sparkles size={22} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">
            {allDone ? 'Ready to send' : 'Almost there'}
          </h3>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">
            {allDone
              ? 'Every step is complete. Mail sent through this server will authenticate once DNS has propagated.'
              : `${doneCount} of ${steps.length} steps done. The skipped ones can be finished any time from the organisation page.`}
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {steps.map((s) => (
          <li
            key={s.label}
            className="flex items-center gap-3 rounded-lg border border-line-soft px-3.5 py-3"
          >
            <span
              aria-hidden
              className={cn(
                'grid h-5 w-5 shrink-0 place-items-center rounded-full',
                s.done ? 'bg-green/15 text-green' : 'bg-panel-2 text-faint',
              )}
            >
              {s.done ? <Check size={12} strokeWidth={3} /> : <Minus size={12} strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{s.label}</p>
              {s.value && <p className="truncate text-xs text-muted">{s.value}</p>}
            </div>
            <span className="text-2xs font-semibold tracking-wide text-faint uppercase">
              {s.done ? 'Done' : 'Skipped'}
            </span>
          </li>
        ))}
      </ul>

      <Card>
        <CardHeader title="What to do next" />
        <CardBody>
          <ul className="flex flex-col gap-3">
            {NEXT_STEPS.map((item) => (
              <li key={item.title}>
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-2">
        {state.orgPermalink && (
          <ButtonLink href={`/organizations/${state.orgPermalink}`} variant="secondary">
            <ExternalLink size={15} aria-hidden /> Open organisation
          </ButtonLink>
        )}
        <Button variant="primary" onClick={onFinish}>
          Finish
        </Button>
      </div>
    </div>
  );
}
