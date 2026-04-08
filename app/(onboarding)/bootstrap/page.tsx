import { redirect } from 'next/navigation';

import { BootstrapForm } from '@/components/onboarding/bootstrap-form';
import { isDevAuthBypassEnabled } from '@/lib/supabase/dev-context';
import { createClient } from '@/lib/supabase/server';

export default async function BootstrapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const devBypass = !user && isDevAuthBypassEnabled();

  if (!user && !devBypass) {
    redirect('/signin?redirect=/bootstrap');
  }

  // Skip redirect checks in dev bypass (no real user/claims to evaluate)
  if (!devBypass) {
    // If user already has a staff binding (casino_id in claims), send to gateway
    const casinoId = user!.app_metadata?.casino_id;
    if (casinoId) {
      redirect('/start');
    }

    // PRD-060: Require pending registration before bootstrap
    const { data: registration } = await supabase
      .from('onboarding_registration')
      .select('id')
      .eq('status', 'pending')
      .maybeSingle();

    if (!registration) {
      redirect('/register');
    }
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1
          className="text-sm font-bold uppercase tracking-widest text-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          Create Your Casino Workspace
        </h1>
        <p className="text-sm text-muted-foreground">
          Set up your casino to start managing players and tables.
        </p>
      </div>
      <BootstrapForm />
    </div>
  );
}
