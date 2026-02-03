/**
 * Gaming Day RPC Typed Wrappers
 *
 * Bridges local Database types with remote types that include the PRD-027 RPCs
 * (rpc_current_gaming_day, rpc_gaming_day_range). Once local types are regenerated
 * to include these RPCs, these wrappers can be removed.
 *
 * @see PRD-027 System Time & Gaming Day Standardization
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';
import type { Database as RemoteDatabase } from '@/types/remote/database.types';

/** Typed Supabase client with remote Database schema (includes PRD-027 RPCs) */
type RemoteClient = SupabaseClient<RemoteDatabase>;

/**
 * Bridge a local-typed Supabase client to one that knows about remote RPCs.
 * This is safe because the remote types are a superset of local types.
 */
function toRemoteClient(supabase: SupabaseClient<Database>): RemoteClient {
  return supabase as unknown as RemoteClient;
}

/** Call rpc_current_gaming_day with no timestamp (production use). */
export function callCurrentGamingDayRpc(supabase: SupabaseClient<Database>) {
  return toRemoteClient(supabase).rpc('rpc_current_gaming_day');
}

/** Call rpc_current_gaming_day with a specific timestamp (test use only). */
export function callCurrentGamingDayAtRpc(
  supabase: SupabaseClient<Database>,
  ts: string,
) {
  return toRemoteClient(supabase).rpc('rpc_current_gaming_day', {
    p_timestamp: ts,
  });
}

/** Call rpc_gaming_day_range to get start/end dates for a period. */
export function callGamingDayRangeRpc(
  supabase: SupabaseClient<Database>,
  weeks: number,
) {
  return toRemoteClient(supabase).rpc('rpc_gaming_day_range', {
    p_weeks: weeks,
  });
}
