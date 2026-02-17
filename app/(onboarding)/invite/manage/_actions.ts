'use server';

import type { ServiceResult } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';
import { createStaffInvite } from '@/services/casino/crud';
import type { CreateInviteResult } from '@/services/casino/dtos';
import { createInviteSchema } from '@/services/casino/schemas';

export async function createInviteAction(
  formData: FormData,
): Promise<ServiceResult<CreateInviteResult>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (ctx) => {
      const raw = {
        email: formData.get('email'),
        role: formData.get('role'),
      };

      const input = createInviteSchema.parse(raw);
      const data = await createStaffInvite(supabase, input);

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
      action: 'invite.create',
    },
  );
}
