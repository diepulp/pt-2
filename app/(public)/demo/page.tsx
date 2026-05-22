import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { canonicalizeEmail, checkAllowlistGate } from '@/services/pilot/crud';

export const dynamic = 'force-dynamic';

// Defense-in-depth edge case handler. Not reached during normal approved-user sign-in —
// /start auto-creates a Casino 1 staff binding and routes evaluators to /pit first.
// This route handles direct URL navigation and the revoked-access edge case.
export default async function DemoPage() {
  const supabase = await createClient();

  // 1. Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  // 2. Allowlist check (service-role client — RULE-1: no SELECT policy for authenticated role).
  // Bypassed in development — user still holds a real JWT and RLS is enforced normally.
  if (process.env.NODE_ENV !== 'development') {
    const serviceClient = createServiceClient();
    const allowlistResult = await checkAllowlistGate(
      serviceClient,
      canonicalizeEmail(user.email!),
    );
    if (allowlistResult !== 'approved') {
      redirect('/request-access');
    }
  }

  // 3. Admin shortcut
  const adminEmails = (process.env.PILOT_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.includes(canonicalizeEmail(user.email!))) {
    redirect('/pilot-review');
  }

  // 4. Staff binding check — active staff redirect to /pit (direct URL navigation)
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (staffError) {
    // Structured diagnostic — no PII email in plaintext (masking to first 8 chars of UUID)
    const maskedId = user.id.substring(0, 8);
    console.error(`[/demo] staff query failed for user ${maskedId}:`, {
      code: staffError.code,
    });
    // Fall through to holding page — do not crash
  } else if (staff?.status === 'active') {
    redirect('/pit');
  }

  // 5. Approved non-admin with no active staff binding → holding page (edge case)
  // No writes to any table. No RLS context-injection functions called.
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="max-w-sm space-y-3 text-center">
        <h1
          className="text-sm font-bold uppercase tracking-widest text-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          Demo Access Pending
        </h1>
        <p className="text-sm text-muted-foreground">
          Your access to the interactive demo is being set up. If you believe
          this is an error, please contact us.
        </p>
        <Link
          href="/contact"
          className="mt-2 inline-block text-sm text-accent hover:underline"
        >
          Contact us
        </Link>
      </div>
    </div>
  );
}
