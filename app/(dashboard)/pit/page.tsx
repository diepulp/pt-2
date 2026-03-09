/**
 * Pit Dashboard Page
 *
 * Main operational interface for pit bosses to manage gaming tables,
 * active rating slips, and player sessions.
 *
 * Pattern: Server Component with RSC prefetch + HydrationBoundary.
 * Auth guard executes before any prefetch call.
 * Per-request QueryClient prevents cross-request state bleed.
 *
 * DEV MODE: When NODE_ENV=development, uses DEV_RLS_CONTEXT.casinoId
 * if auth fails. Under dev auth bypass, RSC prefetch calls fail silently
 * (unauthenticated supabase client cannot invoke set_rls_context_from_staff).
 * Client hooks refetch on mount — this is expected behavior.
 *
 * @see PRD-006 Pit Dashboard UI
 * @see PRD-048 Pit Dashboard RSC Refactor (WS2)
 */

import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import { redirect } from 'next/navigation';

import { PitPanelsDashboardLayout } from '@/components/pit-panels';
import {
  fetchDashboardTables,
  fetchDashboardStats,
  fetchGamingDayServer,
} from '@/hooks/dashboard/http';
import { dashboardKeys } from '@/hooks/dashboard/keys';
import {
  DEV_RLS_CONTEXT,
  isDevAuthBypassEnabled,
} from '@/lib/supabase/dev-context';
import { getAuthContext } from '@/lib/supabase/rls-context';
import { createClient } from '@/lib/supabase/server';
import { casinoKeys } from '@/services/casino/keys';

export const dynamic = 'force-dynamic';

export default async function PitPage() {
  let casinoId: string;

  // Auth guard — executes before any prefetch call
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const context = await getAuthContext(supabase);
    casinoId = context.casinoId;
  } else if (isDevAuthBypassEnabled()) {
    casinoId = DEV_RLS_CONTEXT.casinoId;
  } else {
    redirect('/signin');
  }

  // Per-request QueryClient — prevents cross-request/cross-casino cache contamination
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
    },
  });

  // Prefetch 3 primary queries in parallel.
  // Promise.allSettled prevents single failure from blocking page —
  // client hooks will refetch on mount for any failed query.
  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: dashboardKeys.tables(casinoId),
      queryFn: () => fetchDashboardTables(supabase),
    }),
    queryClient.prefetchQuery({
      queryKey: dashboardKeys.stats(casinoId),
      queryFn: () => fetchDashboardStats(supabase),
    }),
    queryClient.prefetchQuery({
      queryKey: casinoKeys.gamingDay(),
      queryFn: () => fetchGamingDayServer(supabase),
    }),
  ]);

  // Height: viewport - header (4rem) - main padding (3rem = p-6 top + bottom)
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="h-[calc(100vh-7rem)] overflow-hidden">
        <PitPanelsDashboardLayout casinoId={casinoId} />
      </div>
    </HydrationBoundary>
  );
}
