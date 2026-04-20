/**
 * ADR-050 Phase 1 Exemplar — Shift Dashboard E2E Fixture
 *
 * Produces a minimal scenario suitable for the PRD-068 W3 probes:
 *   - Company + casino + staff + auth user with Pattern C app_metadata
 *   - A gaming table under the casino so the dashboard has a row surface
 *   - Helper to insert a rated buy-in via rpc_create_financial_txn (Mode B
 *     probe will drive this through the UI; scenario is used for setup)
 *
 * This fixture is intentionally a thin wrapper around the existing
 * `createShiftDashboardScenario()` in e2e/fixtures/shift-dashboard-helpers.ts.
 * If the ADR-050 pilot grows beyond one fact×surface pair, expand here.
 *
 * @see PRD-068 / EXEC-068 W3
 * @see e2e/fixtures/shift-dashboard-helpers.ts
 */

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import {
  createShiftDashboardScenario,
  type ShiftDashboardTestScenario,
} from '../../fixtures/shift-dashboard-helpers';

export type AdrTest050Scenario = ShiftDashboardTestScenario & {
  /** ID of a gaming table owned by the scenario casino. Created lazily. */
  gamingTableId: string;
  /** Creates a minimal rated-buyin telemetry entry directly via service role
   *  (used for probes that do NOT need to exercise the UI buy-in flow). */
  insertRatedBuyinTelemetry: (amountCents: number) => Promise<void>;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function serviceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createAdr050Scenario(): Promise<AdrTest050Scenario> {
  const base = await createShiftDashboardScenario();
  const supabase = serviceClient();

  const { data: table, error: tableError } = await supabase
    .from('gaming_table')
    .insert({
      label: `adr050-table-${Date.now()}`,
      casino_id: base.casinoId,
      type: 'blackjack',
      pit: 'adr050-pit',
    })
    .select('id')
    .single();
  if (tableError || !table) {
    throw new Error(
      `fixture: failed to create gaming_table: ${tableError?.message}`,
    );
  }
  const tableId: string = table.id;

  async function insertRatedBuyinTelemetry(amountCents: number): Promise<void> {
    const now = new Date();
    const { error } = await supabase.from('table_buyin_telemetry').insert({
      casino_id: base.casinoId,
      table_id: tableId,
      actor_id: base.staffId,
      amount_cents: amountCents,
      gaming_day: now.toISOString().slice(0, 10),
      occurred_at: now.toISOString(),
      telemetry_kind: 'rated_buyin',
      source: 'e2e-adr050-fixture',
    });
    if (error) {
      throw new Error(`fixture: failed to insert telemetry: ${error.message}`);
    }
  }

  const original = base.cleanup;
  return {
    ...base,
    gamingTableId: tableId,
    insertRatedBuyinTelemetry,
    cleanup: async () => {
      // gaming_table + telemetry rows cascade via casino FK in base cleanup.
      await original();
    },
  };
}
