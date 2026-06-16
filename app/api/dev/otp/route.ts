import { NextResponse, type NextRequest } from 'next/server';

import {
  assertDevAuthBypassAllowed,
  isDevMode,
} from '@/lib/supabase/dev-context';
// SERVICE_ROLE_EXEMPTION: dev-only route (ENABLE_DEV_AUTH + NODE_ENV=development guard).
// Must use service-role to call dev_get_latest_otp_token RPC which reads auth.one_time_tokens —
// a Supabase-internal table not accessible via the authenticated client or RLS policies.
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

/**
 * DEV-ONLY: Retrieve the latest OTP/magic-link token for an email and return
 * the ready-to-use confirm URL. Real emails are still delivered to recipients.
 *
 * Guard: NODE_ENV=development AND ENABLE_DEV_AUTH=true — hard 404 otherwise.
 * RPC guard: dev_get_latest_otp_token is REVOKE'd from PUBLIC, service_role only.
 *
 * Usage:
 *   GET /api/dev/otp?email=foo@example.com
 *   GET /api/dev/otp?email=foo@example.com&redirect=1   (redirects directly)
 *
 * curl:
 *   curl "http://localhost:3000/api/dev/otp?email=foo@example.com"
 */

type OtpTokenRow = {
  token_hash: string;
  token_type: string;
  created_at: string;
};

export async function GET(request: NextRequest) {
  if (!isDevMode() || process.env.ENABLE_DEV_AUTH !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    assertDevAuthBypassAllowed();
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email')?.toLowerCase().trim();
  const shouldRedirect = searchParams.get('redirect') === '1';

  if (!email) {
    return NextResponse.json(
      { error: 'Missing required query param: email' },
      { status: 400 },
    );
  }

  const serviceClient = createServiceClient();

  // dev_get_latest_otp_token is a SECURITY DEFINER RPC that reads auth.one_time_tokens.
  // PostgREST does not expose the auth schema directly — the RPC bridges it.
  // EXECUTE is REVOKE'd from PUBLIC; only service_role can call it.
  const { data, error } = await serviceClient.rpc(
    'dev_get_latest_otp_token' as never,
    { p_email: email } as never,
  );

  const row = (data as OtpTokenRow[] | null)?.[0] ?? null;

  if (error || !row) {
    return NextResponse.json(
      { error: 'No OTP token found for this email', email },
      { status: 404 },
    );
  }

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ??
    `http://localhost:${process.env.PORT ?? 3000}`
  ).trim();

  // confirmation_token → type=email; magiclink token → type=magiclink
  const urlType =
    row.token_type === 'confirmation_token' ? 'email' : 'magiclink';
  const confirmUrl = `${siteUrl}/auth/confirm?token_hash=${row.token_hash}&type=${urlType}`;

  if (shouldRedirect) {
    return NextResponse.redirect(confirmUrl);
  }

  return NextResponse.json({
    email,
    token_type: row.token_type,
    created_at: row.created_at,
    confirm_url: confirmUrl,
    tip: 'Add &redirect=1 to skip this response and be redirected directly',
  });
}
