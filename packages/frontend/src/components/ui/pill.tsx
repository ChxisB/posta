import { cn } from '@/lib/utils';

const PILL_BASE =
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-2xs font-semibold tracking-wide uppercase';

/**
 * Delivery states, straight from DELIVERY_WEBHOOK_EVENTS in
 * packages/message-db/src/delivery.ts. Keep this union in step with that
 * map: a status the backend can emit but this cannot colour falls through
 * to the neutral style, which reads as "nothing happened yet" and is wrong
 * for a failure.
 */
export type MessageStatus = 'Pending' | 'Sent' | 'SoftFail' | 'HardFail' | 'Held' | 'Bounced';

/**
 * The colour carries the operator's question: is this mail still moving, has
 * it landed, or does it need me? Amber is deliberately *not* a failure,
 * SoftFail is a retry in progress and resolves on its own; orange marks the
 * states that sit waiting for a human.
 */
const STATUS_CLASS: Record<MessageStatus, string> = {
  Pending: 'border-sky/25 bg-sky/10 text-sky',
  Sent: 'border-green/30 bg-green/10 text-green',
  SoftFail: 'border-amber/30 bg-amber/10 text-amber',
  Held: 'border-orange/30 bg-orange/10 text-orange',
  HardFail: 'border-red/30 bg-red/12 text-red',
  Bounced: 'border-red/30 bg-red/12 text-red',
};

const STATUS_LABEL: Record<MessageStatus, string> = {
  Pending: 'Queued',
  Sent: 'Delivered',
  SoftFail: 'Retrying',
  Held: 'Held',
  HardFail: 'Failed',
  Bounced: 'Bounced',
};

const NEUTRAL = 'border-line bg-panel-2 text-muted';

/**
 * `Pending` and `SoftFail` both mean "still in flight", so they get the live
 * dot; every other state is settled.
 */
export function MessageStatusPill({ status }: { status: string }) {
  const known = status in STATUS_CLASS ? (status as MessageStatus) : null;
  const inFlight = known === 'Pending' || known === 'SoftFail';

  return (
    <span className={cn(PILL_BASE, known ? STATUS_CLASS[known] : NEUTRAL)}>
      {inFlight && (
        <span aria-hidden className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current" />
      )}
      {known ? STATUS_LABEL[known] : status}
    </span>
  );
}

/**
 * DNS and authentication checks (SPF, DKIM, MX, return path). The API
 * reports "OK" for a pass and a variety of strings for the rest, so anything
 * that is not OK is treated as a problem rather than enumerated.
 */
export function CheckPill({
  status,
  missingLabel = 'Missing',
}: {
  status?: string | null;
  missingLabel?: string;
}) {
  if (!status) return <span className={cn(PILL_BASE, NEUTRAL)}>{missingLabel}</span>;
  const ok = status === 'OK';
  return (
    <span className={cn(PILL_BASE, ok ? STATUS_CLASS.Sent : 'border-red/30 bg-red/12 text-red')}>
      {ok ? 'OK' : status}
    </span>
  );
}

/**
 * A boolean flag rendered as a pill: enabled/disabled, verified/unverified.
 *
 * `tone` exists because the two are not the same question. A disabled
 * webhook is a fact (neutral); an unverified domain is a problem (bad). The
 * old `.tag-green`/`.tag-red` pair forced every flag into pass/fail and made
 * ordinary "off" switches look broken.
 */
export function FlagPill({
  on,
  onLabel = 'Yes',
  offLabel = 'No',
  tone = 'neutral',
}: {
  on: boolean;
  onLabel?: string;
  offLabel?: string;
  /** "neutral": off is simply off. "bad": off is a problem worth fixing. */
  tone?: 'neutral' | 'bad';
}) {
  const offClass = tone === 'bad' ? 'border-amber/30 bg-amber/10 text-amber' : NEUTRAL;
  return (
    <span className={cn(PILL_BASE, on ? STATUS_CLASS.Sent : offClass)}>
      {on ? onLabel : offLabel}
    </span>
  );
}

/** Monospace tag for identifiers, ports and hostnames. */
export function KindTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-2xs text-muted">
      {children}
    </span>
  );
}
