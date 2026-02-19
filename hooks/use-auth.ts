/**
 * Auth Hook
 *
 * Client-side hook to access authenticated user and staff claims.
 * Reads staff_id and other RLS claims from JWT app_metadata.
 *
 * Uses TanStack Query internally for dedup/caching across multiple consumers.
 * Auth state changes are propagated via query cache invalidation.
 *
 * @see lib/supabase/auth-admin.ts for claim structure
 * @see ADR-015 for RLS context strategy
 * @see PERF-006 WS5 — TanStack Query dedup for auth
 */

'use client';

import type { User } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import {
  DEV_RLS_CONTEXT,
  isDevAuthBypassEnabled,
} from '@/lib/supabase/dev-context';
import { resetSessionState } from '@/store/reset-session-state';

interface StaffClaims {
  staff_id: string;
  casino_id: string;
  staff_role: string;
}

interface UseAuthResult {
  user: User | null;
  staffId: string | null;
  casinoId: string | null;
  staffRole: string | null;
  isLoading: boolean;
}

/** Stable query key for auth user data */
const AUTH_QUERY_KEY = ['auth', 'user'] as const;

/**
 * Fetch the current authenticated user from Supabase.
 * Pure function used as TanStack Query queryFn.
 */
async function fetchAuthUser(): Promise<User | null> {
  const supabase = createBrowserComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Hook to access authenticated user and staff claims.
 *
 * Returns staff_id from JWT app_metadata for use in mutations.
 * In development mode, returns mock staff_id if no user is authenticated.
 *
 * Multiple consumers share a single cached result via TanStack Query.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { staffId, isLoading } = useAuth();
 *
 *   if (isLoading) return <Spinner />;
 *   if (!staffId) return <LoginPrompt />;
 *
 *   return <div>Staff ID: {staffId}</div>;
 * }
 * ```
 */
export function useAuth(): UseAuthResult {
  const queryClient = useQueryClient();

  const { data: user = null, isLoading } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchAuthUser,
    staleTime: 1000 * 60 * 5, // 5 min — auth doesn't change often
    refetchOnWindowFocus: false,
  });

  // Subscribe to auth state changes and update query cache
  useEffect(() => {
    const supabase = createBrowserComponentClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, session?.user ?? null);

      // ADR-035 INV-035-2: Reset Zustand on server-side session invalidation
      if (event === 'SIGNED_OUT') {
        resetSessionState();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);

  // Extract staff claims from app_metadata
  const appMetadata = user?.app_metadata as StaffClaims | undefined;

  // Dev mode fallback: Return mock staff context when not authenticated
  // This aligns client-side auth with server-side DEV_RLS_CONTEXT
  if (!user && !isLoading && isDevAuthBypassEnabled()) {
    return {
      user: null,
      staffId: DEV_RLS_CONTEXT.actorId,
      casinoId: DEV_RLS_CONTEXT.casinoId,
      staffRole: DEV_RLS_CONTEXT.staffRole,
      isLoading: false,
    };
  }

  return {
    user,
    staffId: appMetadata?.staff_id ?? null,
    casinoId: appMetadata?.casino_id ?? null,
    staffRole: appMetadata?.staff_role ?? null,
    isLoading,
  };
}
