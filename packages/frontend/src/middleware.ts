import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/login(.*)',
  '/sign-up(.*)',
  '/api/clerk(.*)',
  '/_next(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
