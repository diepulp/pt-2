/**
 * tia-inventory-only-seed.ts — EXEC-owned deterministic seed for the PRD-091 WS4
 * browser acceptance test (QA-006 Mode B).
 *
 * Builds the cheapest deterministic world that renders a canonical Table
 * Inventory Accounting result on the Pit Terminal Inventory/Rundown surface:
 *
 *   company → casino → casino_settings → pit_boss staff (+ auth user, ADR-024
 *   two-phase claims) → ONE active gaming_table → ONE RUNDOWN table_session with
 *   linked opening + closing inventory snapshots and NO qualifying drop telemetry.
 *
 * The derivation (services/table-context/table-inventory-accounting.ts) therefore
 * resolves opener + closer, finds telemetry absent, and yields:
 *   calculation_kind = 'inventory_only'
 *   partial_table_result_cents = closing + credits − opening − fills
 *                              = 100000 + 0 − 30000 − 0 = 70000  → "$700"
 *
 * RUNDOWN (not CLOSED) is required because rpc_get_current_table_session only
 * returns OPEN/ACTIVE/RUNDOWN, and the pit page auto-selects the casino's single
 * table — so the operator journey reaches the surface with no extra navigation.
 *
 * @see PRD-091 §6 / Appendix A.3, EXEC-091 WS4, FIB F.5, QA-006 §3
 * @see services/table-context/__tests__/fixtures/tia-seed.ts (integration sibling)
 */

import { randomUUID } from 'crypto';

import { createServiceClient } from '../../fixtures/auth';

/** Canonical rendered value for this seed: 70000 cents → "$700". */
export const EXPECTED_PARTIAL_RESULT_DISPLAY = '$700';

const OPENING_TOTAL_CENTS = 30000; // $300
const CLOSING_TOTAL_CENTS = 100000; // $1,000

export interface TiaInventoryOnlySeed {
  casinoId: string;
  tableId: string;
  sessionId: string;
  /** Pit boss credentials for Mode B browser login. */
  testEmail: string;
  testPassword: string;
  /** Deterministic display value the RundownSummaryPanel must render. */
  expectedResultDisplay: string;
  cleanup: () => Promise<void>;
}

