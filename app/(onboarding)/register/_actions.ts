'use server';

import { randomUUID } from 'crypto';

import { DomainError } from '@/lib/errors/domain-errors';
import type { ServiceResult } from '@/lib/http/service-response';
import { requireApprovedPilotSession } from '@/lib/server-actions/guards/require-approved-pilot-session';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';
import { registerCompany } from '@/services/company/crud';
import type { RegisterCompanyResult } from '@/services/company/dtos';
import { registerCompanySchema } from '@/services/company/schemas';

export async function registerCompanyAction(
  formData: FormData,
): Promise<ServiceResult<RegisterCompanyResult>> {
  const supabase = await createClient();

  // Guard: requires authenticated session + active allowlist entry.
  // Runs before withServerAction because withAuth checks staff binding (pre-staff state).
  try {
    await requireApprovedPilotSession(supabase, {
      requireProvisioningAuth: true,
    });
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
