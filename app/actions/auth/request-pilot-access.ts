'use server';

import { randomUUID } from 'crypto';

import { ZodError } from 'zod';

import type { ServiceResult } from '@/lib/http/service-response';
import { createServiceClient } from '@/lib/supabase/service';
import { requestAccessSchema, submitAccessRequest } from '@/services/pilot';

// Submit a pilot access request (public form, no auth required).
// Safe on duplicate pending email: same success response whether or not a
// pending row already exists (partial unique index + 23505 handling in crud).
// Error messages are non-revealing per RULE-7 / RULE-8.
export async function requestPilotAccessAction(
  formData: FormData,
): Promise<ServiceResult<void>> {
  const requestId = randomUUID();
  const startedAt = Date.now();

  let parsed: ReturnType<typeof requestAccessSchema.parse>;
  try {
    parsed = requestAccessSchema.parse({
      email: formData.get('email'),
      name: formData.get('name'),
      casino_name: formData.get('casino_name'),
      role: formData.get('role'),
      estimated_table_count: formData.get('estimated_table_count') || undefined,
      message: formData.get('message') || undefined,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        ok: false,
        code: 'VALIDATION_ERROR',
        error: 'Please check your submission and try again.',
        requestId,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      };
    }
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'An unexpected error occurred.',
      requestId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  try {
    // SERVICE_ROLE_EXEMPTION: PRD-083 — pilot_access_requests INSERT policy is anon-only.
    // Authenticated users redirected to /request-access would be rejected by RLS under the
    // authenticated role. Service-role bypasses this; action is server-side only and inputs
    // are fully Zod-validated before reaching the DB.
    const supabase = createServiceClient();
    await submitAccessRequest(supabase, parsed);

    return {
      ok: true,
      code: 'OK',
      data: undefined,
      requestId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Unable to submit your request. Please try again.',
      requestId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }
}
