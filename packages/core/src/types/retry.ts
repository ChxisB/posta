/**
 * Failure reason classification & Dead Letter Queue types.
 */

/** Categories for delivery/send failures */
export const FailureReason = {
  /** Message exceeded max delivery attempts */
  MaxAttemptsExceeded: 'max_attempts_exceeded',
  /** SMTP connection/response indicated permanent failure */
  HardFail: 'hard_fail',
  /** Temporary failure (SMTP 4xx, network, timeout) */
  SoftFail: 'soft_fail',
  /** Worker crashed or lost lock before completing */
  WorkerLost: 'worker_lost',
  /** Message timed out during processing */
  Timeout: 'timeout',
  /** Message TTL expired */
  TtlExpired: 'ttl_expired',
  /** Explicitly bounced */
  Bounced: 'bounced',
  /** Unknown/other */
  Unknown: 'unknown',
} as const;

export type FailureReasonType = (typeof FailureReason)[keyof typeof FailureReason];

/** Backoff strategy types */
export const BackoffStrategy = {
  FIXED: 'fixed',
  EXPONENTIAL: 'exponential',
  JITTER: 'jitter',
  FIBONACCI: 'fibonacci',
} as const;

export type BackoffStrategyType = (typeof BackoffStrategy)[keyof typeof BackoffStrategy];

/** Single attempt record */
export interface AttemptRecord {
  attempt: number;
  startedAt: number;
  failedAt: number;
  reason: FailureReasonType;
  error: string | null;
  duration: number;
}

/** DLQ entry */
export interface DeadLetterEntry {
  messageId: string | number;
  serverId: string | number;
  queueMessageId: string | number;
  enteredAt: number;
  reason: FailureReasonType;
  error: string | null;
  attempts: AttemptRecord[];
  retryCount: number;
  lastRetryAt: number | null;
  nextRetryAt: number | null;
  expiresAt: number | null;
}

/** Calculate backoff delay based on strategy */
export function calculateBackoff(
  strategy: BackoffStrategyType,
  attempt: number,
  baseDelay: number,
): number {
  switch (strategy) {
    case 'fixed':
      return baseDelay;

    case 'exponential':
      return baseDelay * Math.pow(2, attempt - 1);

    case 'jitter': {
      const exp = baseDelay * Math.pow(2, attempt - 1);
      return Math.floor(exp * (0.5 + Math.random()));
    }

    case 'fibonacci': {
      let a = 1, b = 1;
      for (let i = 0; i < attempt - 1; i++) {
        const next = a + b;
        a = b;
        b = next;
      }
      return baseDelay * b;
    }

    default:
      return baseDelay;
  }
}

/** Default max backoff cap: 1 hour */
export const MAX_BACKOFF_MS = 3_600_000;

/** Apply backoff with cap and optional config */
export function computeRetryDelay(
  strategy: BackoffStrategyType,
  attempt: number,
  baseDelay: number,
  maxDelay: number = MAX_BACKOFF_MS,
): number {
  return Math.min(calculateBackoff(strategy, attempt, baseDelay), maxDelay);
}
