import { SignUp } from '@clerk/nextjs';
import { AuthIntro } from '@/components/auth/auth-intro';
import { AuthSplit } from '@/components/auth/auth-split';
import { clerkAppearance } from '@/components/auth/clerk-appearance';
import { SetupSteps, SetupStepsCompact } from '@/components/setup/setup-steps';
import { Callout } from '@/components/ui/callout';
import { isFirstRun } from '@/lib/api';

export const dynamic = 'force-dynamic';

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
    <AuthSplit aside={firstRun ? <SetupSteps /> : undefined}>
      {firstRun ? (
        <AuthIntro eyebrow="First-time setup" title="Create the admin account" align="start">
          You&apos;re the first person here, so this account becomes the administrator. The setup
          wizard starts straight after.
        </AuthIntro>
      ) : (
        <AuthIntro title="Create your account" align="start">
          Use the email address an administrator added you under. Posta only lets in people who have
          been added.
        </AuthIntro>
      )}

      {/* The steps live in the side panel from `lg` up; below that the panel
          is hidden, so a compact copy sits above the form instead. */}
      {firstRun && <SetupStepsCompact className="mb-6" />}

      {firstRun === null && (
        <Callout tone="warning" title="Can't reach the Posta API" className="mb-6">
          This page couldn&apos;t check whether this installation already has an administrator. You
          can still create an account, but check that the web-server is running and that
          NEXT_PUBLIC_API_URL points at it.
        </Callout>
      )}

      <SignUp signInUrl="/login" forceRedirectUrl="/start" appearance={clerkAppearance} />
    </AuthSplit>
  );
}
