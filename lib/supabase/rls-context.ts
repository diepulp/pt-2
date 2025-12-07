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

import type { Database } from '@/types/database.types';

export interface RLSContext {
  actorId: string; // UUID from auth.uid()
  casinoId: string; // UUID from staff.casino_id
  staffRole: string; // From staff.role
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
  // NOTE: staff table must have a user_id column linking to auth.users
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

  return {
    actorId: staff.id,
    casinoId: staff.casino_id,
    staffRole: staff.role,
  };
}

/**
 * Inject RLS context into Postgres session via SET LOCAL
 *
 * Pattern:
 * ```sql
 * SET LOCAL app.actor_id = 'uuid';
 * SET LOCAL app.casino_id = 'uuid';
 * SET LOCAL app.staff_role = 'admin';
 * SET LOCAL application_name = 'correlation-id';
 * ```
 *
 * RLS policies then use:
 * ```sql
 * current_setting('app.casino_id')::uuid
 * current_setting('app.actor_id')::uuid
 * ```
 */
export async function injectRLSContext(
  supabase: SupabaseClient<Database>,
  context: RLSContext,
  correlationId?: string,
): Promise<void> {
  const statements = [
    `SET LOCAL app.actor_id = '${context.actorId}'`,
    `SET LOCAL app.casino_id = '${context.casinoId}'`,
    `SET LOCAL app.staff_role = '${context.staffRole}'`,
  ];

  if (correlationId) {
    statements.push(`SET LOCAL application_name = '${correlationId}'`);
  }

  // Execute all SET LOCAL statements
  for (const stmt of statements) {
    const { error } = await supabase.rpc('exec_sql', { sql: stmt });
    if (error) {
      throw new Error(`Failed to inject RLS context: ${error.message}`);
    }
  }
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
