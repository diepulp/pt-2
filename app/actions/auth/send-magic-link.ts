'use server';

import { randomUUID } from 'crypto';

import { ZodError } from 'zod';

import type { ServiceResult } from '@/lib/http/service-response';
import { createClient } from '@/lib/supabase/server';
// SERVICE_ROLE_EXEMPTION: PRD-083 — approved_email_allowlist has no SELECT RLS policy
// for any role by design (RULE-1). Allowlist gate reads must use service-role client.
import { createServiceClient } from '@/lib/supabase/service';
import { checkAllowlistGate, sendMagicLinkSchema } from '@/services/pilot';
import type { AllowlistGateResult } from '@/services/pilot';

export interface SendMagicLinkResult {
  allowlistResult: AllowlistGateResult;
}

// Send a magic link OTP after verifying the email is on the approved allowlist.
// Fail closed: any error in the allowlist check → 'not_approved' (no OTP issued).
// Never calls supabase.auth.signUp() under any branch (RULE-2).
// Error messages are non-revealing per RULE-7.
export async function sendMagicLinkAction(
  email: string,
): Promise<ServiceResult<SendMagicLinkResult>> {
  const requestId = randomUUID();
  const startedAt = Date.now();

  let canonicalEmail: string;
  try {
    const parsed = sendMagicLinkSchema.parse({ email });
    canonicalEmail = parsed.email;
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        ok: false,
        code: 'VALIDATION_ERROR',
        error: 'Invalid email address.',
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

  // Allowlist gate: service-role read only — RLS has no SELECT policy for
  // anon/authenticated roles on approved_email_allowlist (server-side only).
  const serviceClient = createServiceClient();
  const allowlistResult = await checkAllowlistGate(
    serviceClient,
    canonicalEmail,
  );

  if (allowlistResult === 'not_approved') {
    return {
      ok: true,
      code: 'OK',
      data: { allowlistResult: 'not_approved' },
      requestId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  // Approved: issue OTP via server client (cookie-aware for auth flow).
  // emailRedirectTo must point to the current host — without it Supabase uses the
  // project's configured Site URL (Vercel), which won't establish a session on localhost.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

  const supabase = await createClient();
  // shouldCreateUser: true — the allowlist gate above is the containment barrier.
  // Approved users may not exist in auth.users yet (first sign-in after approval).
  // shouldCreateUser: false would silently drop the OTP for new users (RULE-2 only
  // bans signUp() calls, not Supabase auto-provisioning via OTP for allowlisted emails).
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: canonicalEmail,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  });

  if (otpError) {
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Unable to send magic link. Please try again.',
      requestId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    ok: true,
    code: 'OK',
    data: { allowlistResult: 'approved' },
    requestId,
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };
}
