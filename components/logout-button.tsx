'use client';

import { Button } from '@/components/ui/button';
import { useSignOut } from '@/hooks/auth/use-sign-out';

export function LogoutButton() {
  const { signOut, isPending } = useSignOut();

  return (
    <Button onClick={signOut} disabled={isPending}>
      {isPending ? 'Signing out...' : 'Logout'}
    </Button>
  );
}
