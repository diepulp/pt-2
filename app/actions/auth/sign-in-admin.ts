'use server';

import { randomUUID } from 'crypto';

import type { ServiceResult } from '@/lib/http/service-response';
import { createClient } from '@/lib/supabase/server';

// Password-based sign-in for pilot admin accounts.
// Only used by the internal admin login surface — customers use the magic-link flow.
// Error messages are intentionally non-specific (RULE-7).
export async function signInAdminAction(
  email: string,
  password: string,
): Promise<ServiceResult<void>> {
  const requestId = randomUUID();
  const startedAt = Date.now();

  if (!email || !password) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      error: 'Email and password are required.',
      requestId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      error: 'Invalid credentials.',
      requestId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    ok: true,
    code: 'OK',
    data: undefined,
    requestId,
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };
}
