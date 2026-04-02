'use server';

import type { ServiceResult } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';
import { registerCompany } from '@/services/company/crud';
import type { RegisterCompanyResult } from '@/services/company/dtos';
import { registerCompanySchema } from '@/services/company/schemas';

export async function registerCompanyAction(
  formData: FormData,
): Promise<ServiceResult<RegisterCompanyResult>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (ctx) => {
      const raw = {
        company_name: formData.get('company_name'),
        legal_name: formData.get('legal_name') || undefined,
      };

      const input = registerCompanySchema.parse(raw);
      const data = await registerCompany(supabase, input);

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
      domain: 'company',
      action: 'register',
      skipAuth: true,
    },
  );
}
