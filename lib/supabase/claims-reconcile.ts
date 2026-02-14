/**
 * Staff Claims Reconciliation
 *
 * AUTH-HARDENING v0.1 WS3: Shared helper for deterministic JWT claims
 * sync/clear during staff mutations. Placed in lib/supabase/ (cross-cutting)
 * rather than services/casino/ to avoid bounded context ambiguity.
 *
 * Invoked by createStaff() and updateStaff() in services/casino/crud.ts.
 * Errors propagate to the caller — no silent swallowing.
 */

import { clearUserRLSClaims, syncUserRLSClaims } from './auth-admin';

export interface ReconcileStaffClaimsParams {
  /** Staff record UUID */
  staffId: string;
  /** Current user_id (after mutation) */
  userId: string | null;
  /** Current casino_id (after mutation) */
  casinoId: string | null;
  /** Current staff role (after mutation) */
  staffRole: string;
  /** Current staff status (after mutation) */
  currentStatus: string;
  /** Previous user_id (before mutation) — only needed for updateStaff */
  previousUserId?: string | null;
  /** Previous casino_id (before mutation) — only needed for updateStaff */
  previousCasinoId?: string | null;
  /** Previous status (before mutation) — only needed for updateStaff */
  previousStatus?: string;
}

/**
 * Reconcile JWT claims after a staff create or update.
 *
 * Decision tree:
 * 1. Staff became inactive → clear claims (if user_id existed)
 * 2. user_id was removed → clear claims for previous user_id
 * 3. casino_id changed → clear old claims, then sync new
 * 4. Active staff with user_id → sync claims
 *
 * All actions are logged. Errors propagate (not silently ignored).
 */
export async function reconcileStaffClaims(
  params: ReconcileStaffClaimsParams,
): Promise<void> {
  const {
    staffId,
    userId,
    casinoId,
    staffRole,
    currentStatus,
    previousUserId,
    previousCasinoId,
    previousStatus,
  } = params;

  // 1. Staff became inactive → clear claims
  if (currentStatus === 'inactive' && previousStatus !== 'inactive') {
    const clearTarget = userId ?? previousUserId;
    if (clearTarget) {
      console.info(
        '[CLAIMS RECONCILE] staff deactivated — clearing claims: staffId=%s userId=%s',
        staffId,
        clearTarget,
      );
      await clearUserRLSClaims(clearTarget);
    }
    return;
  }

  // 2. user_id was removed → clear claims for previous user_id
  if (!userId && previousUserId) {
    console.info(
      '[CLAIMS RECONCILE] user_id removed — clearing claims: staffId=%s previousUserId=%s',
      staffId,
      previousUserId,
    );
    await clearUserRLSClaims(previousUserId);
    return;
  }

  // No user_id means no JWT claims to manage (e.g., dealers)
  if (!userId || !casinoId) {
    return;
  }

  // 3. casino_id changed → clear old claims before re-sync
  if (previousCasinoId && previousCasinoId !== casinoId && previousUserId) {
    console.info(
      '[CLAIMS RECONCILE] casino_id changed — clearing stale claims before re-sync: staffId=%s oldCasino=%s newCasino=%s',
      staffId,
      previousCasinoId,
      casinoId,
    );
    await clearUserRLSClaims(previousUserId);
  }

  // 4. Active staff with user_id → sync claims
  if (currentStatus === 'active') {
    await syncUserRLSClaims(userId, {
      casino_id: casinoId,
      staff_role: staffRole,
      staff_id: staffId,
    });
  }
}
