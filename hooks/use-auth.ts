/**
 * Auth Hook
 *
 * Client-side hook to access authenticated user and staff claims.
 * Reads staff_id and other RLS claims from JWT app_metadata.
 *
 * @see lib/supabase/auth-admin.ts for claim structure
 * @see ADR-015 for RLS context strategy
 */

"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { createBrowserComponentClient } from "@/lib/supabase/client";
import {
  DEV_RLS_CONTEXT,
  isDevAuthBypassEnabled,
} from "@/lib/supabase/dev-context";

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

/**
 * Hook to access authenticated user and staff claims.
 *
 * Returns staff_id from JWT app_metadata for use in mutations.
 * In development mode, returns mock staff_id if no user is authenticated.
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
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserComponentClient();

    // Get initial user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
