'use client';

import { CheckCircle2 } from 'lucide-react';
import { Reel, ReelRow, ReelStage } from '@/components/ui/reel';
import { KindTag, MessageStatusPill } from '@/components/ui/pill';

/**
 * The delivery reel: one message from API call to accepted, with the clock
 * running. Shown on the sign-in panel (AuthSplit), and copied into
 * posta-site for its hero.
 *
 * Chosen because it dramatises the headline's actual claim. The headline
 * promises sub-second delivery, and a static screenshot cannot show a
 * duration — whereas watching the stages tick past makes the number mean
 * something.
 *
 * The figures are the benchmark's, not invented: ~8ms to accept, ~5ms to pick
 * up, then the handoff, which is dominated by the recipient's round trips. If
 * the pipeline regresses these become a lie, which is the right kind of
 * pressure to have.
 *
 * Built from the real MessageStatusPill and KindTag, so it cannot drift from
 * what an operator actually sees in the dashboard.
 */

const STAGES = [
  { label: 'POST /api/v1/send', detail: 'accepted', ms: '8ms' },
  { label: 'Queued → picked up', detail: 'notified', ms: '5ms' },
  { label: 'gmail-smtp-in.l.google.com', detail: 'pooled connection', ms: '0ms' },
  { label: 'MAIL · RCPT · DATA', detail: 'pipelined', ms: '81ms' },
];

export function DeliveryReel() {
  // Pending until the dialog completes, then delivered — the same states the
  // dashboard itself shows.
  const status = (step: number) => (step >= 5 ? 'Sent' : 'Pending');

  return (
    <Reel
      label="A message is sent through Posta: the API accepts it in 8 milliseconds, a worker picks it up 5 milliseconds later, it reuses a warm connection to Google's mail server, pipelines the SMTP conversation in 81 milliseconds, and is accepted for delivery 94 milliseconds after the API call."
      timings={[1100, 900, 900, 900, 1000, 2800]}
      className="w-full max-w-[520px]"
      render={(step) => (
        <ReelStage className="flex h-[292px] flex-col gap-3 text-left">
          <div className="flex items-center gap-2.5 border-b border-line-soft pb-3">
            <span className="truncate font-mono text-sm font-medium text-foreground">
              ana@example.com
            </span>
            <KindTag>transactional</KindTag>
            <span className="ml-auto">
              <MessageStatusPill status={status(step)} />
            </span>
          </div>

          <ul className="flex flex-col gap-2">
            {STAGES.map((stage, i) => (
              <li key={stage.label}>
                <ReelRow show={step >= i + 1}>
                  <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                      {stage.label}
                    </span>
                    <span className="hidden shrink-0 text-2xs text-faint sm:inline">
                      {stage.detail}
                    </span>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-accent">
                      {stage.ms}
                    </span>
                  </div>
                </ReelRow>
              </li>
            ))}
          </ul>

          <div className="mt-auto">
            <ReelRow show={step >= 5}>
              <div className="flex items-center gap-2 rounded-lg border border-green/25 bg-green/8 px-3 py-2.5 text-sm">
                <CheckCircle2 size={15} className="shrink-0 text-green" aria-hidden />
                <span className="font-medium text-foreground">250 Accepted</span>
                <span className="ml-auto text-xs font-semibold tabular-nums text-green">
                  94ms total
                </span>
              </div>
            </ReelRow>
          </div>
        </ReelStage>
      )}
    />
  );
}
