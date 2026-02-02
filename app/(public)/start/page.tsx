import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function StartGatewayPage() {
  const supabase = await createClient();

  // 1. Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  // 2. Check staff binding
  const { data: staff } = await supabase
    .from('staff')
    .select('id, status, casino_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!staff) {
    // No staff row — needs bootstrap
    redirect('/bootstrap');
  }

  if (staff.status !== 'active') {
    // Staff exists but inactive
    redirect('/signin?error=inactive');
  }

  // 3. Check casino setup status
  const { data: settings } = await supabase
    .from('casino_settings')
    .select('setup_status')
    .eq('casino_id', staff.casino_id)
    .maybeSingle();

  if (!settings) {
    // Defensive: no settings row
    redirect('/setup');
  }

  if (settings.setup_status !== 'ready') {
    redirect('/setup');
  }

  // 4. All checks passed — go to app
  redirect('/pit');
}
