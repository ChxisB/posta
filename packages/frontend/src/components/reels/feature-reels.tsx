'use client';

import { Ban, RotateCw, ShieldCheck } from 'lucide-react';
import { Reel, ReelRow, ReelStage } from '@/components/ui/reel';
import { CheckPill, KindTag, MessageStatusPill } from '@/components/ui/pill';

/**
 * Feature reels for the marketing site.
 *
 * Each one shows a mechanism that is genuinely hard to convey in a sentence —
 * DNS propagating, a bounce becoming a suppression, a webhook recovering from
 * a failure. All three are processes with a before and an after, which is
 * precisely what static copy is bad at and a reel is good at.
 *
 * Every reel is composed from the same pills the dashboard uses, so what a
 * visitor sees here is what they get after signing up. A marketing site built
 * from bespoke mock components drifts from the product within a release or
 * two, and the drift is invisible until a customer points it out.
 */

const DNS_RECORDS = [
  { field: 'SPF', value: 'v=spf1 include:posta.dev ~all' },
  { field: 'DKIM', value: 'v=DKIM1; k=rsa; p=MIIBIjAN…' },
  { field: 'MX', value: '10 mx.posta.dev' },
];

/**
 * Domain verification: records generated, published, and checked until green.
 *
 * The stage everyone underestimates. Showing the amber "pending" state
 * explicitly sets the expectation that verification is not instant, which is
 * better than a support ticket an hour later asking why it hasn't worked yet.
 */
export function DnsReel() {
  return (
    <Reel
      label="A domain is added to Posta. SPF, DKIM and MX records are generated, published at the DNS provider, and checked. Each turns from pending to OK, and the domain is verified and ready to send."
      timings={[1200, 1000, 1000, 1000, 2400]}
      className="w-full"
      render={(step) => (
        <ReelStage className="flex h-[248px] flex-col gap-3 text-left">
          <div className="flex items-center gap-2.5 border-b border-line-soft pb-3">
            <span className="truncate font-mono text-sm font-medium text-foreground">
              mail.acme.com
            </span>
            <span className="ml-auto">
              {step >= 4 ? (
                <CheckPill status="OK" />
              ) : (
                <span className="inline-flex items-center rounded-full border border-amber/30 bg-amber/10 px-2.5 py-0.5 text-2xs font-semibold tracking-wide text-amber uppercase">
                  Pending
                </span>
              )}
            </span>
          </div>

          <ul className="flex flex-col gap-2">
            {DNS_RECORDS.map((record, i) => (
              <li key={record.field}>
                <ReelRow show={step >= 1}>
                  <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel-2 px-3 py-2">
                    <KindTag>{record.field}</KindTag>
                    <span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted">
                      {record.value}
                    </span>
                    <span className="shrink-0">
                      {/* Records resolve one at a time: propagation is not
                          atomic, and pretending otherwise sets the wrong
                          expectation. */}
                      <CheckPill status={step >= i + 2 ? 'OK' : 'Checking'} />
                    </span>
                  </div>
                </ReelRow>
              </li>
            ))}
          </ul>

          <div className="mt-auto">
            <ReelRow show={step >= 4}>
              <div className="flex items-center gap-2 rounded-lg border border-green/25 bg-green/8 px-3 py-2 text-sm">
                <ShieldCheck size={15} className="shrink-0 text-green" aria-hidden />
                <span className="font-medium text-foreground">Domain verified</span>
                <span className="ml-auto text-xs text-faint">ready to send</span>
              </div>
            </ReelRow>
          </div>
        </ReelStage>
      )}
    />
  );
}

/**
 * A hard bounce becoming a suppression, and the next send being stopped.
 *
 * The reel makes the causal chain visible, which a feature list cannot:
 * suppression is not a list you maintain, it is something that happens
 * automatically and then protects you. The final frame — a send blocked
 * *before it leaves* — is the part worth paying for.
 */
