'use server';

import type { ServiceResult } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';
import { acceptStaffInvite } from '@/services/casino/crud';
import type { AcceptInviteResult } from '@/services/casino/dtos';
import { acceptInviteSchema } from '@/services/casino/schemas';

export async function acceptInviteAction(
  token: string,
): Promise<ServiceResult<AcceptInviteResult>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (ctx) => {
      const input = acceptInviteSchema.parse({ token });
      const data = await acceptStaffInvite(supabase, input);

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
      action: 'invite.accept',
      skipAuth: true,
    },
  );
}
