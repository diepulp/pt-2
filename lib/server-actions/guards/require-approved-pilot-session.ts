import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
// SERVICE_ROLE_EXEMPTION: PRD-083 — approved_email_allowlist has no SELECT RLS policy
// for any role by design (RULE-1). Allowlist gate reads must use service-role client.
import { createServiceClient } from '@/lib/supabase/service';
import { canonicalizeEmail, checkAllowlistGate } from '@/services/pilot/crud';
import type { Database } from '@/types/database.types';

// Pre-staff onboarding authorization guard.
// Verifies: authenticated Supabase session + active allowlist entry.
// Intentionally does NOT require a staff binding — onboarding is pre-staff.
// Valid ONLY for registerCompanyAction and bootstrapAction (EXEC-SPEC §4.3.1).
//
// This guard is the explicit replacement for the implicit skipAuth assumption.
// withServerAction(skipAuth:true) must still be used for the actions themselves
// because withAuth checks for a staff binding that does not yet exist at
// registration/bootstrap time.
export async function requireApprovedPilotSession(
  supabase: SupabaseClient<Database>,
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

  return { email: canonical };
}
