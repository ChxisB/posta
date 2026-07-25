'use client';

import { useState } from 'react';
import { Sidebar, MobileHeader } from './sidebar';

export default function OrgLayout({
  children,
  orgPermalink,
}: {
  children: React.ReactNode;
  orgPermalink?: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        orgPermalink={orgPermalink}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader orgPermalink={orgPermalink} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
