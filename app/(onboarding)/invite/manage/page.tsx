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
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Invite Staff</h1>
        <p className="mt-2 text-muted-foreground">
          Create invite links for your team members.
        </p>
      </div>
      <InviteForm />
      <InviteList />
    </div>
  );
}
