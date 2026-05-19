/**
 * Protected Routes Layout
 *
 * Layout for authenticated routes including shift dashboard.
 * Shares structure with main dashboard layout.
 */

import { redirect } from 'next/navigation';

import { AppSidebar } from '@/components/layout/app-sidebar';
import { Header } from '@/components/layout/header';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { canonicalizeEmail, checkAllowlistGate } from '@/services/pilot/crud';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  // Pilot allowlist gate (DEC-6): fail-closed; unapproved users go to request-access
  const serviceClient = createServiceClient();
  const allowlistResult = await checkAllowlistGate(
    serviceClient,
    canonicalizeEmail(user.email!),
  );
  if (allowlistResult !== 'approved') {
    redirect('/request-access');
  }

  // Main sidebar collapsed width: 56px (3.5rem / w-14)
  // Header height: 64px (4rem / h-16)
  return (
    <div className="min-h-screen w-full bg-background">
      {/* Fixed header bar - stays at top of viewport */}
      <header className="fixed top-0 left-0 right-0 z-50 flex h-16 bg-background border-b">
        {/* Brand mark - matches collapsed sidebar width */}
        <div className="flex h-16 w-14 shrink-0 items-center justify-center border-r border-border">
          <div className="flex flex-col items-center">
            <span
              className="text-sm tracking-wide text-accent/80"
              style={{ fontFamily: 'var(--font-michroma)' }}
            >
              d3lt
            </span>
            <div className="h-px w-8 bg-gradient-to-r from-transparent via-accent/25 to-transparent" />
          </div>
        </div>
        <div className="flex-1">
          <Header />
        </div>
      </header>
      <AppSidebar />
      {/* Main content: offset by header height (top) and sidebar width (left) */}
      <main className="pt-16 pl-14 min-h-screen">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
