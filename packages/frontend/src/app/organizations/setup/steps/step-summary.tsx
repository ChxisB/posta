'use client';

import type { WizardState } from '../wizard-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Sparkles, ExternalLink } from 'lucide-react';

interface Props {
  state: WizardState;
  onFinish: () => void;
}

export default function StepSummary({ state, onFinish }: Props) {
  const steps = [
    { label: 'Organization', done: !!state.orgPermalink, value: state.orgName },
    { label: 'Server', done: !!state.serverId, value: state.serverName },
    { label: 'Domain', done: !!state.domainId, value: state.domainName },
    { label: 'DNS', done: true, value: 'Configured in DNS records' },
    { label: 'Credentials', done: !!state.credentialId, value: state.credentialName },
    { label: 'Test Send', done: state.testSent, value: state.testSent ? 'Sent successfully' : 'Skipped' },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="space-y-6">
      {/* Completion badge */}
      <div className="flex items-center gap-4 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent p-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20">
          <Sparkles className="h-7 w-7" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Setup Complete</h3>
          <p className="text-sm text-muted-foreground">
            {doneCount} of {steps.length} steps completed. You finished {doneCount} setup {doneCount === 1 ? 'step' : 'steps'}.
          </p>
        </div>
      </div>

      {/* Step checklist */}
      <div className="space-y-2">
        {steps.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-lg border border-border/60 p-3"
          >
            <CheckCircle2
              className={`h-5 w-5 shrink-0 ${
                s.done ? 'text-emerald-500' : 'text-muted-foreground/30'
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{s.label}</p>
              {s.value && (
                <p className="text-xs text-muted-foreground truncate">{s.value}</p>
              )}
            </div>
            <Badge variant={s.done ? 'default' : 'secondary'}>
              {s.done ? 'Done' : 'Skipped'}
            </Badge>
          </div>
        ))}
      </div>

      {/* Next steps */}
      <Card className="border-border/60 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">What&apos;s next?</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">&bull;</span>
              <span className="text-muted-foreground">
                <strong>Verify DNS</strong> — Ensure your SPF, DKIM, and MX records are fully propagated.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">&bull;</span>
              <span className="text-muted-foreground">
                <strong>Add more servers</strong> — Create separate servers for different use cases or environments.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">&bull;</span>
              <span className="text-muted-foreground">
                <strong>Set up tracking domains</strong> — Improve deliverability with custom click and open tracking.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">&bull;</span>
              <span className="text-muted-foreground">
                <strong>Invite team members</strong> — Grant access to your organization.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="flex gap-3 pt-2">
        {state.orgPermalink && (
          <Button variant="outline" onClick={() => window.location.href = `/organizations/${state.orgPermalink}`}>
            <ExternalLink className="mr-2 h-4 w-4" /> Open Organization
          </Button>
        )}
        <Button onClick={onFinish}>
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
