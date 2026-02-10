/**
 * Get PIN Status Server Action
 *
 * Lightweight check: returns { hasPin: boolean } without exposing the hash.
 * Used by LockScreen to determine setup vs verify mode.
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS5
 */
'use server';

import type { ServiceResult } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';

interface PinStatus {
  hasPin: boolean;
}

/**
 * Check whether the current staff member has a PIN set.
 *
 * @returns ServiceResult<{ hasPin: boolean }>
 */
export async function getPinStatusAction(): Promise<ServiceResult<PinStatus>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (mwCtx) => {
      const staffId = mwCtx.rlsContext?.actorId;
      if (!staffId) {
        return {
          ok: false as const,
          code: 'UNAUTHORIZED' as const,
          error: 'No staff context available',
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      const { data, error } = await mwCtx.supabase
        .from('staff')
        .select('pin_hash')
        .eq('id', staffId)
        .single();

      if (error) {
        return {
          ok: false as const,
          code: 'NOT_FOUND' as const,
          error: 'Staff record not found',
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        ok: true as const,
        code: 'OK' as const,
        data: { hasPin: data.pin_hash !== null },
        requestId: mwCtx.correlationId,
        durationMs: Date.now() - mwCtx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    {
      domain: 'auth',
      action: 'get-pin-status',
    },
  );
}
