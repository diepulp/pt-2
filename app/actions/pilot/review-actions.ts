'use server';

import { randomUUID } from 'crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import type { ServiceResult } from '@/lib/http/service-response';
import { isPilotAdmin } from '@/lib/pilot/is-pilot-admin';
import { createClient } from '@/lib/supabase/server';
// SERVICE_ROLE_EXEMPTION: PRD-083 — approved_email_allowlist and pilot_access_requests
// require service-role for all reads/writes (admin review path, no RLS SELECT for
// authenticated role on allowlist table, RULE-1). createServiceClient() is only
// instantiated AFTER requirePilotAdminSession() verifies admin authority (DEC-1).
import { createServiceClient } from '@/lib/supabase/service';
import { emitTelemetry } from '@/lib/telemetry/emit-telemetry';
import { canonicalizeEmail } from '@/services/pilot/crud';
import type { Database } from '@/types/database.types';

// ---------------------------------------------------------------------------
// Admin guard (DEC-1)
// ---------------------------------------------------------------------------

async function requirePilotAdminSession(
  supabase: SupabaseClient<Database>,
): Promise<{ adminEmail: string; correlationId: string }> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    throw new DomainError('UNAUTHORIZED', 'Authentication required');
  }

  const canonical = canonicalizeEmail(user.email);

  if (!isPilotAdmin(canonical)) {
    throw new DomainError(
      'PILOT_ADMIN_REQUIRED',
      'Pilot admin authority required',
    );
  }

  return { adminEmail: canonical, correlationId: randomUUID() };
}

// ---------------------------------------------------------------------------
// approvePilotAccessAction
// ---------------------------------------------------------------------------

