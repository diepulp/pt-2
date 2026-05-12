import { redirect } from 'next/navigation';

import { RegisterForm } from '@/components/onboarding/register-form';
import { isDevAuthBypassEnabled } from '@/lib/supabase/dev-context';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { canonicalizeEmail, checkAllowlistGate } from '@/services/pilot/crud';

export default async function RegisterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const devBypass = !user && isDevAuthBypassEnabled();

  if (!user && !devBypass) {
    redirect('/signin?redirect=/register');
  }

  // Skip allowlist + registration checks in dev bypass (no real user to query against)
  if (!devBypass) {
    // Pilot allowlist gate (DEC-6)
    const serviceClient = createServiceClient();
    const allowlistResult = await checkAllowlistGate(
      serviceClient,
      canonicalizeEmail(user!.email!),
    );
    if (allowlistResult !== 'approved') {
      redirect('/request-access');
    }

    // If user already has a pending registration, skip to bootstrap
    const { data: registration } = await supabase
      .from('onboarding_registration')
      .select('id')
      .eq('status', 'pending')
      .maybeSingle();

    if (registration) {
      redirect('/bootstrap');
    }
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1
          className="text-sm font-bold uppercase tracking-widest text-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          Register Your Company
        </h1>
        <p className="text-sm text-muted-foreground">
          Tell us about your company before setting up your first casino.
        </p>
      </div>
      <RegisterForm />
    </div>
  );
}
