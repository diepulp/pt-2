/**
 * Pilot Access Request Review — Internal Admin Surface
 *
 * Surface Classification (ADR-041 §5.2):
 *   Rendering Delivery: RSC Prefetch — server-authoritative list required before interaction.
 *   Data Aggregation:   Simple Query — single table, service-role read, no cross-context aggregation.
 *   Rejected: Client Shell — list must be server-authoritative; stale client fetch risks wrong state.
 *   Rejected: BFF RPC — single bounded context, no aggregation needed.
 *   Metric Provenance:  None — no truth-bearing metrics rendered.
 */

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { canonicalizeEmail, listPendingRequests } from '@/services/pilot/crud';
import type { PilotAccessRequestDTO } from '@/services/pilot/dtos';

import { PilotReviewTable } from './pilot-review-table';

export const dynamic = 'force-dynamic';

export default async function PilotReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect('/signin');
  }

  // Admin authority check (DEC-1) — mirrors requirePilotAdminSession guard
  const adminEmails = (process.env.PILOT_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const canonical = canonicalizeEmail(user.email);

  if (!adminEmails.includes(canonical)) {
    // Non-revealing redirect for authenticated non-admin users (RULE-9)
    redirect('/request-access');
  }

  const serviceClient = createServiceClient();
  let requests: PilotAccessRequestDTO[] = [];
  try {
    requests = await listPendingRequests(serviceClient);
  } catch {
    // Render with empty list — surface still loads; individual error handled inline
    requests = [];
  }

  return (
    <div className="min-h-screen bg-background p-6 sm:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_hsl(var(--accent)/0.5)]" />
          <h1
            className="text-lg font-bold uppercase tracking-widest text-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            Pilot Access Requests
          </h1>
          <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-accent">
            {requests.length} pending
          </span>
        </div>

        <PilotReviewTable requests={requests} />
      </div>
    </div>
  );
}
