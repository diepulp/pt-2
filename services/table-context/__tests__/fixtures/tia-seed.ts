/**
 * tia-seed.ts — EXEC-owned seed/fixture helpers for the TableInventoryAccounting
 * database-backed integration suite (PRD-091 WS1).
 *
 * Builds a real "world" (company → casino → settings → staff → gaming_table) plus
 * a second casino/table for cross-identity (R-5) negative cases, and provides
 * row-level seeders for sessions, snapshots, fills, credits, and telemetry that
 * exercise the canonical derivation against real Postgres behavior.
 *
 * Identity columns are passed explicitly per row so tests can intentionally seed
 * mismatched-identity rows (target session_id but wrong casino/table) to prove the
 * service rejects input-identity pollution.
 *
 * @see services/table-context/table-inventory-accounting.ts
 * @see PRD-091 Appendix A.1, EXEC-091 WS1, ADR-059/060/061, SRL-TIA-001
 */

/*
 * ADR-034 exemption: test-only seed helper. The service-layer ESLint block
 * (eslint.config.mjs) already exempts test files (`*.test.ts`/`*.spec.ts`) from
 * `no-direct-template2b-dml`; this fixture lives under `__tests__/` and seeds a
 * local integration DB with the service client — the SEC-001-sanctioned
 * "allowed in tests" path, identical to the existing e2e/fixtures/* helpers. It
 * is not production code and never runs against a real RLS request context.
 */
/* eslint-disable custom-rules/no-direct-template2b-dml */

import { randomUUID } from 'crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../../types/database.types';

export type SetupClient = SupabaseClient<Database>;

export interface TiaWorld {
  companyId: string;
  casinoId: string;
  staffId: string;
  /** Primary table under casinoId. */
  tableId: string;
  /** A second table under the SAME casino (for other-table exclusion). */
  table2Id: string;
  /** A different casino (for cross-casino exclusion). */
  otherCasinoId: string;
  /** A table under otherCasinoId (for cross-casino exclusion). */
  otherTableId: string;
  cleanup: () => Promise<void>;
}

let worldSeq = 0;

/**
 * Bootstrap the minimal real entity graph the derivation reads against.
 * Uses the service-role client (RLS-bypassing) — WS1 proves the derivation's
 * identity-scoping SQL, not RLS (that is WS2's boundary proof).
 */
export async function createTiaWorld(setup: SetupClient): Promise<TiaWorld> {
  const tag = `PRD091-WS1-${Date.now()}-${worldSeq++}`;

  const { data: company, error: companyErr } = await setup
    .from('company')
    .insert({ name: `${tag} Co` })
    .select('id')
    .single();
  if (companyErr) throw new Error(`seed company: ${companyErr.message}`);
  const companyId = company!.id;

  async function makeCasino(name: string): Promise<string> {
    const { data, error } = await setup
      .from('casino')
      .insert({ name, company_id: companyId })
      .select('id')
      .single();
    if (error) throw new Error(`seed casino: ${error.message}`);
    await setup.from('casino_settings').insert({
      casino_id: data!.id,
      gaming_day_start_time: '06:00',
      timezone: 'America/Los_Angeles',
    });
    return data!.id;
  }

  const casinoId = await makeCasino(`${tag} Casino`);
  const otherCasinoId = await makeCasino(`${tag} OtherCasino`);

  async function makeTable(cId: string, label: string): Promise<string> {
    const { data, error } = await setup
      .from('gaming_table')
      .insert({
        casino_id: cId,
        label,
        type: 'blackjack',
        pit: 'PIT-A',
        status: 'active',
      })
      .select('id')
      .single();
    if (error) throw new Error(`seed gaming_table: ${error.message}`);
    return data!.id;
  }

  const tableId = await makeTable(casinoId, `${tag}-T1`);
  const table2Id = await makeTable(casinoId, `${tag}-T2`);
  const otherTableId = await makeTable(otherCasinoId, `${tag}-OT1`);

  // Staff (pit_boss) — used as counted_by / opened_by_staff_id FK targets.
  const userId = randomUUID();
  const { data: user } = await setup.auth.admin.createUser({
    email: `${tag}@test.com`.toLowerCase(),
    password: 'TestPassword123!',
    email_confirm: true,
  });
  const authUserId = user?.user?.id ?? userId;

  const { data: staff, error: staffErr } = await setup
    .from('staff')
    .insert({
      user_id: authUserId,
      casino_id: casinoId,
      role: 'pit_boss',
      first_name: 'WS1',
      last_name: 'PitBoss',
      status: 'active',
    })
    .select('id')
    .single();
  if (staffErr) throw new Error(`seed staff: ${staffErr.message}`);
  const staffId = staff!.id;

  async function cleanup(): Promise<void> {
    // Dependency order: leaf rows first.
    for (const cId of [casinoId, otherCasinoId]) {
      await setup.from('table_buyin_telemetry').delete().eq('casino_id', cId);
      await setup.from('table_fill').delete().eq('casino_id', cId);
      await setup.from('table_credit').delete().eq('casino_id', cId);
    }
    // Break session<->snapshot FKs before deleting either.
    await setup
      .from('table_session')
      .update({
        opening_inventory_snapshot_id: null,
        closing_inventory_snapshot_id: null,
      })
      .in('casino_id', [casinoId, otherCasinoId]);
    for (const cId of [casinoId, otherCasinoId]) {
      await setup
        .from('table_inventory_snapshot')
        .delete()
        .eq('casino_id', cId);
      await setup.from('table_session').delete().eq('casino_id', cId);
      await setup.from('gaming_table').delete().eq('casino_id', cId);
      await setup.from('staff').delete().eq('casino_id', cId);
      await setup.from('casino_settings').delete().eq('casino_id', cId);
      await setup.from('casino').delete().eq('id', cId);
    }
    await setup.from('company').delete().eq('id', companyId);
    if (user?.user?.id) {
      await setup.auth.admin.deleteUser(user.user.id);
    }
  }

  return {
    companyId,
    casinoId,
    staffId,
    tableId,
    table2Id,
    otherCasinoId,
    otherTableId,
    cleanup,
  };
}

