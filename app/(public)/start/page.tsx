import { randomUUID } from 'crypto';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { canonicalizeEmail, checkAllowlistGate } from '@/services/pilot/crud';

export const dynamic = 'force-dynamic';

const DEMO_CASINO_ID = 'ca000000-0000-0000-0000-000000000001';

export default async function StartGatewayPage() {
  const supabase = await createClient();

  // 1. Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  // 1b. Pilot allowlist gate (DEC-6): must be approved before staff-binding check
  const serviceClient = createServiceClient();
  const allowlistResult = await checkAllowlistGate(
    serviceClient,
    canonicalizeEmail(user.email!),
  );
  if (allowlistResult !== 'approved') {
    redirect('/request-access');
  }

  // 1c. Admin shortcut: pilot admins go straight to review surface
  const adminEmails = (process.env.PILOT_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.includes(canonicalizeEmail(user.email!))) {
    redirect('/pilot-review');
  }

  // 2. Check staff binding (existing active staff → operational runtime, unchanged)
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, status, casino_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (staffError) {
    // DB/RLS error — fail closed
    redirect('/signin?error=service_unavailable');
  }

  if (staff?.status === 'active') {
    redirect('/pit');
  }

  // 3. No active staff binding — idempotency check before creating demo binding
  const { data: existingDemo } = await serviceClient
    .from('staff')
    .select('id')
    .eq('casino_id', DEMO_CASINO_ID)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingDemo) {
    redirect('/pit');
  }

  // 4. Auto-create Casino 1 demo staff binding
  // first_name / last_name: email username + 'Demo' (no pilot_access_requests lookup in this slice)
  // rls-break-glass: service-role client — ADR-034 §170 explicitly excludes createServiceClient() writes expires:2099-01-01
  const emailUsername = canonicalizeEmail(user.email!).split('@')[0] ?? 'demo';
  const { error: insertError } = await serviceClient.from('staff').insert({
    casino_id: DEMO_CASINO_ID,
    role: 'pit_boss',
    employee_id: `DEMO-${randomUUID().substring(0, 6).toUpperCase()}`,
    user_id: user.id,
    email: canonicalizeEmail(user.email!),
    first_name: emailUsername,
    last_name: 'Demo',
  });

  if (insertError) {
    redirect('/signin?error=service_unavailable');
  }

  redirect('/pit');
}
