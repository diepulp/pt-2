'use server';

import type { ServiceResult } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';
import { bootstrapCasino } from '@/services/casino/crud';
import type { BootstrapCasinoResult } from '@/services/casino/dtos';
import { bootstrapCasinoSchema } from '@/services/casino/schemas';

export async function bootstrapAction(
  formData: FormData,
): Promise<ServiceResult<BootstrapCasinoResult>> {
  const supabase = await createClient();

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
