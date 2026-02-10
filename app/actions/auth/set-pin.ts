/**
 * Set PIN Server Action
 *
 * Validates PIN (Zod + denylist), bcrypt hashes, and stores in staff.pin_hash.
 * Uses authed client — RLS policy enforces self-only update (ADR-030 D4).
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS5
 */
'use server';

import bcrypt from 'bcryptjs';

import type { ServiceResult } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';

import { pinSchema } from './schemas';

/**
 * Set or update the current staff member's PIN for lock screen.
 *
 * @param pin - 4-6 digit PIN (validated against denylist)
 * @returns ServiceResult<void>
 */
export async function setPinAction(pin: string): Promise<ServiceResult<void>> {
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

      // Validate PIN format + denylist
      const parsed = pinSchema.safeParse(pin);
      if (!parsed.success) {
        return {
          ok: false as const,
          code: 'VALIDATION_ERROR' as const,
          error: parsed.error.issues[0]?.message ?? 'Invalid PIN',
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      // Hash PIN with bcrypt (salt rounds = 10)
      const pinHash = await bcrypt.hash(parsed.data, 10);

      // Update staff.pin_hash via authed client — RLS enforces self-only
      const { error: updateError } = await mwCtx.supabase
        .from('staff')
        .update({ pin_hash: pinHash })
        .eq('id', staffId);

      if (updateError) {
        return {
          ok: false as const,
          code: 'INTERNAL_ERROR' as const,
          error: updateError.message,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        ok: true as const,
        code: 'OK' as const,
        data: undefined,
        requestId: mwCtx.correlationId,
        durationMs: Date.now() - mwCtx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    {
      domain: 'auth',
      action: 'set-pin',
    },
  );
}
