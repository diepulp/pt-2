import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export type AdminRole = 'admin' | 'pit_boss';

/**
 * Admin layout — role guard for admin and pit_boss only.
 *
 * NIT-004: Derives role from direct `staff` table lookup (NOT JWT claims
 * or session variables, which are unavailable during RSC rendering).
 *
 * Passes staff role to children via data attribute on wrapper div.
 * Child client components can read this via closest('[data-staff-role]').
 */
export default async function AdminLayout({
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

  // Direct DB lookup — authoritative role source (NIT-004)
  const { data: staff } = await supabase
    .from('staff')
    .select('role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  if (!staff || !['admin', 'pit_boss'].includes(staff.role)) {
    redirect('/dashboard');
  }

  return <div data-staff-role={staff.role}>{children}</div>;
}
