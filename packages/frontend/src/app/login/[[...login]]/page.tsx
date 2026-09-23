import { SignIn } from '@clerk/nextjs';
import { AuthIntro } from '@/components/auth/auth-intro';
import { clerkAppearance } from '@/components/auth/clerk-appearance';
import { ButtonLink } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { isFirstRun } from '@/lib/api';

// Whether the installation has an administrator changes the moment someone
// signs up, so this can't be rendered once at build time.
export const dynamic = 'force-dynamic';

/**
 * Catch-all so Clerk can route its own sub-steps (factor-one, SSO callback)
 * under /login without a 404.
 */
export default async function LoginPage() {
  const firstRun = await isFirstRun();

  return (
    <div className="w-full max-w-md py-8">
      <AuthIntro title="Sign in to Posta" />

      {/* Someone arriving here on a fresh installation has no account to
          sign in with. Without this they would try, fail, and have no idea
          that creating one is what makes them the administrator. */}
      {firstRun && (
        <Callout
          title="This installation has no administrator yet"
          action={
            <ButtonLink href="/sign-up" size="sm">
              Create admin account
            </ButtonLink>
          }
          className="mb-6"
        >
          The first account created becomes the administrator.
        </Callout>
      )}

      <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/start" appearance={clerkAppearance} />
    </div>
  );
}
