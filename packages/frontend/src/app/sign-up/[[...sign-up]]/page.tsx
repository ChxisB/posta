import { SignUp } from '@clerk/nextjs';
import { AuthIntro } from '@/components/auth/auth-intro';
import { clerkAppearance } from '@/components/auth/clerk-appearance';
import { Callout } from '@/components/ui/callout';
import { isFirstRun } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Mirrors the required steps of the setup wizard (organizations/setup).
const SETUP_STEPS = [
  'Name your organisation',
  'Create a mail server',
  'Add your sending domain',
  'Publish its DNS records',
  'Get SMTP or API credentials',
];

/**
 * Account creation. On a fresh installation this is where the administrator
 * account is made: the API promotes the first account it sees (see
 * web-server middleware/current-user.ts), and /start then sends them into
 * the setup wizard.
 *
 * Every sign-up lands on /start, whatever Clerk's dashboard redirect says, so
 * that decision stays in one place.
 */
export default async function SignUpPage() {
  const firstRun = await isFirstRun();

  return (
    <div className="w-full max-w-md py-8">
      {firstRun ? (
        <AuthIntro eyebrow="First-time setup" title="Create the admin account">
          You&apos;re the first person here, so this account becomes the administrator. Straight
          after, a short setup wizard gets you sending:
        </AuthIntro>
      ) : (
        <AuthIntro title="Create your account">
          Use the email address an administrator added you under. Posta only lets in people who
          have been added.
        </AuthIntro>
      )}

      {firstRun && (
        <ol className="mx-auto mb-6 grid max-w-sm gap-2 text-sm text-muted">
          {SETUP_STEPS.map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      )}

      {firstRun === null && (
        <Callout tone="warning" title="Can't reach the Posta API" className="mb-6">
          This page couldn&apos;t check whether this installation already has an administrator.
          You can still create an account, but check that the web-server is running and that
          NEXT_PUBLIC_API_URL points at it.
        </Callout>
      )}

      <SignUp signInUrl="/login" forceRedirectUrl="/start" appearance={clerkAppearance} />
    </div>
  );
}
