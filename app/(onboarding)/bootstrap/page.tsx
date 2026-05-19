import { redirect } from 'next/navigation';

import { BootstrapForm } from '@/components/onboarding/bootstrap-form';
import { DomainError } from '@/lib/errors/domain-errors';
import { requireApprovedPilotSession } from '@/lib/server-actions/guards/require-approved-pilot-session';
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

  // Skip guards in dev bypass (no real user/claims to evaluate)
  if (!devBypass) {
    // Guard: approved session + provisioning authorization (admin-only in this pilot slice)
    // Approved non-admin users redirect to /demo (defense-in-depth containment, PRD-084)
    try {
      await requireApprovedPilotSession(supabase, {
        requireProvisioningAuth: true,
      });
    } catch (err) {
      if (err instanceof DomainError) {
        if (err.code === 'FORBIDDEN') redirect('/demo');
        redirect('/signin?redirect=/bootstrap');
      }
      redirect('/signin?redirect=/bootstrap');
    }

    // Only reached by allowlisted pilot admins with provisioning authorization
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
      <div className="space-y-2 text-center">
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