export function BounceReel() {
  return (
    <Reel
      label="A message hard-bounces with a 550 no such user error. Posta adds the address to the suppression list automatically. The next message to that address is blocked before it is sent, protecting the sending reputation."
      timings={[1100, 1200, 1200, 2600]}
      className="w-full"
      render={(step) => (
        <ReelStage className="flex h-[248px] flex-col gap-3 text-left">
          <div className="flex items-center gap-2.5 border-b border-line-soft pb-3">
            <span className="truncate font-mono text-sm font-medium text-foreground">
              old@customer.com
            </span>
            <span className="ml-auto">
              <MessageStatusPill status={step >= 1 ? 'HardFail' : 'Pending'} />
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <ReelRow show={step >= 1}>
              <div className="rounded-lg border border-red/25 bg-red/8 px-3 py-2">
                <p className="font-mono text-2xs text-red">550 5.1.1 No such user here</p>
              </div>
            </ReelRow>

            <ReelRow show={step >= 2}>
              <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel-2 px-3 py-2">
                <Ban size={14} className="shrink-0 text-orange" aria-hidden />
                <span className="text-xs text-foreground">Added to suppression list</span>
                <span className="ml-auto text-2xs text-faint">permanent</span>
              </div>
            </ReelRow>
          </div>

          <div className="mt-auto">
            <ReelRow show={step >= 3}>
              <div className="flex items-center gap-2 rounded-lg border border-green/25 bg-green/8 px-3 py-2.5 text-sm">
                <ShieldCheck size={15} className="shrink-0 text-green" aria-hidden />
                <span className="font-medium text-foreground">Next send blocked</span>
                <span className="ml-auto text-xs text-faint">reputation protected</span>
              </div>
            </ReelRow>
          </div>
        </ReelStage>
      )}
    />
  );
}

/**
 * A webhook failing and recovering.
 *
 * Chosen deliberately over a webhook that simply succeeds. Anyone evaluating
 * this already assumes the happy path works; what they want to know is what
 * happens when their endpoint is down, because that is the case that loses
 * events with a lesser provider.
 */
export function WebhookReel() {
  return (
    <Reel
      label="A MessageSent event is posted to your endpoint. The first attempt fails with a 502, Posta retries after thirty seconds, and the second attempt succeeds with a 200. No event is lost."
      timings={[1100, 1100, 1200, 2600]}
      className="w-full"
      render={(step) => (
        <ReelStage className="flex h-[248px] flex-col gap-3 text-left">
          <div className="flex items-center gap-2.5 border-b border-line-soft pb-3">
            <KindTag>MessageSent</KindTag>
            <span className="truncate font-mono text-2xs text-muted">https://acme.com/hooks</span>
          </div>

          <div className="flex flex-col gap-2">
            <ReelRow show={step >= 1}>
              <div className="flex items-center gap-2.5 rounded-lg border border-red/25 bg-red/8 px-3 py-2">
                <span className="font-mono text-2xs text-red">attempt 1</span>
                <span className="text-xs text-foreground">502 Bad Gateway</span>
                <span className="ml-auto text-2xs text-faint">endpoint down</span>
              </div>
            </ReelRow>

            <ReelRow show={step >= 2}>
              <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel-2 px-3 py-2">
                <RotateCw size={14} className="shrink-0 text-amber" aria-hidden />
                <span className="text-xs text-foreground">Retrying in 30s</span>
                <span className="ml-auto text-2xs text-faint">backoff</span>
              </div>
            </ReelRow>
          </div>

          <div className="mt-auto">
            <ReelRow show={step >= 3}>
              <div className="flex items-center gap-2 rounded-lg border border-green/25 bg-green/8 px-3 py-2.5 text-sm">
                <span className="font-mono text-2xs text-green">attempt 2</span>
                <span className="font-medium text-foreground">200 OK</span>
                <span className="ml-auto text-xs text-faint">nothing lost</span>
              </div>
            </ReelRow>
          </div>
        </ReelStage>
      )}
    />
  );
}
