/**
 * RLS Context Injection
 *
 * Purpose: Inject casino_id and actor_id into Postgres session via SET LOCAL
 * so RLS policies can use current_setting() instead of complex JWT parsing.
 *
 * Pattern:
 * 1. Extract auth context from Supabase client
 * 2. Validate actor belongs to casino
 * 3. Inject via SET LOCAL before operations
 * 4. RLS policies read from current_setting()
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { markRpcContextInjected } from '@/lib/correlation';
import type { Database } from '@/types/database.types';

export interface RLSContext {
  actorId: string; // UUID from auth.uid()
  casinoId: string; // UUID from staff.casino_id
  staffRole: string; // From staff.role
  companyId: string; // UUID from casino.company_id via company JOIN (ADR-043)
}

/**
 * Get authenticated user's casino context
 *
 * CRITICAL: This validates that the authenticated user (auth.uid())
 * is a staff member with a valid casino assignment.
 */
export async function getAuthContext(
  supabase: SupabaseClient<Database>,
): Promise<RLSContext> {
  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('UNAUTHORIZED: No authenticated user');
  }

  // Lookup staff record by user_id
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, casino_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  if (staffError || !staff) {
    throw new Error('FORBIDDEN: User is not active staff');
  }

  if (!staff.casino_id) {
    throw new Error('FORBIDDEN: Staff member has no casino assignment');
  }

  // Derive companyId from casino→company FK (ADR-043, PK lookup)
  const { data: casinoRow, error: casinoError } = await supabase
    .from('casino')
    .select('company_id')
    .eq('id', staff.casino_id)
    .single();

  if (casinoError || !casinoRow) {
    throw new Error('FORBIDDEN: Casino not found for staff assignment');
  }

  return {
    actorId: staff.id,
    casinoId: staff.casino_id,
    staffRole: staff.role,
    companyId: casinoRow.company_id ?? '',
  };
}

/**
 * Inject RLS context via SET LOCAL and return the authoritative context.
 *
 * AUTH-HARDENING v0.1 WS2: The RPC is the single source of truth.
 * Returns the derived RLSContext so middleware can overwrite ctx.rlsContext
 * with the exact values the RPC set in the Postgres session.
 *
 * Uses set_rls_context_from_staff() RPC per ADR-024:
 * - Context derived from auth.uid() binding to staff.user_id
 * - No spoofable parameters accepted from client
 * - Staff must be active with valid casino assignment
 * - RPC RETURNS TABLE (actor_id, casino_id, staff_role, company_id)
 *
 * @param supabase - Authenticated Supabase client
 * @param correlationId - Optional trace ID for observability
 * @returns The authoritative RLSContext derived by the RPC
 */
export async function injectRLSContext(
  supabase: SupabaseClient<Database>,
  correlationId?: string,
): Promise<RLSContext> {
  const { data, error } = await supabase.rpc('set_rls_context_from_staff', {
    p_correlation_id: correlationId,
  });

  if (error) {
    console.error(
      '[RLS] context injection failed: %s (correlationId=%s)',
      error.message,
      correlationId,
    );
    throw new Error(`Failed to inject RLS context: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) {
    console.error(
      '[RLS] RPC returned no context row (correlationId=%s)',
      correlationId,
    );
    throw new Error('Failed to inject RLS context: RPC returned no data');
  }

  // ADR-043: RPC returns company_id but generated types lag behind remote schema.
  // Extract via record access to avoid type assertion on the row.
  const rawRow: Record<string, unknown> = Object.assign({}, row);
  const context: RLSContext = {
    actorId: row.actor_id,
    casinoId: row.casino_id,
    staffRole: row.staff_role,
    companyId: String(rawRow.company_id ?? ''),
  };

  // AUTH-HARDENING v0.1 WS6: Mark RPC context as injected for canary assertion
  markRpcContextInjected();

  if (process.env.NODE_ENV === 'development') {
    console.info(
      '[RLS] context set: actor=%s casino=%s role=%s company=%s (correlationId=%s)',
      context.actorId,
      context.casinoId,
      context.staffRole,
      context.companyId,
      correlationId,
    );
  }

  return context;
}

/**
 * Validate casino_id matches RLS context
 *
 * Use this in service methods to assert that operations are scoped
 * to the authenticated user's casino.
 */
export function assertCasinoScope(context: RLSContext, casinoId: string): void {
  if (context.casinoId !== casinoId) {
    throw new Error(
      `FORBIDDEN: Operation targets casino ${casinoId} but user is scoped to ${context.casinoId}`,
    );
  }
}

/**
 * Validate actor_id matches RLS context
 *
 * Use this for operations that must be performed by the actor themselves
 * (e.g., updating their own profile).
 */
export function assertActorScope(context: RLSContext, actorId: string): void {
  if (context.actorId !== actorId) {
    throw new Error(
      `FORBIDDEN: Operation requires actor ${actorId} but current actor is ${context.actorId}`,
    );
  }
}

/**
 * Check if actor has required role
 */
export function assertRole(context: RLSContext, allowedRoles: string[]): void {
  if (!allowedRoles.includes(context.staffRole)) {
    throw new Error(
      `FORBIDDEN: Operation requires role ${allowedRoles.join('|')} but actor has ${context.staffRole}`,
    );
  }
}
