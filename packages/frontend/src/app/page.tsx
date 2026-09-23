import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { ArrowRight, Circle, CircleCheck, CircleX, RotateCw, ShieldAlert } from 'lucide-react';
import { AuthIntro } from '@/components/auth/auth-intro';
import { AuthSplit } from '@/components/auth/auth-split';
import { SetupSteps, SetupStepsCompact } from '@/components/setup/setup-steps';
import { ButtonLink } from '@/components/ui/button';
import { API_BASE, ApiError, getSetupStatus } from '@/lib/api';
import { cn } from '@/lib/utils';

// Whether this installation has an administrator changes the moment someone
// signs up, and the checks are only useful if they are live.
export const dynamic = 'force-dynamic';

type SetupStatus =
  | { kind: 'ok'; adminExists: boolean }
  /** The API answered but couldn't read its database. */
  | { kind: 'error'; status: number }
  | { kind: 'unreachable' };

async function readSetupStatus(): Promise<SetupStatus> {
  try {
    return { kind: 'ok', adminExists: (await getSetupStatus()).admin_exists };
  } catch (err) {
    // /setup/status is one query against the users table, so an error
    // response from it is, in practice, the database.
    return err instanceof ApiError ? { kind: 'error', status: err.status } : { kind: 'unreachable' };
  }
}

type CheckState = 'ok' | 'fail' | 'next' | 'waiting';

interface Check {
  label: string;
  state: CheckState;
  detail: React.ReactNode;
}

function buildChecks(status: SetupStatus, clerkKeysSet: boolean): Check[] {
  const apiUp = status.kind !== 'unreachable';
  const dbUp = status.kind === 'ok';

  return [
    {
      label: 'Posta API',
      state: apiUp ? 'ok' : 'fail',
      detail: apiUp ? (
        <>
          Reachable at <Code>{API_BASE}</Code>
        </>
      ) : (
        <>
          No response from <Code>{API_BASE}</Code>. Start it with <Code>bun run start</Code>, and
          check that <Code>NEXT_PUBLIC_API_URL</Code> points at it.
        </>
      ),
    },
    {
      label: 'Database',
      state: dbUp ? 'ok' : apiUp ? 'fail' : 'waiting',
      detail: dbUp ? (
        'Connected'
      ) : status.kind === 'error' ? (
        <>
          The API couldn&apos;t read it (HTTP {status.status}). Check{' '}
          <Code>POSTA_MAIN_DB_URL</Code> and the web-server&apos;s log.
        </>
      ) : (
        'Checked once the API responds'
      ),
    },
    {
      label: 'Sign-in',
      state: clerkKeysSet ? 'ok' : 'fail',
      detail: clerkKeysSet ? (
        'Clerk keys are set'
      ) : (
        <>
          Set <Code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</Code> and <Code>CLERK_SECRET_KEY</Code> in{' '}
          <Code>.env</Code>, from dashboard.clerk.com. Without them the API can&apos;t verify
          anyone who signs in.
        </>
      ),
    },
    {
      label: 'Admin account',
      state: dbUp && clerkKeysSet ? 'next' : 'waiting',
      detail:
        dbUp && clerkKeysSet
          ? 'Not created yet. The first account becomes the administrator.'
          : 'Created once the checks above pass',
    },
  ];
}

/**
 * The front door of an installation ("/"). Posta's public site lives in its
 * own repository now; an installation serves no marketing page.
 *
 * On a fresh installation this is the setup screen: it checks that the
 * pieces a sign-up depends on are in place, then sends the visitor to create
 * the admin account, and /start takes them into the setup wizard. Once an
 * administrator exists there is nothing to set up, so it forwards to sign-in,
 * or to /start for someone already signed in.
 */
export default async function SetupPage() {
  const { userId } = await auth();
  if (userId) redirect('/start');

  const status = await readSetupStatus();
  if (status.kind === 'ok' && status.adminExists) redirect('/login');

  // Clerk's keyless development mode lets the dashboard sign people in
  // without these, but the web-server then has no key to verify them with.
  const clerkKeysSet = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
  const checks = buildChecks(status, clerkKeysSet);
  const ready = !checks.some((check) => check.state === 'fail');

  return (
    <AuthSplit aside={<SetupSteps />}>
      <AuthIntro eyebrow="First-time setup" title="Set up Posta" align="start">
        {ready
          ? 'Everything is in place. Create the admin account to claim this installation. After that, only people an administrator adds can sign in.'
          : "A few things need fixing before this installation can be claimed. Fix what's marked below, then check again."}
      </AuthIntro>

      <SetupStepsCompact className="mb-6" />

      <ol
        aria-label="Installation checks"
        className="mb-6 divide-y divide-line-soft rounded-xl border border-line bg-panel shadow-elev-sm"
      >
        {checks.map((check) => (
          <CheckRow key={check.label} check={check} />
        ))}
      </ol>

      {ready ? (
        <>
          <ButtonLink href="/sign-up" variant="primary" size="lg" className="w-full">
            Create the admin account <ArrowRight size={16} aria-hidden />
          </ButtonLink>
          <p className="mt-4 flex gap-2 text-xs leading-relaxed text-faint">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
            Until this account exists, anyone who can open this page can claim the installation.
            Create it before Posta is reachable from the internet.
          </p>
        </>
      ) : (
        <ButtonLink href="/" size="lg" className="w-full">
          <RotateCw size={15} aria-hidden /> Check again
        </ButtonLink>
      )}
    </AuthSplit>
  );
}

const STATE: Record<CheckState, { icon: typeof Circle; className: string; label: string }> = {
  ok: { icon: CircleCheck, className: 'text-green', label: 'Passed' },
  fail: { icon: CircleX, className: 'text-red', label: 'Needs attention' },
  next: { icon: Circle, className: 'text-accent', label: 'Next step' },
  waiting: { icon: Circle, className: 'text-faint', label: 'Waiting' },
};

function CheckRow({ check }: { check: Check }) {
  const { icon: Icon, className, label } = STATE[check.state];

  return (
    <li className="flex gap-3 px-4 py-3.5">
      <Icon size={18} strokeWidth={2.25} className={cn('mt-0.5 shrink-0', className)} aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {check.label}
          <span className="sr-only">: {label}</span>
        </p>
        <p className="mt-0.5 text-sm leading-relaxed break-words text-muted">{check.detail}</p>
      </div>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  );
}
