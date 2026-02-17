/**
 * Auth Admin Utilities
 *
 * Helpers for managing user authentication metadata using the service role client.
 * ADR-015 Phase 2: JWT claims for RLS optimization in production.
 *
 * ONLY use these functions on the server side. Never expose to the browser.
 *
 * @see docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md
 */

import { createServiceClient } from './service';

/**
 * RLS claims structure for JWT app_metadata
 *
 * These claims are embedded in the user's JWT token and can be accessed
 * by RLS policies via: auth.jwt() -> 'app_metadata' ->> '{claim_name}'
 *
 * This provides better connection pooling performance compared to
 * session variables (SET LOCAL) which are connection-scoped.
 */
export interface RLSClaims {
  /** Casino UUID the staff member belongs to */
  casino_id: string;
  /** Staff role: dealer, pit_boss, admin */
  staff_role: string;
  /** Staff record UUID from staff table */
  staff_id: string;
}

/**
 * Sync RLS claims to user's JWT app_metadata
 *
 * ADR-015 Phase 2: Sets casino_id, staff_role, staff_id in auth.users.app_metadata
 * so RLS policies can use auth.jwt() instead of session variables for better
 * connection pooling performance.
 *
 * The hybrid RLS policies check JWT claims as fallback:
 * ```sql
 * casino_id = COALESCE(
 *   NULLIF(current_setting('app.casino_id', true), '')::uuid,
 *   (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
 * )
 * ```
 *
 * This function uses the service role client to bypass RLS and update
 * user metadata directly via Supabase Auth Admin API.
 *
 * @param userId - auth.users.id (UUID)
 * @param claims - RLS claims to embed in JWT
 * @throws Error if user update fails
 *
 * @example
 * ```typescript
 * // After creating a pit_boss staff member
 * await syncUserRLSClaims(user.id, {
 *   casino_id: staff.casino_id,
 *   staff_role: staff.role,
 *   staff_id: staff.id,
 * });
 * ```
 */
export async function syncUserRLSClaims(
  userId: string,
  claims: RLSClaims,
): Promise<void> {
  const serviceClient = createServiceClient();

  const { error } = await serviceClient.auth.admin.updateUserById(userId, {
    app_metadata: {
      casino_id: claims.casino_id,
      staff_role: claims.staff_role,
      staff_id: claims.staff_id,
    },
  });

  if (error) {
    throw new Error(
      `Failed to sync RLS claims for user ${userId}: ${error.message}`,
    );
  }

  console.info(
    '[CLAIMS] synced: userId=%s staffId=%s casinoId=%s role=%s',
    userId,
    claims.staff_id,
    claims.casino_id,
    claims.staff_role,
  );
}

/**
 * Clear RLS claims from user's JWT app_metadata
 *
 * Used when a staff member is deactivated or their role/casino changes
 * in a way that requires re-authentication.
 *
 * @param userId - auth.users.id (UUID)
 * @throws Error if user update fails
 */
export async function clearUserRLSClaims(userId: string): Promise<void> {
  const serviceClient = createServiceClient();

  const { error } = await serviceClient.auth.admin.updateUserById(userId, {
    app_metadata: {
      casino_id: null,
      staff_role: null,
      staff_id: null,
    },
  });

  if (error) {
    throw new Error(
      `Failed to clear RLS claims for user ${userId}: ${error.message}`,
    );
  }

  console.info('[CLAIMS] cleared: userId=%s', userId);
}
