/**
 * Compliance Dashboard Page
 *
 * MTL (Monetary Transaction Log) compliance dashboard for AML/CTR tracking.
 * Shows Gaming Day Summary (authoritative compliance view) and entry details.
 *
 * Access: pit_boss, admin only (per ADR-025)
 *
 * Pattern: Server Component that fetches auth context, then delegates
 * to client component for interactive state.
 *
 * @see PRD-005 MTL Service
 * @see ADR-025 MTL Authorization Model
 */

import { redirect } from 'next/navigation';

import { ComplianceDashboard } from '@/components/mtl/compliance-dashboard';
import {
  DEV_RLS_CONTEXT,
  isDevAuthBypassEnabled,
} from '@/lib/supabase/dev-context';
import { getAuthContext } from '@/lib/supabase/rls-context';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function CompliancePage() {
  let casinoId: string;
  let staffId: string | undefined;
  let staffRole: string | undefined;

  // Try to get auth context
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // User is authenticated - get real context
    try {
      const context = await getAuthContext(supabase);
      casinoId = context.casinoId;
      staffId = context.actorId ?? undefined;
      staffRole = context.staffRole ?? undefined;
    } catch (error) {
      console.error('Failed to get auth context:', error);
      redirect('/auth/login');
    }
  } else if (isDevAuthBypassEnabled()) {
    // DEV MODE: Use mock context
    console.warn('[DEV AUTH] Using mock context for compliance dashboard');
    casinoId = DEV_RLS_CONTEXT.casinoId;
    staffId = DEV_RLS_CONTEXT.actorId;
    staffRole = DEV_RLS_CONTEXT.staffRole;
  } else {
    // PRODUCTION: Redirect to login
    redirect('/auth/login');
  }

  // Role check: only pit_boss and admin can access compliance dashboard
  const allowedRoles = ['pit_boss', 'admin'];
  if (staffRole && !allowedRoles.includes(staffRole)) {
    // Redirect unauthorized roles
    redirect('/pit');
  }

  // Check if user can add audit notes (pit_boss, admin only per ADR-025)
  const canAddNotes = staffRole === 'pit_boss' || staffRole === 'admin';

  return (
    <div className="space-y-4">
      <ComplianceDashboard
        casinoId={casinoId}
        staffId={staffId}
        canAddNotes={canAddNotes}
      />
    </div>
  );
}
