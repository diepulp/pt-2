/**
 * Sign-Out Server Action
 *
 * Provides server-side observability for sign-out events via structured
 * telemetry. Claims in app_metadata are NOT cleared — they are stable
 * identity attributes that persist for next sign-in (see Claims Model
 * in EXECUTION-SPEC-GAP-SIGN-OUT.md).
 *
 * This action is soft-fail: client-side sign-out proceeds regardless
 * of server action result.
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS1
 * @see ADR-024 (authoritative context derivation)
 * @see ADR-030 D2 (claims lifecycle — sign-out is NOT a clear trigger)
 */
'use server';

import type { ServiceResult } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';
import { emitTelemetry } from '@/lib/telemetry/emit-telemetry';

/**
 * Sign out the current user with server-side telemetry.
 *
 * Emits auth.sign_out.started / .completed / .failed events for audit trail.
 * Does NOT clear app_metadata claims (stable identity, by design).
 *
 * @returns ServiceResult<void> - Always returns result; soft-fail semantics
 */
export async function signOutAction(): Promise<ServiceResult<void>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (mwCtx) => {
      const staffId = mwCtx.rlsContext?.actorId;
      const casinoId = mwCtx.rlsContext?.casinoId;
      const staffRole = mwCtx.rlsContext?.staffRole;

      emitTelemetry({
        eventType: 'auth.sign_out.started',
        timestamp: new Date().toISOString(),
        correlationId: mwCtx.correlationId,
        staffId,
        severity: 'info',
        metadata: { casinoId, staffRole },
      });

      try {
        emitTelemetry({
          eventType: 'auth.sign_out.completed',
          timestamp: new Date().toISOString(),
          correlationId: mwCtx.correlationId,
          staffId,
          severity: 'info',
          metadata: {
            casinoId,
            staffRole,
            durationMs: Date.now() - mwCtx.startedAt,
          },
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: undefined,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';

        emitTelemetry({
          eventType: 'auth.sign_out.failed',
          timestamp: new Date().toISOString(),
          correlationId: mwCtx.correlationId,
          staffId,
          severity: 'error',
          metadata: {
            casinoId,
            errorCode: 'INTERNAL_ERROR',
            errorMessage,
            durationMs: Date.now() - mwCtx.startedAt,
          },
        });

        return {
          ok: false as const,
          code: 'INTERNAL_ERROR' as const,
          error: errorMessage,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      domain: 'auth',
      action: 'sign-out',
    },
  );
}