// ── Row seeders ───────────────────────────────────────────────────────────────

export interface SeedSessionInput {
  casinoId: string;
  tableId: string;
  staffId: string;
  openedAt?: string;
  closedAt?: string | null;
  status?: Database['public']['Enums']['table_session_status'];
  gamingDay?: string;
}

/** Insert a bare table_session (snapshot FKs left null; link them afterwards). */
export async function seedSession(
  setup: SetupClient,
  input: SeedSessionInput,
): Promise<string> {
  const { data, error } = await setup
    .from('table_session')
    .insert({
      casino_id: input.casinoId,
      gaming_table_id: input.tableId,
      opened_by_staff_id: input.staffId,
      opened_at: input.openedAt ?? '2026-06-01T06:00:00.000Z',
      closed_at: input.closedAt ?? null,
      status: input.status ?? 'CLOSED',
      gaming_day: input.gamingDay ?? '2026-06-01',
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed table_session: ${error.message}`);
  return data!.id;
}

export interface SeedSnapshotInput {
  casinoId: string;
  tableId: string;
  sessionId: string | null;
  staffId: string;
  type: 'open' | 'close' | 'rundown';
  totalCents?: number | null;
  chipset?: Record<string, number>;
  createdAt?: string;
}

export async function seedSnapshot(
  setup: SetupClient,
  input: SeedSnapshotInput,
): Promise<string> {
  const { data, error } = await setup
    .from('table_inventory_snapshot')
    .insert({
      casino_id: input.casinoId,
      table_id: input.tableId,
      session_id: input.sessionId,
      counted_by: input.staffId,
      snapshot_type: input.type,
      total_cents: input.totalCents ?? null,
      chipset: input.chipset ?? {},
      created_at: input.createdAt ?? '2026-06-01T06:05:00.000Z',
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed table_inventory_snapshot: ${error.message}`);
  return data!.id;
}

/** Point a session's opening/closing snapshot FKs at the given snapshot ids. */
export async function linkSessionSnapshots(
  setup: SetupClient,
  sessionId: string,
  openingSnapshotId: string | null,
  closingSnapshotId: string | null,
): Promise<void> {
  const { error } = await setup
    .from('table_session')
    .update({
      opening_inventory_snapshot_id: openingSnapshotId,
      closing_inventory_snapshot_id: closingSnapshotId,
    })
    .eq('id', sessionId);
  if (error) throw new Error(`link session snapshots: ${error.message}`);
}

export interface SeedFillCreditInput {
  casinoId: string;
  tableId: string;
  sessionId: string | null;
  confirmedAmountCents?: number | null;
  amountCents?: number;
  status?: 'requested' | 'confirmed';
}

export async function seedFill(
  setup: SetupClient,
  input: SeedFillCreditInput,
): Promise<string> {
  const { data, error } = await setup
    .from('table_fill')
    .insert({
      casino_id: input.casinoId,
      table_id: input.tableId,
      session_id: input.sessionId,
      request_id: randomUUID(),
      chipset: {},
      amount_cents: input.amountCents ?? input.confirmedAmountCents ?? 0,
      confirmed_amount_cents: input.confirmedAmountCents ?? null,
      status: input.status ?? 'confirmed',
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed table_fill: ${error.message}`);
  return data!.id;
}

export async function seedCredit(
  setup: SetupClient,
  input: SeedFillCreditInput,
): Promise<string> {
  const { data, error } = await setup
    .from('table_credit')
    .insert({
      casino_id: input.casinoId,
      table_id: input.tableId,
      session_id: input.sessionId,
      request_id: randomUUID(),
      chipset: {},
      amount_cents: input.amountCents ?? input.confirmedAmountCents ?? 0,
      confirmed_amount_cents: input.confirmedAmountCents ?? null,
      status: input.status ?? 'confirmed',
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed table_credit: ${error.message}`);
  return data!.id;
}

// ── Mode C role users (WS2 route boundary) ─────────────────────────────────────

export interface RoleUser {
  userId: string;
  staffId: string;
  email: string;
  password: string;
  role: string;
}

/**
 * Create an active staff member + auth user with stamped identity claims
 * (two-phase ADR-024: staff row first, then stamp staff_id into app_metadata).
 * The returned email/password sign in via the real cookie/JWT path (Mode C).
 */
export async function createRoleUser(
  setup: SetupClient,
  input: { casinoId: string; role: string; password?: string },
): Promise<RoleUser> {
  const password = input.password ?? 'ModeCPassword123!';
  const email = `ws2-${input.role}-${Date.now()}-${worldSeq++}@test.com`;

  const { data: user, error: userErr } = await setup.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr || !user?.user) {
    throw userErr ?? new Error('createRoleUser: failed to create auth user');
  }
  const userId = user.user.id;

  const { data: staff, error: staffErr } = await setup
    .from('staff')
    .insert({
      user_id: userId,
      casino_id: input.casinoId,
      role: input.role as Database['public']['Enums']['staff_role'],
      first_name: 'WS2',
      last_name: input.role,
      status: 'active',
    })
    .select('id')
    .single();
  if (staffErr) throw new Error(`createRoleUser staff: ${staffErr.message}`);
  const staffId = staff!.id;

  const { error: stampErr } = await setup.auth.admin.updateUserById(userId, {
    app_metadata: {
      staff_id: staffId,
      casino_id: input.casinoId,
      staff_role: input.role,
    },
  });
  if (stampErr) {
    await setup.auth.admin.deleteUser(userId);
    throw stampErr;
  }

  return { userId, staffId, email, password, role: input.role };
}

export interface SeedTelemetryInput {
  casinoId: string;
  tableId: string;
  staffId: string;
  amountCents: number;
  occurredAt: string;
  /** GRIND_BUYIN (no linkage) by default; RATED_BUYIN requires visit+slip. */
  kind?: 'RATED_BUYIN' | 'GRIND_BUYIN';
  gamingDay?: string;
}

export async function seedTelemetry(
  setup: SetupClient,
  input: SeedTelemetryInput,
): Promise<{ id: string | null; error: string | null }> {
  const kind = input.kind ?? 'GRIND_BUYIN';
  // Wave 2 finance_outbox catalog value (chk_tbt_event_type):
  // GRIND_BUYIN → grind.observed; RATED_BUYIN → buyin.observed.
  const eventType =
    kind === 'RATED_BUYIN' ? 'buyin.observed' : 'grind.observed';
  const { data, error } = await setup
    .from('table_buyin_telemetry')
    .insert({
      casino_id: input.casinoId,
      table_id: input.tableId,
      actor_id: input.staffId,
      event_type: eventType,
      telemetry_kind: kind,
      amount_cents: input.amountCents,
      occurred_at: input.occurredAt,
      gaming_day: input.gamingDay ?? '2026-06-01',
    })
    .select('id')
    .single();
  return { id: data?.id ?? null, error: error?.message ?? null };
}
