/** @jest-environment node */

/**
 * TableInventoryAccounting — Database-Backed Integration Tests (PRD-091 WS1)
 *
 * Proves the canonical derivation against REAL local Supabase/Postgres behavior —
 * no mocked Supabase client. Covers all PRD Appendix A.1 identity-hardened cases:
 * the three calculation kinds, null-vs-zero, telemetry window boundaries, input
 * identity pollution (R-5), and snapshot identity rejection.
 *
 * WS1 uses the service-role client to seed and to invoke derive(): the workstream
 * proves the derivation's identity-scoping SQL (the .eq() identity filters), not
 * RLS — RLS/route-boundary proof is WS2. The service applies explicit casino_id /
 * table_id / session_id filters that hold regardless of the client's RLS posture.
 *
 * PREREQUISITES:
 * - Local Supabase running: `npx supabase start`
 * - NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY set
 * - RUN_INTEGRATION_TESTS=true (or =1)
 *
 * @see services/table-context/table-inventory-accounting.ts
 * @see PRD-091 Appendix A.1, EXEC-091 WS1, ADR-059/060/061, SRL-TIA-001
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database.types';
import { createTableInventoryAccountingService } from '../table-inventory-accounting';

import {
  createTiaWorld,
  linkSessionSnapshots,
  seedCredit,
  seedFill,
  seedSession,
  seedSnapshot,
  seedTelemetry,
  type TiaWorld,
} from './fixtures/tia-seed';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isIntegrationEnvironment =
  !!supabaseUrl &&
  !!supabaseServiceKey &&
  (process.env.RUN_INTEGRATION_TESTS === 'true' ||
    process.env.RUN_INTEGRATION_TESTS === '1');

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

// Canonical session window (closed session → deterministic upper bound = closed_at).
const OPENED_AT = '2026-06-01T06:00:00.000Z';
const CLOSED_AT = '2026-06-01T14:00:00.000Z';
const IN_WINDOW = '2026-06-01T10:00:00.000Z';
const REQUEST_ID = 'req-ws1-int';

describeIntegration('PRD-091 WS1: Database-Backed TIA derivation', () => {
  let setup: SupabaseClient<Database>;
  let world: TiaWorld;

  function service() {
    return createTableInventoryAccountingService(setup);
  }

  /** Seed a fully-linked closed session with opener+closer snapshots via FK. */
  async function seedLinkedSession(opts: {
    openerCents?: number | null;
    closerCents?: number | null;
    openerChipset?: Record<string, number>;
    closerChipset?: Record<string, number>;
    closedAt?: string | null;
    status?: Database['public']['Enums']['table_session_status'];
  }): Promise<string> {
    const sessionId = await seedSession(setup, {
      casinoId: world.casinoId,
      tableId: world.tableId,
      staffId: world.staffId,
      openedAt: OPENED_AT,
      closedAt: opts.closedAt === undefined ? CLOSED_AT : opts.closedAt,
      status: opts.status ?? 'CLOSED',
    });
    let openerId: string | null = null;
    let closerId: string | null = null;
    if (opts.openerCents !== undefined || opts.openerChipset) {
      openerId = await seedSnapshot(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId,
        staffId: world.staffId,
        type: 'open',
        totalCents: opts.openerChipset ? null : (opts.openerCents ?? 0),
        chipset: opts.openerChipset,
        createdAt: '2026-06-01T06:05:00.000Z',
      });
    }
    if (opts.closerCents !== undefined || opts.closerChipset) {
      closerId = await seedSnapshot(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId,
        staffId: world.staffId,
        type: 'close',
        totalCents: opts.closerChipset ? null : (opts.closerCents ?? 0),
        chipset: opts.closerChipset,
        createdAt: '2026-06-01T14:05:00.000Z',
      });
    }
    await linkSessionSnapshots(setup, sessionId, openerId, closerId);
    return sessionId;
  }

  async function derive(sessionId: string, casinoId = world.casinoId) {
    return service().derive({
      tableSessionId: sessionId,
      casinoId,
      requestId: REQUEST_ID,
    });
  }

  /** Clear all per-test rows for both casinos between tests. */
  async function resetRows(): Promise<void> {
    for (const cId of [world.casinoId, world.otherCasinoId]) {
      await setup.from('table_buyin_telemetry').delete().eq('casino_id', cId);
      await setup.from('table_fill').delete().eq('casino_id', cId);
      await setup.from('table_credit').delete().eq('casino_id', cId);
    }
    await setup
      .from('table_session')
      .update({
        opening_inventory_snapshot_id: null,
        closing_inventory_snapshot_id: null,
      })
      .in('casino_id', [world.casinoId, world.otherCasinoId]);
    for (const cId of [world.casinoId, world.otherCasinoId]) {
      await setup
        .from('table_inventory_snapshot')
        .delete()
        .eq('casino_id', cId);
      await setup.from('table_session').delete().eq('casino_id', cId);
    }
  }

  beforeAll(async () => {
    setup = createClient<Database>(supabaseUrl!, supabaseServiceKey!);
    world = await createTiaWorld(setup);
  });

  afterEach(async () => {
    await resetRows();
  });

  afterAll(async () => {
    if (world) await world.cleanup();
  });

  // ── Three calculation kinds (A.1) ────────────────────────────────────────────

  describe('three calculation kinds derived from real rows', () => {
    it('telemetry_drop_formula: all five inputs resolved', async () => {
      const sessionId = await seedLinkedSession({
        openerCents: 500_000,
        closerCents: 480_000,
      });
      await seedFill(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId,
        confirmedAmountCents: 100_000,
      });
      await seedCredit(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId,
        confirmedAmountCents: 50_000,
      });
      await seedTelemetry(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        staffId: world.staffId,
        amountCents: 80_000,
        occurredAt: IN_WINDOW,
      });

      const r = await derive(sessionId);
      // projected = 80_000 + 480_000 + 50_000 - 500_000 - 100_000 = 10_000
      expect(r.calculation_kind).toBe('telemetry_drop_formula');
      expect(r.projected_table_win_loss_cents).toBe(BigInt(10_000));
      expect(r.partial_table_result_cents).toBeNull();
      expect(r.drop_estimate_state).toBe('present');
    });

    it('inventory_only: opener + closer resolved, telemetry absent', async () => {
      const sessionId = await seedLinkedSession({
        openerCents: 500_000,
        closerCents: 480_000,
      });
      await seedFill(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId,
        confirmedAmountCents: 100_000,
      });
      await seedCredit(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId,
        confirmedAmountCents: 50_000,
      });
      // No telemetry seeded.

      const r = await derive(sessionId);
      // partial = 480_000 + 50_000 - 500_000 - 100_000 = -70_000
      expect(r.calculation_kind).toBe('inventory_only');
      expect(r.partial_table_result_cents).toBe(BigInt(-70_000));
      expect(r.projected_table_win_loss_cents).toBeNull();
      expect(r.drop_estimate_state).toBe('absent');
    });

    it('integrity_failure: opener unresolvable after all paths', async () => {
      // Closer present, opener absent (no FK, no session-linked fallback).
      const sessionId = await seedLinkedSession({ closerCents: 480_000 });
      const r = await derive(sessionId);
      expect(r.calculation_kind).toBe('integrity_failure');
      expect(r.integrity_issues).toContain(
        'missing_opening_inventory_snapshot',
      );
      expect(r.projected_table_win_loss_cents).toBeNull();
      expect(r.partial_table_result_cents).toBeNull();
    });
  });

  // ── Explicit zero vs missing (A.1) ───────────────────────────────────────────

  it('explicit zero opener/closer are valid (not treated as missing)', async () => {
    const sessionId = await seedLinkedSession({
      openerCents: 0,
      closerCents: 0,
    });
    const r = await derive(sessionId);
    // partial = 0 + 0 - 0 - 0 = 0 (a real zero result, not integrity_failure)
    expect(r.calculation_kind).toBe('inventory_only');
    expect(r.partial_table_result_cents).toBe(BigInt(0));
    expect(r.integrity_issues).toHaveLength(0);
  });

  // ── Null-vs-zero telemetry (A.1) ─────────────────────────────────────────────

  describe('null-vs-zero telemetry distinction', () => {
    it('zero qualifying telemetry rows → drop estimate null / absent', async () => {
      const sessionId = await seedLinkedSession({
        openerCents: 100_000,
        closerCents: 100_000,
      });
      const r = await derive(sessionId);
      expect(r.telemetry_derived_drop_estimate_cents).toBeNull();
      expect(r.drop_estimate_state).toBe('absent');
      expect(r.calculation_kind).toBe('inventory_only');
    });

    it('rows summing to zero is DB-prevented (amount_cents > 0 CHECK) — the null vs present-nonzero boundary is what real rows can express', async () => {
      // The "rows summing to zero" arm of null-vs-zero is structurally impossible
      // at the DB level: chk_amount_positive forbids amount_cents <= 0. Prove the
      // constraint, so the distinction reduces to "zero rows → null" (above) vs
      // "≥1 row → present, strictly positive sum".
      const sessionId = await seedLinkedSession({
        openerCents: 100_000,
        closerCents: 100_000,
      });
      const zero = await seedTelemetry(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        staffId: world.staffId,
        amountCents: 0,
        occurredAt: IN_WINDOW,
      });
      expect(zero.error).not.toBeNull();
      expect(zero.id).toBeNull();

      await seedTelemetry(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        staffId: world.staffId,
        amountCents: 1,
        occurredAt: IN_WINDOW,
      });
      const r = await derive(sessionId);
      expect(r.telemetry_derived_drop_estimate_cents).toBe(BigInt(1));
      expect(r.drop_estimate_state).toBe('present');
    });
  });

  // ── Telemetry window & identity exclusion (A.1) ──────────────────────────────

  describe('telemetry window and table identity', () => {
    async function baseSession() {
      return seedLinkedSession({ openerCents: 0, closerCents: 0 });
    }

    it('telemetry before the lower bound is excluded', async () => {
      const sessionId = await baseSession();
      await seedTelemetry(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        staffId: world.staffId,
        amountCents: 5_000,
        occurredAt: '2026-06-01T05:59:59.000Z',
      });
      const r = await derive(sessionId);
      expect(r.drop_estimate_state).toBe('absent');
    });

    it('lower timestamp boundary is inclusive (occurred_at == opened_at)', async () => {
      const sessionId = await baseSession();
      await seedTelemetry(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        staffId: world.staffId,
        amountCents: 5_000,
        occurredAt: OPENED_AT,
      });
      const r = await derive(sessionId);
      expect(r.drop_estimate_state).toBe('present');
      expect(r.telemetry_derived_drop_estimate_cents).toBe(BigInt(5_000));
    });

    it('closed-session upper boundary is exclusive (occurred_at == closed_at)', async () => {
      const sessionId = await baseSession();
      await seedTelemetry(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        staffId: world.staffId,
        amountCents: 5_000,
        occurredAt: CLOSED_AT,
      });
      const r = await derive(sessionId);
      expect(r.drop_estimate_state).toBe('absent');
    });

    it('telemetry outside the window (after upper bound) is excluded — another session window', async () => {
      const sessionId = await baseSession();
      await seedTelemetry(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        staffId: world.staffId,
        amountCents: 5_000,
        occurredAt: '2026-06-01T15:00:00.000Z',
      });
      const r = await derive(sessionId);
      expect(r.drop_estimate_state).toBe('absent');
    });

    it('telemetry on another table is excluded', async () => {
      const sessionId = await baseSession();
      await seedTelemetry(setup, {
        casinoId: world.casinoId,
        tableId: world.table2Id, // same casino, different table
        staffId: world.staffId,
        amountCents: 5_000,
        occurredAt: IN_WINDOW,
      });
      const r = await derive(sessionId);
      expect(r.drop_estimate_state).toBe('absent');
    });

    it('RATED_ADJUSTMENT telemetry cannot exist (CHECK constraint) — exclusion is enforced at the DB and by the service predicate', async () => {
      const adj = await seedTelemetry(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        staffId: world.staffId,
        amountCents: 5_000,
        occurredAt: IN_WINDOW,
        kind: 'RATED_ADJUSTMENT' as never,
      });
      expect(adj.error).not.toBeNull();
      expect(adj.id).toBeNull();
    });
  });

  // ── Input identity pollution: fills / credits (R-5, A.1) ─────────────────────

  describe('fills/credits input identity (R-5)', () => {
    it('confirmed fills/credits with target session_id but mismatched casino_id do NOT contribute', async () => {
      const sessionId = await seedLinkedSession({
        openerCents: 100_000,
        closerCents: 100_000,
      });
      // Mismatched casino (other casino, other table) but the target session_id.
      await seedFill(setup, {
        casinoId: world.otherCasinoId,
        tableId: world.otherTableId,
        sessionId,
        confirmedAmountCents: 999_999,
      });
      await seedCredit(setup, {
        casinoId: world.otherCasinoId,
        tableId: world.otherTableId,
        sessionId,
        confirmedAmountCents: 999_999,
      });
      const r = await derive(sessionId);
      // partial = 100_000 - 100_000 = 0; pollution rows excluded.
      expect(r.partial_table_result_cents).toBe(BigInt(0));
    });

    it('confirmed fills/credits with target session_id but mismatched table_id do NOT contribute', async () => {
      const sessionId = await seedLinkedSession({
        openerCents: 100_000,
        closerCents: 100_000,
      });
      await seedFill(setup, {
        casinoId: world.casinoId,
        tableId: world.table2Id, // same casino, wrong table
        sessionId,
        confirmedAmountCents: 777_777,
      });
      const r = await derive(sessionId);
      expect(r.partial_table_result_cents).toBe(BigInt(0));
    });

    it('confirmed fills/credits on this casino/table but a different session_id do NOT contribute', async () => {
      const sessionId = await seedLinkedSession({
        openerCents: 100_000,
        closerCents: 100_000,
      });
      const otherSession = await seedSession(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        staffId: world.staffId,
        openedAt: OPENED_AT,
        closedAt: CLOSED_AT,
      });
      await seedFill(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId: otherSession,
        confirmedAmountCents: 555_555,
      });
      const r = await derive(sessionId);
      expect(r.partial_table_result_cents).toBe(BigInt(0));
    });

    it('only confirmed fills contribute — requested (unconfirmed) excluded', async () => {
      const sessionId = await seedLinkedSession({
        openerCents: 100_000,
        closerCents: 100_000,
      });
      await seedFill(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId,
        confirmedAmountCents: 40_000,
        status: 'requested',
      });
      const r = await derive(sessionId);
      // requested fill excluded → partial = 100_000 - 100_000 - 0 = 0
      expect(r.partial_table_result_cents).toBe(BigInt(0));
    });
  });

  // ── Snapshot identity rejection (R-5, A.1) ───────────────────────────────────

  describe('snapshot identity rejection (R-5)', () => {
    it('snapshot FK with matching session_id but wrong snapshot_type is rejected for that side', async () => {
      const sessionId = await seedSession(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        staffId: world.staffId,
        openedAt: OPENED_AT,
        closedAt: CLOSED_AT,
      });
      // Opener FK points at a snapshot whose type is 'close' (wrong for the open side).
      const wrongTypeSnap = await seedSnapshot(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId,
        staffId: world.staffId,
        type: 'close',
        totalCents: 123_456,
      });
      const closer = await seedSnapshot(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId,
        staffId: world.staffId,
        type: 'close',
        totalCents: 480_000,
        createdAt: '2026-06-01T14:05:00.000Z',
      });
      await linkSessionSnapshots(setup, sessionId, wrongTypeSnap, closer);

      const r = await derive(sessionId);
      // Opener side cannot resolve (wrong type rejected, no valid 'open' fallback).
      expect(r.calculation_kind).toBe('integrity_failure');
      expect(r.integrity_issues).toContain(
        'missing_opening_inventory_snapshot',
      );
    });

    it('snapshot with mismatched casino/table cannot produce a financial result', async () => {
      const sessionId = await seedSession(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        staffId: world.staffId,
        openedAt: OPENED_AT,
        closedAt: CLOSED_AT,
      });
      // Opener snapshot carries the target session_id + correct type, but a
      // DIFFERENT casino/table identity. It must be rejected, not computed.
      const pollutedOpener = await seedSnapshot(setup, {
        casinoId: world.otherCasinoId,
        tableId: world.otherTableId,
        sessionId,
        staffId: world.staffId,
        type: 'open',
        totalCents: 500_000,
      });
      const closer = await seedSnapshot(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId,
        staffId: world.staffId,
        type: 'close',
        totalCents: 480_000,
        createdAt: '2026-06-01T14:05:00.000Z',
      });
      await linkSessionSnapshots(setup, sessionId, pollutedOpener, closer);

      const r = await derive(sessionId);
      expect(r.calculation_kind).toBe('integrity_failure');
      expect(r.integrity_issues).toContain(
        'missing_opening_inventory_snapshot',
      );
    });

    it('valid session-linked fallback resolves when FK is absent', async () => {
      const sessionId = await seedSession(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        staffId: world.staffId,
        openedAt: OPENED_AT,
        closedAt: CLOSED_AT,
      });
      // No FK set on the session; rely on session-linked fallback for both sides.
      await seedSnapshot(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId,
        staffId: world.staffId,
        type: 'open',
        totalCents: 200_000,
      });
      await seedSnapshot(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId,
        staffId: world.staffId,
        type: 'close',
        totalCents: 250_000,
        createdAt: '2026-06-01T14:05:00.000Z',
      });
      const r = await derive(sessionId);
      // partial = 250_000 - 200_000 = 50_000
      expect(r.calculation_kind).toBe('inventory_only');
      expect(r.partial_table_result_cents).toBe(BigInt(50_000));
    });
  });

  // ── Authoritative identity & invariants (A.1) ────────────────────────────────

  describe('authoritative identity & projection invariants', () => {
    it("request casino_id cannot widen scope — wrong casino_id yields not-found, not another casino's session", async () => {
      const sessionId = await seedLinkedSession({
        openerCents: 100_000,
        closerCents: 120_000,
      });
      await expect(
        derive(sessionId, world.otherCasinoId),
      ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    });

    it('unrelated table/config changes do not change the result', async () => {
      const sessionId = await seedLinkedSession({
        openerCents: 500_000,
        closerCents: 480_000,
      });
      const before = await derive(sessionId);

      // Mutate gaming_table config (par-like / labels) and casino settings.
      await setup
        .from('gaming_table')
        .update({ label: 'RENAMED-T1', pit: 'PIT-Z' })
        .eq('id', world.tableId);
      await setup
        .from('casino_settings')
        .update({ gaming_day_start_time: '08:00' })
        .eq('casino_id', world.casinoId);

      const after = await derive(sessionId);
      expect(after.partial_table_result_cents).toBe(
        before.partial_table_result_cents,
      );
      expect(after.calculation_kind).toBe(before.calculation_kind);
    });

    it('projected / partial / final are mutually exclusive and final is always null', async () => {
      // telemetry case
      const tSession = await seedLinkedSession({
        openerCents: 100_000,
        closerCents: 100_000,
      });
      await seedTelemetry(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        staffId: world.staffId,
        amountCents: 10_000,
        occurredAt: IN_WINDOW,
      });
      const t = await derive(tSession);
      expect(t.projected_table_win_loss_cents).not.toBeNull();
      expect(t.partial_table_result_cents).toBeNull();
      expect(t.final_table_win_loss_cents).toBeNull();
    });
  });
});
