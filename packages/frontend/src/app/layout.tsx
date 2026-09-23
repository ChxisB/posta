import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/components/theme-provider';
import { AppShell } from '@/components/shell/app-shell';
import { cn } from '@/lib/utils';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Posta',
  description: 'Open source mail delivery platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn(geist.variable, geistMono.variable)}>
      <head>
        {/* Blocking, and before anything paints: sets data-theme so the first
            frame is already in the right palette. See THEME_INIT_SCRIPT. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans">
        {/* Set here rather than left to NEXT_PUBLIC_CLERK_* so a stale .env
            can't send "Create account" to the sign-in page. */}
        <ClerkProvider signInUrl="/login" signUpUrl="/sign-up">
          <ThemeProvider>
            {/* The shell is chosen by route rather than opted into by each
                page. Previously every one of the 30-odd pages wrapped itself
                in <>, so a new page shipped without navigation
                unless its author remembered. */}
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
