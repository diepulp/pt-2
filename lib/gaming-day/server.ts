/**
 * Server-side Gaming Day Helpers
 *
 * Canonical helpers for resolving gaming day in RSC pages and server contexts.
 * All gaming day computation goes through the database via rpc_current_gaming_day().
 *
 * @see TEMP-002 Temporal Authority Pattern
 * @see PRD-027 System Time & Gaming Day Standardization
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  callCurrentGamingDayAtRpc,
  callCurrentGamingDayRpc,
} from '@/lib/gaming-day/rpc';
import type { Database } from '@/types/database.types';

/**
 * Get the current gaming day from the database.
 *
 * Production API — no timestamp parameter. The RPC derives the current gaming day
 * from `now()` using the casino's timezone and gaming_day_start_time via RLS context.
 *
 * @param supabase - Authenticated Supabase client with RLS context
 * @returns ISO date string (YYYY-MM-DD)
 * @throws DomainError on RPC failure
 */
export async function getServerGamingDay(
  supabase: SupabaseClient<Database>,
): Promise<string> {
  const { data, error } = await callCurrentGamingDayRpc(supabase);

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to resolve gaming day: ${error.message}`,
      { details: error },
    );
  }

  if (!data) {
    throw new DomainError('INTERNAL_ERROR', 'Gaming day RPC returned null');
  }

  return data;
}

/**
 * Get the gaming day for a specific timestamp.
 *
 * **TEST-ONLY** — this export exists for integration test harnesses that need
 * to verify gaming day computation at specific points in time. Production code
 * must never import this function.
 *
 * The ESLint `no-temporal-bypass` rule bans `getServerGamingDayAt` in
 * `services/`, `app/`, and `hooks/` paths.
 *
 * @param supabase - Authenticated Supabase client with RLS context
 * @param ts - ISO 8601 timestamp to compute gaming day for
 * @returns ISO date string (YYYY-MM-DD)
 * @throws DomainError on RPC failure
 */
export async function getServerGamingDayAt(
  supabase: SupabaseClient<Database>,
  ts: string,
): Promise<string> {
  const { data, error } = await callCurrentGamingDayAtRpc(supabase, ts);

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to resolve gaming day at ${ts}: ${error.message}`,
      { details: error },
    );
  }

  if (!data) {
    throw new DomainError('INTERNAL_ERROR', 'Gaming day RPC returned null');
  }

  return data;
}
