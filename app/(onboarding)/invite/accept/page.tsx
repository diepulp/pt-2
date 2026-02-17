import { redirect } from 'next/navigation';

import { AcceptInviteHandler } from '@/components/onboarding/accept-invite-handler';
import { createClient } from '@/lib/supabase/server';

interface AcceptInvitePageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function AcceptInvitePage({
  searchParams,
}: AcceptInvitePageProps) {
  const params = await searchParams;
  const token = params.token;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const returnUrl = token
      ? `/invite/accept?token=${token}`
      : '/invite/accept';
    redirect(`/signin?redirect=${encodeURIComponent(returnUrl)}`);
  }

  if (!token) {
    return (
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold">Invalid Invite Link</h1>
        <p className="text-muted-foreground">
          This invite link is missing the token parameter.
        </p>
      </div>
    );
  }

  return <AcceptInviteHandler token={token} />;
}
