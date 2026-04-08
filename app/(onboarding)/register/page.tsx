import { redirect } from 'next/navigation';

import { RegisterForm } from '@/components/onboarding/register-form';
import { isDevAuthBypassEnabled } from '@/lib/supabase/dev-context';
import { createClient } from '@/lib/supabase/server';

export default async function RegisterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const devBypass = !user && isDevAuthBypassEnabled();

  if (!user && !devBypass) {
    redirect('/signin?redirect=/register');
  }

  // Skip registration check in dev bypass (no real user to query against)
  if (!devBypass) {
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
