/**
 * Verify PIN Server Action
 *
 * Compares user-entered PIN against stored bcrypt hash.
 * Uses DB-backed rate limiting via rpc_increment_pin_attempt() (ADR-024).
 * On success, clears attempts via rpc_clear_pin_attempts().
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS5
 */
'use server';

import bcrypt from 'bcryptjs';

import type { ServiceResult } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';
import { emitTelemetry } from '@/lib/telemetry/emit-telemetry';

import { pinSchema } from './schemas';

interface VerifyPinResult {
  verified: boolean;
}

/**
 * Verify the current staff member's PIN for lock screen unlock.
 *
 * @param pin - 4-6 digit PIN to verify
 * @returns ServiceResult<{ verified: boolean }> or RATE_LIMIT_EXCEEDED
 */
export async function verifyPinAction(
  pin: string,
): Promise<ServiceResult<VerifyPinResult>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (mwCtx) => {
      const staffId = mwCtx.rlsContext?.actorId;
      const casinoId = mwCtx.rlsContext?.casinoId;

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

      // Validate PIN format
      const parsed = pinSchema.safeParse(pin);
      if (!parsed.success) {
        return {
          ok: false as const,
          code: 'VALIDATION_ERROR' as const,
          error: parsed.error.issues[0]?.message ?? 'Invalid PIN format',
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      // Read staff.pin_hash
      const { data: staffData, error: staffError } = await mwCtx.supabase
        .from('staff')
        .select('pin_hash')
        .eq('id', staffId)
        .single();

      if (staffError || !staffData) {
        return {
          ok: false as const,
          code: 'NOT_FOUND' as const,
          error: 'Staff record not found',
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      if (staffData.pin_hash === null) {
        return {
          ok: false as const,
          code: 'NOT_FOUND' as const,
          error: 'PIN not set',
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      // Compare PIN
      const isMatch = await bcrypt.compare(parsed.data, staffData.pin_hash);

      if (isMatch) {
        // Clear rate-limit attempts on success via RPC (no raw DELETE)
        await mwCtx.supabase.rpc('rpc_clear_pin_attempts');

        return {
          ok: true as const,
          code: 'OK' as const,
          data: { verified: true as boolean },
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      // Mismatch — increment rate-limit counter via RPC (no params, ADR-024)
      const { data: attemptData, error: rpcError } = await mwCtx.supabase.rpc(
        'rpc_increment_pin_attempt',
      );

      const attempt = attemptData?.[0];
      const attemptCount = attempt?.attempt_count ?? 1;
      const isLimited = attempt?.is_limited ?? false;

      if (rpcError) {
        // Rate-limit RPC failed — still return mismatch but log the error
        emitTelemetry({
          eventType: 'auth.lock_screen.pin_failed',
          timestamp: new Date().toISOString(),
          correlationId: mwCtx.correlationId,
          staffId,
          severity: 'warn',
          metadata: { casinoId, attemptCount: 0, maxAttempts: 5 },
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: { verified: false as boolean },
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      if (isLimited) {
        emitTelemetry({
          eventType: 'auth.lock_screen.rate_limited',
          timestamp: new Date().toISOString(),
          correlationId: mwCtx.correlationId,
          staffId,
          severity: 'error',
          metadata: {
            casinoId,
            attemptCount,
            windowDurationMs: 15 * 60 * 1000,
          },
        });

        return {
          ok: false as const,
          code: 'RATE_LIMIT_EXCEEDED' as const,
          error: 'Too many failed PIN attempts. You will be signed out.',
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      emitTelemetry({
        eventType: 'auth.lock_screen.pin_failed',
        timestamp: new Date().toISOString(),
        correlationId: mwCtx.correlationId,
        staffId,
        severity: 'warn',
        metadata: { casinoId, attemptCount, maxAttempts: 5 },
      });

      return {
        ok: true as const,
        code: 'OK' as const,
        data: { verified: false },
        requestId: mwCtx.correlationId,
        durationMs: Date.now() - mwCtx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    {
      domain: 'auth',
      action: 'verify-pin',
    },
  );
}
