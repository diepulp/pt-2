'use server';

import { randomUUID } from 'crypto';

import { DomainError } from '@/lib/errors/domain-errors';
import type { ServiceResult } from '@/lib/http/service-response';
import { requireApprovedPilotSession } from '@/lib/server-actions/guards/require-approved-pilot-session';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';
import { bootstrapCasino } from '@/services/casino/crud';
import type { BootstrapCasinoResult } from '@/services/casino/dtos';
import { bootstrapCasinoSchema } from '@/services/casino/schemas';

export async function bootstrapAction(
  formData: FormData,
): Promise<ServiceResult<BootstrapCasinoResult>> {
  const supabase = await createClient();

  // Guard: requires authenticated session + active allowlist entry.
  // Runs before withServerAction because withAuth checks staff binding (pre-staff state).
  try {
    await requireApprovedPilotSession(supabase);
  } catch (err) {
    const reqId = randomUUID();
    if (err instanceof DomainError) {
      return {
        ok: false,
        code: err.code,
        error: err.message,
        requestId: reqId,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      };
    }
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      error: 'Authentication required',
      requestId: reqId,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    };
  }

  return withServerAction(
    supabase,
    async (ctx) => {
      const raw = {
        casino_name: formData.get('casino_name'),
        timezone: formData.get('timezone') || undefined,
        gaming_day_start: formData.get('gaming_day_start') || undefined,
      };

      const input = bootstrapCasinoSchema.parse(raw);
      const data = await bootstrapCasino(supabase, input);

      return {
        ok: true,
        code: 'OK' as const,
        data,
        requestId: ctx.correlationId,
        durationMs: Date.now() - ctx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    {
      domain: 'casino',
      action: 'bootstrap',
      skipAuth: true,
    },
  );
}