export async function createTiaInventoryOnlySeed(): Promise<TiaInventoryOnlySeed> {
  const supabase = createServiceClient();
  const tag = `e2e_tia_${randomUUID().slice(0, 8)}`;
  const testEmail = `${tag}@test.com`;
  const testPassword = 'TestPassword123!';

  // ── company → casino → settings ────────────────────────────────────────────
  const { data: company, error: companyErr } = await supabase
    .from('company')
    .insert({ name: `${tag}_company` })
    .select('id')
    .single();
  if (companyErr || !company) {
    throw new Error(`seed company: ${companyErr?.message}`);
  }

  const { data: casino, error: casinoErr } = await supabase
    .from('casino')
    .insert({ name: `${tag}_casino`, status: 'active', company_id: company.id })
    .select('id')
    .single();
  if (casinoErr || !casino) {
    throw new Error(`seed casino: ${casinoErr?.message}`);
  }

  const { error: settingsErr } = await supabase.from('casino_settings').insert({
    casino_id: casino.id,
    gaming_day_start_time: '06:00:00',
    timezone: 'America/Los_Angeles',
  });
  if (settingsErr) {
    throw new Error(`seed casino_settings: ${settingsErr.message}`);
  }

  // ── pit_boss auth user + staff (ADR-024 two-phase claims) ───────────────────
  const { data: authData, error: authErr } =
    await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      app_metadata: { casino_id: casino.id, staff_role: 'pit_boss' },
    });
  if (authErr || !authData.user) {
    throw new Error(`seed auth user: ${authErr?.message}`);
  }
  const authUserId = authData.user.id;

  const { data: staff, error: staffErr } = await supabase
    .from('staff')
    .insert({
      casino_id: casino.id,
      user_id: authUserId,
      first_name: 'WS4',
      last_name: 'PitBoss',
      email: testEmail,
      role: 'pit_boss',
      status: 'active',
    })
    .select('id')
    .single();
  if (staffErr || !staff) {
    throw new Error(`seed staff: ${staffErr?.message}`);
  }

  // Phase 2: stamp staff_id into claims (RLS context derivation).
  const { error: stampErr } = await supabase.auth.admin.updateUserById(
    authUserId,
    {
      app_metadata: {
        casino_id: casino.id,
        staff_id: staff.id,
        staff_role: 'pit_boss',
      },
    },
  );
  if (stampErr) {
    throw new Error(`stamp claims: ${stampErr.message}`);
  }

  // Pilot allowlist gate (/start): approve this email so the post-login gateway
  // never diverts to /request-access. In dev mode the gate is bypassed, but
  // approving makes the seed robust to NODE_ENV. The active staff binding above
  // means /start redirects to /pit on THIS casino (not the demo auto-bind path).
  const { error: allowlistErr } = await supabase
    .from('approved_email_allowlist')
    .insert({ email: testEmail, status: 'active' });
  if (allowlistErr) {
    throw new Error(`seed approved_email_allowlist: ${allowlistErr.message}`);
  }

  // ── one active gaming_table ─────────────────────────────────────────────────
  const { data: table, error: tableErr } = await supabase
    .from('gaming_table')
    .insert({
      casino_id: casino.id,
      label: `${tag}_table`,
      type: 'blackjack',
      pit: 'PIT-A',
      status: 'active',
    })
    .select('id')
    .single();
  if (tableErr || !table) {
    throw new Error(`seed gaming_table: ${tableErr?.message}`);
  }

  // ── RUNDOWN session (non-closed → returned by rpc_get_current_table_session) ─
  const { data: session, error: sessionErr } = await supabase
    .from('table_session')
    .insert({
      casino_id: casino.id,
      gaming_table_id: table.id,
      opened_by_staff_id: staff.id,
      opened_at: '2026-06-01T06:00:00.000Z',
      closed_at: null,
      status: 'RUNDOWN',
      gaming_day: '2026-06-01',
    })
    .select('id')
    .single();
  if (sessionErr || !session) {
    throw new Error(`seed table_session: ${sessionErr?.message}`);
  }

  // ── opening + closing snapshots, then link FKs ──────────────────────────────
  async function seedSnapshot(
    type: 'open' | 'close',
    totalCents: number,
    createdAt: string,
  ): Promise<string> {
    const { data, error } = await supabase
      .from('table_inventory_snapshot')
      .insert({
        casino_id: casino!.id,
        table_id: table!.id,
        session_id: session!.id,
        counted_by: staff!.id,
        snapshot_type: type,
        total_cents: totalCents,
        chipset: {},
        created_at: createdAt,
      })
      .select('id')
      .single();
    if (error || !data) {
      throw new Error(`seed snapshot (${type}): ${error?.message}`);
    }
    return data.id;
  }

  const openingSnapshotId = await seedSnapshot(
    'open',
    OPENING_TOTAL_CENTS,
    '2026-06-01T06:05:00.000Z',
  );
  const closingSnapshotId = await seedSnapshot(
    'close',
    CLOSING_TOTAL_CENTS,
    '2026-06-01T12:00:00.000Z',
  );

  const { error: linkErr } = await supabase
    .from('table_session')
    .update({
      opening_inventory_snapshot_id: openingSnapshotId,
      closing_inventory_snapshot_id: closingSnapshotId,
    })
    .eq('id', session.id);
  if (linkErr) {
    throw new Error(`link session snapshots: ${linkErr.message}`);
  }

  // ── cleanup — scoped to created IDs, reverse FK order ────────────────────────
  const cleanup = async () => {
    await supabase
      .from('table_session')
      .update({
        opening_inventory_snapshot_id: null,
        closing_inventory_snapshot_id: null,
      })
      .eq('id', session.id);
    await supabase
      .from('table_inventory_snapshot')
      .delete()
      .in('id', [openingSnapshotId, closingSnapshotId]);
    await supabase.from('table_session').delete().eq('id', session.id);
    await supabase.from('gaming_table').delete().eq('id', table.id);
    await supabase.from('staff').delete().eq('id', staff.id);
    await supabase
      .from('approved_email_allowlist')
      .delete()
      .eq('email', testEmail);
    await supabase.from('casino_settings').delete().eq('casino_id', casino.id);
    await supabase.from('casino').delete().eq('id', casino.id);
    await supabase.from('company').delete().eq('id', company.id);
    await supabase.auth.admin.deleteUser(authUserId);
  };

  return {
    casinoId: casino.id,
    tableId: table.id,
    sessionId: session.id,
    testEmail,
    testPassword,
    expectedResultDisplay: EXPECTED_PARTIAL_RESULT_DISPLAY,
    cleanup,
  };
}

/**
 * Mints a real magic-link token for `email` and returns the `/auth/confirm`
 * path that establishes a genuine browser session (Mode B).
 *
 * `admin.generateLink` is the email-inbox substitute — the same category of
 * admin API every fixture already uses for `createUser`. Authentication still
 * runs through the real `/auth/confirm` route (Supabase `verifyOtp`), which sets
 * the real session cookies; this is NOT a Mode A dev-auth bypass and NOT a
 * direct Mode C client (R-3). Navigating to `next=/start` lets the post-login
 * gateway resolve the active staff binding and redirect to `/pit`.
 */
export async function createModeBConfirmPath(
  email: string,
  next = '/start',
): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const hashedToken = data?.properties?.hashed_token;
  if (error || !hashedToken) {
    throw new Error(`generateLink magiclink: ${error?.message ?? 'no token'}`);
  }
  return `/auth/confirm?token_hash=${hashedToken}&type=magiclink&next=${encodeURIComponent(
    next,
  )}`;
}
