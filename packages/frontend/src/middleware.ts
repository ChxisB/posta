import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Routes that don't require authentication.
//
// "/" is the public marketing site (app/page.tsx). It has to be listed
// explicitly: it used to be a redirect into /organizations, so protecting it
// was harmless, but now it is the page a signed-out visitor is meant to land
// on and auth.protect() would bounce them straight to sign-in.
const isPublicRoute = createRouteMatcher([
  '/',
  '/login(.*)',
  '/sign-up(.*)',
  '/api/clerk(.*)',
  '/_next(.*)',
]);

export default clerkMiddleware(
  async (auth, request) => {
    if (!isPublicRoute(request)) {
      await auth.protect();
    }
  },
  // Where auth.protect() sends a signed-out visitor. Matches ClerkProvider
  // in app/layout.tsx.
  { signInUrl: '/login', signUpUrl: '/sign-up' },
);

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
