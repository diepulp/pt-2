/**
 * Pit Dashboard Page
 *
 * Main operational interface for pit bosses to manage gaming tables,
 * active rating slips, and player sessions.
 *
 * Pattern: Server Component that fetches auth context, then delegates
 * to client component for interactive state.
 *
 * DEV MODE: When NODE_ENV=development, uses DEV_RLS_CONTEXT.casinoId
 * if auth fails. This allows development without login.
 *
 * @see PRD-006 Pit Dashboard UI
 * @see EXECUTION-SPEC-PRD-006.md WS2
 */

import { redirect } from "next/navigation";

import { PitDashboardClient } from "@/components/dashboard/pit-dashboard-client";
import {
  DEV_RLS_CONTEXT,
  isDevAuthBypassEnabled,
} from "@/lib/supabase/dev-context";
import { getAuthContext } from "@/lib/supabase/rls-context";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PitPage() {
  let casinoId: string;

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
    } catch (error) {
      console.error("Failed to get auth context:", error);
      redirect("/auth/login");
    }
  } else if (isDevAuthBypassEnabled()) {
    // DEV MODE: Use mock context

    console.warn("[DEV AUTH] Using mock casinoId for dashboard");
    casinoId = DEV_RLS_CONTEXT.casinoId;
  } else {
    // PRODUCTION: Redirect to login
    redirect("/auth/login");
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold uppercase tracking-widest"
            style={{ fontFamily: "monospace" }}
          >
            Pit Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time table operations and floor overview
          </p>
        </div>
      </div>

      {/* Dashboard Content (Client Component) */}
      <PitDashboardClient casinoId={casinoId} />
    </div>
  );
}
