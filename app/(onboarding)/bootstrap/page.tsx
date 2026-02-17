import { redirect } from 'next/navigation';

import { BootstrapForm } from '@/components/onboarding/bootstrap-form';
import { createClient } from '@/lib/supabase/server';

export default async function BootstrapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin?redirect=/bootstrap');
  }

  // If user already has a staff binding (casino_id in claims), send to gateway
  const casinoId = user.app_metadata?.casino_id;
  if (casinoId) {
    redirect('/start');
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Create Your Casino Workspace</h1>
        <p className="mt-2 text-muted-foreground">
          Set up your casino to start managing players and tables.
        </p>
      </div>
      <BootstrapForm />
    </div>
  );
}
