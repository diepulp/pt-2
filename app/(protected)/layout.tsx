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

  // Main sidebar collapsed width: 56px (3.5rem / w-14)
  // Header height: 64px (4rem / h-16)
  return (
    <div className="min-h-screen w-full bg-background">
      {/* Fixed header bar - stays at top of viewport */}
      <header className="fixed top-0 left-0 right-0 z-50 flex h-16 bg-background border-b">
        {/* Logo placeholder - matches collapsed sidebar width */}
        <div className="flex h-16 w-14 shrink-0 items-center justify-center gap-1.5 bg-background">
          <div className="w-2 h-2 rounded-full bg-red-500/60" />
          <div className="w-2 h-2 rounded-full bg-amber-500/60" />
          <div className="w-2 h-2 rounded-full bg-emerald-500/60" />
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
