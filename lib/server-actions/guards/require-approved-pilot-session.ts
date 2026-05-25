import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
// SERVICE_ROLE_EXEMPTION: PRD-083 — approved_email_allowlist has no SELECT RLS policy
// for any role by design (RULE-1). Allowlist gate reads must use service-role client.
import { createServiceClient } from '@/lib/supabase/service';
import { canonicalizeEmail, checkAllowlistGate } from '@/services/pilot/crud';
import type { Database } from '@/types/database.types';

export interface RequireApprovedPilotSessionOpts {
  // When true, additionally verifies the caller is in PILOT_ADMIN_EMAILS after the
  // allowlist gate. Fail-closed: if PILOT_ADMIN_EMAILS is unset or empty and this
  // option is true, throws FORBIDDEN — no provisioning access granted by default.
  requireProvisioningAuth?: boolean;
}

// Pre-staff onboarding authorization guard.
// Default: verifies authenticated Supabase session + active allowlist entry.
// With requireProvisioningAuth:true: additionally requires PILOT_ADMIN_EMAILS membership.
//
// Valid for registerCompanyAction and bootstrapAction (EXEC-SPEC §WS_GUARDS).
// Those actions bypass the standard staff auth chain — no staff binding exists yet
// at registration/bootstrap time.
export async function requireApprovedPilotSession(
  supabase: SupabaseClient<Database>,
  opts?: RequireApprovedPilotSessionOpts,
): Promise<{ email: string }> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    throw new DomainError('UNAUTHORIZED', 'Authentication required');
  }

  const canonical = canonicalizeEmail(user.email);

  // Allowlist check: service-role client (no SELECT policy for authenticated role).
  const serviceClient = createServiceClient();
  const result = await checkAllowlistGate(serviceClient, canonical);

  if (result !== 'approved') {
    throw new DomainError('FORBIDDEN', 'Pilot access required');
  }

  // Provisioning authorization check — only when explicitly requested.
  if (opts?.requireProvisioningAuth) {
    const adminEmails = (process.env.PILOT_ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    // Fail closed: unset or empty PILOT_ADMIN_EMAILS denies all provisioning access.
    if (adminEmails.length === 0 || !adminEmails.includes(canonical)) {
      throw new DomainError('FORBIDDEN', 'Provisioning authorization required');
    }
  }

  return { email: canonical };
}
