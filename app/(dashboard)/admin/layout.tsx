import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

const ADMIN_ROLES = new Set(['admin', 'pit_boss']);

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

  // Canonical auth mapping (Option B): staff.user_id = auth.user.id
  const { data: staff } = await supabase
    .from('staff')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!staff || !ADMIN_ROLES.has(staff.role)) {
    redirect('/shift-dashboard?toast=admin_required');
  }

  return <>{children}</>;
}
