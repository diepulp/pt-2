'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { createBrowserComponentClient } from '@/lib/supabase/client';

export function LogoutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const logout = async () => {
    const supabase = createBrowserComponentClient();
    await supabase.auth.signOut();
    queryClient.clear();
    router.push('/signin');
  };

  return <Button onClick={logout}>Logout</Button>;
}
