/**
 * Set PIN Server Action
 *
 * Validates PIN (Zod + denylist), bcrypt hashes, and persists via
 * rpc_set_staff_pin (self-contained SECURITY DEFINER RPC).
 *
 * ADR-030 D5 (INV-030-7): Template 2b writes use self-contained RPCs.
 * The RPC calls set_rls_context_from_staff() and writes in the same
 * transaction — session vars are available for the UPDATE.
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS5
 * @see PATCH-DELTA-EXECUTION-SPEC-GAP-SIGN-OUT-v0.3.md §2
 * @see ISSUE-SET-PIN-SILENT-RLS-FAILURE.md
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

      // Persist via self-contained RPC (ADR-030 D5 INV-030-7).
      // The RPC injects context and writes in the same transaction —
      // no staffId param needed (ADR-024 INV-8: no spoofable params).
      const { error: updateError } = await mwCtx.supabase.rpc(
        'rpc_set_staff_pin',
        { p_pin_hash: pinHash },
      );

      if (updateError) {
        return {
          ok: false as const,
          code: 'PIN_SET_FAILED' as const,
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