export async function approvePilotAccessAction(
  requestId: string,
): Promise<ServiceResult<void>> {
  const reqId = randomUUID();
  const startedAt = Date.now();
  const supabase = await createClient();

  let adminEmail: string;
  let correlationId: string;

  try {
    ({ adminEmail, correlationId } = await requirePilotAdminSession(supabase));
  } catch (err) {
    if (err instanceof DomainError && err.code === 'PILOT_ADMIN_REQUIRED') {
      emitTelemetry({
        eventType: 'pilot_review.approve.denied',
        timestamp: new Date().toISOString(),
        correlationId: randomUUID(),
        metadata: { action: 'approve', result: 'denied', requestId },
        severity: 'warn',
      });
      return {
        ok: false,
        code: 'FORBIDDEN',
        error: (err as DomainError).message,
        requestId: reqId,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      };
    }
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      error: 'Authentication required',
      requestId: reqId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  const serviceClient = createServiceClient();

  // Fetch request to get email
  const { data: request, error: fetchError } = await serviceClient
    .from('pilot_access_requests')
    .select('id, email')
    .eq('id', requestId)
    .maybeSingle();

  if (fetchError || !request) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      error: 'Pilot access request not found',
      requestId: reqId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  const targetEmail = canonicalizeEmail(request.email);

  // ATOMIC: upsert allowlist entry
  const { error: upsertError } = await serviceClient
    .from('approved_email_allowlist')
    .upsert(
      { email: targetEmail, status: 'active', invited_by: adminEmail },
      { onConflict: 'email' },
    );

  if (upsertError) {
    emitTelemetry({
      eventType: 'pilot_review.approve.error',
      timestamp: new Date().toISOString(),
      correlationId,
      metadata: {
        action: 'approve',
        result: 'error',
        targetEmail,
        actorEmail: adminEmail,
        stage: 'allowlist_upsert',
        error: safeErrorDetails(upsertError),
      },
      severity: 'error',
    });
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to update allowlist',
      requestId: reqId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  // Update request status — optimistic lock: only update if still 'pending'.
  // If count=0 the request was already approved by a concurrent call; skip OTP
  // to prevent token rotation invalidating the first magic link.
  const { data: updatedRows, error: updateError } = await serviceClient
    .from('pilot_access_requests')
    .update({
      status: 'approved',
      reviewed_by: adminEmail,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id');

  if (updateError) {
    emitTelemetry({
      eventType: 'pilot_review.approve.partial_write',
      timestamp: new Date().toISOString(),
      correlationId,
      metadata: {
        action: 'approve',
        result: 'partial_write',
        targetEmail,
        actorEmail: adminEmail,
        requestId,
        error: safeErrorDetails(updateError),
        note: 'allowlist updated but request status not updated',
      },
      severity: 'error',
    });
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error:
        'Partial write: allowlist updated but request status could not be set',
      requestId: reqId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  // Already processed by a concurrent approval — return success without
  // sending another OTP (would rotate the token and invalidate the first link).
  if (!updatedRows?.length) {
    emitTelemetry({
      eventType: 'pilot_review.approve.already_processed',
      timestamp: new Date().toISOString(),
      correlationId,
      metadata: {
        action: 'approve',
        result: 'already_processed',
        targetEmail,
        actorEmail: adminEmail,
        requestId,
      },
      severity: 'info',
    });
    return {
      ok: true,
      code: 'OK',
      data: undefined,
      requestId: reqId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  // Send magic link to approved evaluator so they can sign in without returning
  // to /signin manually. Best-effort: allowlist row is committed regardless.
  // Skip OTP entirely for admin target emails (PRD-085 WS5).
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000')
  ).trim();

  let otpError: Awaited<
    ReturnType<typeof supabase.auth.signInWithOtp>
  >['error'] = null;
  if (!isPilotAdmin(targetEmail)) {
    const { error } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${siteUrl}/auth/confirm`,
      },
    });
    otpError = error;
  }

  if (otpError) {
    emitTelemetry({
      eventType: 'pilot_review.approve.otp_warning',
      timestamp: new Date().toISOString(),
      correlationId,
      metadata: {
        action: 'approve',
        result: 'otp_send_failed',
        targetEmail,
        actorEmail: adminEmail,
        requestId,
        error: safeErrorDetails(otpError),
      },
      severity: 'warn',
    });
  }

  emitTelemetry({
    eventType: 'pilot_review.approve.success',
    timestamp: new Date().toISOString(),
    correlationId,
    metadata: {
      action: 'approve',
      result: 'success',
      targetEmail,
      actorEmail: adminEmail,
      requestId,
      magicLinkSent: !isPilotAdmin(targetEmail) && !otpError,
    },
    severity: 'info',
  });

  return {
    ok: true,
    code: 'OK',
    data: undefined,
    requestId: reqId,
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// rejectPilotAccessAction
// ---------------------------------------------------------------------------

export async function rejectPilotAccessAction(
  requestId: string,
): Promise<ServiceResult<void>> {
  const reqId = randomUUID();
  const startedAt = Date.now();
  const supabase = await createClient();

  let adminEmail: string;
  let correlationId: string;

  try {
    ({ adminEmail, correlationId } = await requirePilotAdminSession(supabase));
  } catch (err) {
    if (err instanceof DomainError && err.code === 'PILOT_ADMIN_REQUIRED') {
      emitTelemetry({
        eventType: 'pilot_review.reject.denied',
        timestamp: new Date().toISOString(),
        correlationId: randomUUID(),
        metadata: { action: 'reject', result: 'denied', requestId },
        severity: 'warn',
      });
      return {
        ok: false,
        code: 'FORBIDDEN',
        error: (err as DomainError).message,
        requestId: reqId,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      };
    }
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      error: 'Authentication required',
      requestId: reqId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  const serviceClient = createServiceClient();

  const { data: request, error: fetchError } = await serviceClient
    .from('pilot_access_requests')
    .select('id, email')
    .eq('id', requestId)
    .maybeSingle();

  if (fetchError || !request) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      error: 'Pilot access request not found',
      requestId: reqId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  const targetEmail = canonicalizeEmail(request.email);

  // Idempotent: update regardless of current status
  const { error: updateError } = await serviceClient
    .from('pilot_access_requests')
    .update({
      status: 'rejected',
      reviewed_by: adminEmail,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateError) {
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to reject request',
      requestId: reqId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  emitTelemetry({
    eventType: 'pilot_review.reject.success',
    timestamp: new Date().toISOString(),
    correlationId,
    metadata: {
      action: 'reject',
      result: 'success',
      targetEmail,
      actorEmail: adminEmail,
      requestId,
    },
    severity: 'info',
  });

  return {
    ok: true,
    code: 'OK',
    data: undefined,
    requestId: reqId,
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// revokePilotAccessAction
// ---------------------------------------------------------------------------

export async function revokePilotAccessAction(
  email: string,
): Promise<ServiceResult<void>> {
  const reqId = randomUUID();
  const startedAt = Date.now();
  const supabase = await createClient();

  let adminEmail: string;
  let correlationId: string;

  try {
    ({ adminEmail, correlationId } = await requirePilotAdminSession(supabase));
  } catch (err) {
    if (err instanceof DomainError && err.code === 'PILOT_ADMIN_REQUIRED') {
      emitTelemetry({
        eventType: 'pilot_review.revoke.denied',
        timestamp: new Date().toISOString(),
        correlationId: randomUUID(),
        metadata: { action: 'revoke', result: 'denied', targetEmail: email },
        severity: 'warn',
      });
      return {
        ok: false,
        code: 'FORBIDDEN',
        error: (err as DomainError).message,
        requestId: reqId,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      };
    }
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      error: 'Authentication required',
      requestId: reqId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  const targetEmail = canonicalizeEmail(email);
  const serviceClient = createServiceClient();

  // Idempotent: update to revoked regardless of current status
  const { error: updateError } = await serviceClient
    .from('approved_email_allowlist')
    .update({ status: 'revoked' })
    .eq('email', targetEmail);

  if (updateError) {
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to revoke access',
      requestId: reqId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  emitTelemetry({
    eventType: 'pilot_review.revoke.success',
    timestamp: new Date().toISOString(),
    correlationId,
    metadata: {
      action: 'revoke',
      result: 'success',
      targetEmail,
      actorEmail: adminEmail,
    },
    severity: 'info',
  });

  return {
    ok: true,
    code: 'OK',
    data: undefined,
    requestId: reqId,
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };
}
