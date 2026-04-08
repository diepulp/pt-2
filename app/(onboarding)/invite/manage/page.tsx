import { redirect } from 'next/navigation';

import { InviteForm } from '@/components/onboarding/invite-form';
import { InviteList } from '@/components/onboarding/invite-list';
import { createClient } from '@/lib/supabase/server';

export default async function InviteManagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin?redirect=/invite/manage');
  }

  const staffRole = user.app_metadata?.staff_role;
  if (staffRole !== 'admin') {
    redirect('/start');
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1
          className="text-sm font-bold uppercase tracking-widest text-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          Invite Staff
        </h1>
        <p className="text-sm text-muted-foreground">
          Create invite links for your team members.
        </p>
      </div>
      <InviteForm />
      <InviteList />
    </div>
  );
}
