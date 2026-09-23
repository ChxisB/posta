import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Routes that don't require authentication.
//
// "/" is the first-run setup screen (app/page.tsx). It has to be public: on a
// fresh installation nobody can sign in yet, and once an administrator exists
// the page forwards signed-out visitors to /login itself.
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
