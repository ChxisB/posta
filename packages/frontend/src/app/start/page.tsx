import { redirect } from 'next/navigation';
import { SignOutButton } from '@clerk/nextjs';
import { currentUser } from '@clerk/nextjs/server';
import { RotateCw } from 'lucide-react';
import { AuthIntro } from '@/components/auth/auth-intro';
import { Button, ButtonLink } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { ApiError, getMe, getOrganizations, type Me } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** An administrator with no organisations has just set up this installation. */
async function needsSetup(me: Me): Promise<boolean> {
  if (!me.admin) return false;
  try {
    return (await getOrganizations()).organizations.length === 0;
  } catch {
    // /organizations shows its own error for this, with a retry.
    return false;
  }
}

/**
 * Where every sign-in and sign-up lands. Asking the API who this is (/me) is
 * also what provisions the account: the first person becomes the
 * administrator, and anyone an administrator added is linked by email.
 *
 * The administrator of a fresh installation goes straight into the setup
 * wizard; everyone else goes to their organisations.
 */
export default async function StartPage() {
  let me: Me | null = null;
  let failure: unknown = null;
  try {
    me = (await getMe()).user;
  } catch (err) {
    failure = err;
  }

  // redirect() works by throwing, so it has to stay outside the try above.
  if (me) {
    redirect((await needsSetup(me)) ? '/organizations/setup?welcome=1' : '/organizations');
  }

  if (failure instanceof ApiError && failure.code === 'NotProvisioned') {
    const email = (await currentUser())?.primaryEmailAddress?.emailAddress;
    return (
      <div className="w-full max-w-md py-8">
        <AuthIntro eyebrow="Signed in" title="You don't have access yet">
          {email ? (
            <>
              You&apos;re signed in as{' '}
              <strong className="font-semibold text-foreground">{email}</strong>, but nobody has
              added that address to this Posta installation.
            </>
          ) : (
            <>You&apos;re signed in, but nobody has added you to this Posta installation.</>
          )}{' '}
          Ask an administrator to add it under Administration → Users, then sign in again.
        </AuthIntro>
        <div className="flex justify-center">
          <SignOutButton redirectUrl="/">
            <Button variant="secondary">Sign out</Button>
          </SignOutButton>
        </div>
      </div>
    );
  }

  // Signed in as far as Clerk is concerned (the middleware let us through),
  // yet the API refused the token. Sending them back to /login would loop.
  if (failure instanceof ApiError && failure.status === 401) {
    return (
      <div className="w-full max-w-md py-8">
        <AuthIntro title="The API didn't accept your session">
          You&apos;re signed in, but Posta&apos;s API rejected the session. This usually means the
          web-server&apos;s CLERK_SECRET_KEY belongs to a different Clerk application from
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.
        </AuthIntro>
        <div className="flex justify-center gap-2">
          <ButtonLink href="/start" variant="secondary">
            <RotateCw size={14} aria-hidden /> Try again
          </ButtonLink>
          <SignOutButton redirectUrl="/">
            <Button variant="ghost">Sign out</Button>
          </SignOutButton>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md py-8">
      <AuthIntro title="Couldn't finish signing in" />
      <div className="rounded-2xl border border-line bg-panel shadow-elev-sm">
        <ErrorState error={failure} what="your account" retryHref="/start" />
      </div>
    </div>
  );
}
