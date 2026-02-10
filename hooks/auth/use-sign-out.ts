/**
 * Shared Sign-Out Hook
 *
 * Encapsulates the 4-step sign-out flow with failure semantics:
 * 1. signOutAction() — soft fail (toast warning, continue)
 * 2. supabase.auth.signOut() — hard fail (error dialog with Retry / Local Cleanup)
 * 3. queryClient.clear() — soft fail (log, continue)
 * 4. router.push('/signin') — soft fail (fallback to window.location.href)
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS2
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { signOutAction } from '@/app/actions/auth/sign-out';
import {
  cleanupClientInstance,
  createBrowserComponentClient,
} from '@/lib/supabase/client';

type SignOutErrorState = {
  show: boolean;
  message: string;
};

/**
 * Hook for sign-out with soft/hard fail semantics.
 *
 * Returns `signOut` trigger, `isPending` for UI loading state,
 * and error dialog state for hard-fail handling.
 */
export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [errorState, setErrorState] = useState<SignOutErrorState>({
    show: false,
    message: '',
  });

  const performRedirect = useCallback(() => {
    try {
      router.push('/signin');
    } catch {
      // Soft fail: fallback to window.location
      setTimeout(() => {
        window.location.href = '/signin';
      }, 500);
    }
  }, [router]);

  const performLocalCleanup = useCallback(() => {
    const supabase = createBrowserComponentClient();
    // scope: 'local' clears cookies/storage only, no HTTP request
    supabase.auth.signOut({ scope: 'local' });
    cleanupClientInstance();
    queryClient.clear();
    setErrorState({ show: false, message: '' });
    // Redirect with flag for degraded sign-out banner
    try {
      router.push('/signin?local_cleanup=1');
    } catch {
      window.location.href = '/signin?local_cleanup=1';
    }
  }, [queryClient, router]);

  const signOut = useCallback(() => {
    startTransition(async () => {
      // Step 1: Server action — soft fail
      try {
        await signOutAction();
      } catch {
        toast.warning('Could not notify server of sign-out');
      }

      // Step 2: Client sign-out — hard fail
      try {
        const supabase = createBrowserComponentClient();
        const { error } = await supabase.auth.signOut();
        if (error) {
          setErrorState({
            show: true,
            message:
              error.message || 'Could not reach the authentication server.',
          });
          return; // Hard fail: do NOT proceed
        }
      } catch {
        setErrorState({
          show: true,
          message: 'Could not reach the authentication server.',
        });
        return; // Hard fail: do NOT proceed
      }

      // Step 3: Cache clear — soft fail
      try {
        queryClient.clear();
      } catch {
        // Soft fail: continue to redirect
      }

      // Step 4: Redirect — soft fail
      performRedirect();
    });
  }, [queryClient, performRedirect, startTransition]);

  const retrySignOut = useCallback(() => {
    setErrorState({ show: false, message: '' });
    signOut();
  }, [signOut]);

  return {
    signOut,
    isPending,
    errorState,
    retrySignOut,
    performLocalCleanup,
  };
}
