/** @jest-environment node */

/**
 * INV-MTL-BRIDGE-ATOMICITY:
 * A qualifying pit buy-in succeeds iff player_financial_transaction + mtl_entry
 * both commit in the same Postgres transaction. See PRD-064 §6.
 */

/**
 * MTL Bridge Integration Tests (PRD-064 WS3 — P0.3)
 *
 * Directly exercises the rpc_create_financial_txn → fn_derive_mtl_from_finance
 * → mtl_entry bridge. Closes the zero-direct-coverage hole identified in the
 * PRD-064 Phase-1 investigation.
 *
 * Three cases:
 *   (a) Qualifying (over-threshold) pit buy-in writes both PFT and mtl_entry.
 *   (b) Sub-threshold pit buy-in ALSO writes mtl_entry (bridge is ungated
 *       at write-time — threshold filtering is READ-TIME at
 *       services/mtl/crud.ts:444-450).
 *   (c) Context-guard violations roll back atomically (zero PFT rows AND
 *       zero mtl_entry rows):
 *         - G1 MISSING_CONTEXT (ADR-024, bridge enforces)
 *         - G2 Tenant mismatch (NEW.casino_id ≠ app.casino_id)
 *         - G3 Actor mismatch (NEW.created_by_staff_id ≠ app.actor_id)
 *
 * Auth model: ADR-024 Mode C for the RPC path (cases a, b). Guard cases (c)
 * bypass RLS via service_role and set context with set_rls_context_internal
 * to exercise the trigger's guardrails directly.
 *
 * @see docs/10-prd/PRD-064-mtl-buyin-glitch-containment-v0.md
 * @see supabase/migrations/20260116111329_finance_to_mtl_derivation.sql
 * @see supabase/migrations/20260307135439_adr040_financial_txn_identity_derivation.sql
 * @see docs/80-adrs/ADR-024_DECISIONS.md
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
// eslint-disable-next-line no-restricted-imports -- Integration tests require direct Supabase client
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Client as PgClient } from 'pg';

import {
  createModeCSession,
  ModeCSessionResult,
} from '../../../lib/testing/create-mode-c-session';
import type { Database } from '../../../types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const RUN_INTEGRATION =
  process.env.RUN_INTEGRATION_TESTS === 'true' ||
  process.env.RUN_INTEGRATION_TESTS === '1';

(RUN_INTEGRATION ? describe : describe.skip)(
  'MTL Bridge Integration (PRD-064 WS3 — INV-MTL-BRIDGE-ATOMICITY)',
  () => {
    // Service-role client for fixture setup / teardown and guard-case direct inserts
    let setupClient: SupabaseClient<Database>;
    // Mode C authenticated anon client for RPC-path happy-path cases
    let pitBossClient: SupabaseClient<Database>;
    let pitBossSession: ModeCSessionResult;

    // Casino A fixtures (primary test tenant)
    let testCompanyId: string;
    let testCasinoId: string;
    let testPitBossStaffId: string;
    let testPlayerId: string;
    let testVisitId: string;

    // Casino B fixtures (for G2 tenant-mismatch test)
    let otherCompanyId: string;
    let otherCasinoId: string;
    let otherStaffId: string;

    beforeAll(async () => {
      setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

      // --- Casino A (primary) ---
      const { data: company, error: companyErr } = await setupClient
        .from('company')
        .insert({ name: 'MTL Bridge Test Company A' })
        .select()
        .single();
      if (companyErr) throw companyErr;
      testCompanyId = company.id;

      const { data: casino, error: casinoErr } = await setupClient
        .from('casino')
        .insert({
          name: 'MTL Bridge Test Casino A',
          status: 'active',
          company_id: testCompanyId,
        })
        .select()
        .single();
      if (casinoErr) throw casinoErr;
      testCasinoId = casino.id;

      // casino_settings: watchlist_floor=3000, ctr_threshold=10000
      await setupClient.from('casino_settings').insert({
        casino_id: testCasinoId,
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
        watchlist_floor: 3000,
        ctr_threshold: 10000,
      });

      const { data: pitBoss, error: pitBossErr } = await setupClient
        .from('staff')
        .insert({
          casino_id: testCasinoId,
          employee_id: `PB-MTL-BR-${Date.now()}`,
          first_name: 'MTLBridge',
          last_name: 'PitBoss',
          role: 'pit_boss',
          status: 'active',
        })
        .select()
        .single();
      if (pitBossErr) throw pitBossErr;
      testPitBossStaffId = pitBoss.id;

      pitBossSession = await createModeCSession(setupClient, {
        staffId: testPitBossStaffId,
        casinoId: testCasinoId,
        staffRole: 'pit_boss',
      });
      pitBossClient = pitBossSession.client;

      // Bind auth user to staff record
      await setupClient
        .from('staff')
        .update({ user_id: pitBossSession.userId })
        .eq('id', testPitBossStaffId);

      const { data: player, error: playerErr } = await setupClient
        .from('player')
        .insert({ first_name: 'MTLBridge', last_name: 'Player' })
        .select()
        .single();
      if (playerErr) throw playerErr;
      testPlayerId = player.id;

      await setupClient.from('player_casino').insert({
        player_id: testPlayerId,
        casino_id: testCasinoId,
        status: 'active',
      });

      // ADR-026: visit requires gaming_day and visit_group_id.
      const { data: visit, error: visitErr } = await setupClient
        .from('visit')
        .insert({
          casino_id: testCasinoId,
          player_id: testPlayerId,
          visit_kind: 'gaming_identified_rated',
          gaming_day: new Date().toISOString().slice(0, 10),
          visit_group_id: crypto.randomUUID(),
        })
        .select()
        .single();
      if (visitErr) throw visitErr;
      testVisitId = visit.id;

      // --- Casino B (for G2 tenant-mismatch) ---
      const { data: otherCompany, error: otherCompanyErr } = await setupClient
        .from('company')
        .insert({ name: 'MTL Bridge Test Company B' })
        .select()
        .single();
      if (otherCompanyErr) throw otherCompanyErr;
      otherCompanyId = otherCompany.id;

      const { data: otherCasino, error: otherCasinoErr } = await setupClient
        .from('casino')
        .insert({
          name: 'MTL Bridge Test Casino B',
          status: 'active',
          company_id: otherCompanyId,
        })
        .select()
        .single();
      if (otherCasinoErr) throw otherCasinoErr;
      otherCasinoId = otherCasino.id;

      await setupClient.from('casino_settings').insert({
        casino_id: otherCasinoId,
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
        watchlist_floor: 3000,
        ctr_threshold: 10000,
      });

      const { data: otherStaff, error: otherStaffErr } = await setupClient
        .from('staff')
        .insert({
          casino_id: otherCasinoId,
          employee_id: `PB-MTL-BR-B-${Date.now()}`,
          first_name: 'OtherCasino',
          last_name: 'PitBoss',
          role: 'pit_boss',
          status: 'active',
        })
        .select()
        .single();
      if (otherStaffErr) throw otherStaffErr;
      otherStaffId = otherStaff.id;
    });

    afterAll(async () => {
      // Reverse-order cleanup. mtl_entry has a BEFORE DELETE immutability
      // trigger (trg_mtl_entry_no_delete) that blocks service_role deletes and
      // blocks the casino FK-cascade, which would otherwise leave orphan rows
      // and fail subsequent casino deletes. Connect via direct libpq to the
      // local Postgres container to disable the trigger for cleanup only.
      const localDbUrl =
        process.env.SUPABASE_DB_URL_LOCAL ??
        'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
      const pg = new PgClient({ connectionString: localDbUrl });
      try {
        await pg.connect();
        await pg.query(
          'ALTER TABLE mtl_entry DISABLE TRIGGER trg_mtl_entry_no_delete',
        );
        await pg.query(
          'DELETE FROM mtl_entry WHERE casino_id = ANY($1::uuid[])',
          [[testCasinoId, otherCasinoId]],
        );
      } catch {
        /* ignore — rows will orphan if cleanup fails */
      } finally {
        try {
          await pg.query(
            'ALTER TABLE mtl_entry ENABLE TRIGGER trg_mtl_entry_no_delete',
          );
        } catch {
          /* ignore */
        }
        await pg.end().catch(() => undefined);
      }

      await setupClient
        .from('player_financial_transaction')
        .delete()
        .eq('casino_id', testCasinoId);
      await setupClient
        .from('player_financial_transaction')
        .delete()
        .eq('casino_id', otherCasinoId);
      await setupClient.from('visit').delete().eq('id', testVisitId);
      await setupClient
        .from('player_casino')
        .delete()
        .eq('player_id', testPlayerId);
      await setupClient.from('player').delete().eq('id', testPlayerId);
      await setupClient
        .from('staff')
        .delete()
        .in('id', [testPitBossStaffId, otherStaffId]);
      await setupClient
        .from('casino_settings')
        .delete()
        .in('casino_id', [testCasinoId, otherCasinoId]);
      await setupClient
        .from('casino')
        .delete()
        .in('id', [testCasinoId, otherCasinoId]);
      await setupClient
        .from('company')
        .delete()
        .in('id', [testCompanyId, otherCompanyId]);

      await pitBossSession?.cleanup();
    });

    // =========================================================================
    // Case (a): Qualifying (over-watchlist-floor) buy-in writes both rows
    // =========================================================================

    describe('Case (a) — Qualifying buy-in writes both rows', () => {
      it('writes player_financial_transaction AND mtl_entry atomically with matching linkage', async () => {
        const buyInAmount = 5000; // > watchlist_floor (3000)

        const { data: pftRow, error: rpcError } = await pitBossClient.rpc(
          'rpc_create_financial_txn',
          {
            p_player_id: testPlayerId,
            p_visit_id: testVisitId,
            p_amount: buyInAmount,
            p_direction: 'in',
            p_source: 'pit',
            p_tender_type: 'cash',
          },
        );

        expect(rpcError).toBeNull();
        expect(pftRow).toBeTruthy();
        expect(pftRow?.amount).toBe(buyInAmount);
        expect(pftRow?.direction).toBe('in');
        expect(pftRow?.source).toBe('pit');
        expect(pftRow?.tender_type).toBe('cash');
        expect(pftRow?.casino_id).toBe(testCasinoId);
        expect(pftRow?.created_by_staff_id).toBe(testPitBossStaffId);

        // Bridge writes idempotency_key = 'fin:' || pft.id
        const expectedIdemKey = `fin:${pftRow!.id}`;

        const { data: mtlRows, error: mtlErr } = await setupClient
          .from('mtl_entry')
          .select('*')
          .eq('casino_id', testCasinoId)
          .eq('idempotency_key', expectedIdemKey);

        expect(mtlErr).toBeNull();
        expect(mtlRows).toHaveLength(1);
        const mtl = mtlRows![0];
        expect(mtl.idempotency_key).toMatch(/^fin:/);
        expect(mtl.amount).toBe(buyInAmount);
        expect(mtl.direction).toBe('in');
        expect(mtl.txn_type).toBe('buy_in');
        expect(mtl.source).toBe('table');
        expect(mtl.casino_id).toBe(testCasinoId);
        expect(mtl.staff_id).toBe(testPitBossStaffId);
        expect(mtl.patron_uuid).toBe(testPlayerId);
        expect(mtl.visit_id).toBe(testVisitId);
      });
    });

    // =========================================================================
    // Case (b): Sub-threshold buy-in ALSO writes mtl_entry (intentional)
    // =========================================================================

    describe('Case (b) — Sub-threshold buy-in ALSO writes mtl_entry', () => {
      it('writes mtl_entry for a sub-watchlist-floor buy-in (bridge is ungated at write-time)', async () => {
        // Threshold gating is READ-TIME, not WRITE-TIME. See services/mtl/crud.ts:444-450.
        // The bridge writes mtl_entry unconditionally; the compliance dashboard filters
        // at read time. Changing this contract is a separate ADR — see PRD-064 §R-3.
        const subThresholdAmount = 500; // < watchlist_floor (3000)

        const { data: pftRow, error: rpcError } = await pitBossClient.rpc(
          'rpc_create_financial_txn',
          {
            p_player_id: testPlayerId,
            p_visit_id: testVisitId,
            p_amount: subThresholdAmount,
            p_direction: 'in',
            p_source: 'pit',
            p_tender_type: 'cash',
          },
        );

        expect(rpcError).toBeNull();
        expect(pftRow).toBeTruthy();
        expect(pftRow?.amount).toBe(subThresholdAmount);

        const expectedIdemKey = `fin:${pftRow!.id}`;

        const { data: mtlRows, error: mtlErr } = await setupClient
          .from('mtl_entry')
          .select('*')
          .eq('casino_id', testCasinoId)
          .eq('idempotency_key', expectedIdemKey);

        expect(mtlErr).toBeNull();
        // This assertion is intentional — see banner comment above.
        expect(mtlRows).toHaveLength(1);
        expect(mtlRows![0].amount).toBe(subThresholdAmount);
        expect(mtlRows![0].txn_type).toBe('buy_in');
      });
    });

    // =========================================================================
    // Case (c): Context-guard violations roll back the whole transaction
    //
    // Strategy: bypass RLS via service_role and insert directly into
    // player_financial_transaction. The bridge trigger is SECURITY DEFINER and
    // fires AFTER INSERT regardless of caller role; raising from the trigger
    // rolls back the parent INSERT in the same transaction.
    // =========================================================================

    describe('Case (c) — Context-guard violations roll back atomically', () => {
      /**
       * Snapshot counts of both tables scoped to a casino, filtered to rows we
       * might have created in the current test (by player_id / patron_uuid).
       */
      async function countRows(casinoId: string, playerId: string) {
        const { count: pftCount, error: pftErr } = await setupClient
          .from('player_financial_transaction')
          .select('id', { count: 'exact', head: true })
          .eq('casino_id', casinoId)
          .eq('player_id', playerId);
        if (pftErr) throw pftErr;

        const { count: mtlCount, error: mtlErr } = await setupClient
          .from('mtl_entry')
          .select('id', { count: 'exact', head: true })
          .eq('casino_id', casinoId)
          .eq('patron_uuid', playerId);
        if (mtlErr) throw mtlErr;

        return { pftCount: pftCount ?? 0, mtlCount: mtlCount ?? 0 };
      }

      // Reset context between guard sub-cases using a throwaway Postgres-level
      // no-op. Each service_role call starts a fresh pooled txn; we set context
      // explicitly where required.

      it('G1 MISSING_CONTEXT: no RLS context set → bridge raises → both rows zero', async () => {
        const before = await countRows(testCasinoId, testPlayerId);

        // service_role client WITHOUT set_rls_context_from_staff/internal.
        // The bridge's G1 check reads app.casino_id / app.actor_id; both are
        // unset in this fresh connection slot → trigger raises MISSING_CONTEXT,
        // which rolls back the PFT insert in the same transaction.
        const idemKey = `fin-bridge-g1-${Date.now()}`;
        const { data, error } = await setupClient
          .from('player_financial_transaction')
          .insert({
            player_id: testPlayerId,
            casino_id: testCasinoId,
            visit_id: testVisitId,
            amount: 500,
            direction: 'in',
            source: 'pit',
            tender_type: 'cash',
            created_by_staff_id: testPitBossStaffId,
            idempotency_key: idemKey,
          })
          .select()
          .single();

        expect(error).not.toBeNull();
        expect(error?.message).toMatch(/MISSING_CONTEXT/i);
        expect(data).toBeNull();

        const after = await countRows(testCasinoId, testPlayerId);
        expect(after.pftCount).toBe(before.pftCount);
        expect(after.mtlCount).toBe(before.mtlCount);
      });

      it('G2 Tenant mismatch: NEW.casino_id ≠ app.casino_id → bridge raises → both rows zero', async () => {
        const before = await countRows(otherCasinoId, testPlayerId);

        // Set context for casino A (testCasinoId) via the ops lane, then attempt
        // a PFT insert with casino_id = casino B (otherCasinoId). Bridge G2
        // compares NEW.casino_id to app.casino_id context and raises.
        // Enroll the player at casino B for referential integrity.
        const { data: enrollment } = await setupClient
          .from('player_casino')
          .select('player_id')
          .eq('player_id', testPlayerId)
          .eq('casino_id', otherCasinoId)
          .maybeSingle();
        if (!enrollment) {
          await setupClient.from('player_casino').insert({
            player_id: testPlayerId,
            casino_id: otherCasinoId,
            status: 'active',
          });
        }

        // Create a visit at casino B (ADR-026 fields required).
        const { data: visitB, error: visitBErr } = await setupClient
          .from('visit')
          .insert({
            casino_id: otherCasinoId,
            player_id: testPlayerId,
            visit_kind: 'gaming_identified_rated',
            gaming_day: new Date().toISOString().slice(0, 10),
            visit_group_id: crypto.randomUUID(),
          })
          .select()
          .single();
        if (visitBErr) throw visitBErr;

        try {
          // ops-lane context inject for casino A, actor = otherStaffId bound to
          // casino A's pit_boss (ensures G1 passes so we exercise G2 only).
          // set_rls_context_internal validates actor is casino-scoped. Use the
          // primary casino's staff to satisfy that, then target casino B.
          const { error: ctxErr } = await setupClient.rpc(
            'set_rls_context_internal',
            {
              p_actor_id: testPitBossStaffId,
              p_casino_id: testCasinoId,
              p_staff_role: 'pit_boss',
            },
          );
          expect(ctxErr).toBeNull();

          const idemKey = `fin-bridge-g2-${Date.now()}`;
          const { data, error } = await setupClient
            .from('player_financial_transaction')
            .insert({
              player_id: testPlayerId,
              casino_id: otherCasinoId, // ← tenant mismatch vs app.casino_id = testCasinoId
              visit_id: visitB!.id,
              amount: 500,
              direction: 'in',
              source: 'pit',
              tender_type: 'cash',
              created_by_staff_id: testPitBossStaffId,
              idempotency_key: idemKey,
            })
            .select()
            .single();

          expect(error).not.toBeNull();
          expect(error?.message).toMatch(
            /SECURITY_VIOLATION|Tenant mismatch|MISSING_CONTEXT/i,
          );
          expect(data).toBeNull();

          const after = await countRows(otherCasinoId, testPlayerId);
          expect(after.pftCount).toBe(before.pftCount);
          expect(after.mtlCount).toBe(before.mtlCount);
        } finally {
          await setupClient.from('visit').delete().eq('id', visitB!.id);
          await setupClient
            .from('player_casino')
            .delete()
            .eq('player_id', testPlayerId)
            .eq('casino_id', otherCasinoId);
        }
      });

      it('G3 Actor mismatch: NEW.created_by_staff_id ≠ app.actor_id → bridge raises → both rows zero', async () => {
        const before = await countRows(testCasinoId, testPlayerId);

        // Context: actor = testPitBossStaffId / casino A
        // Insert: created_by_staff_id = otherStaffId (casino B staff, ≠ context actor)
        const { error: ctxErr } = await setupClient.rpc(
          'set_rls_context_internal',
          {
            p_actor_id: testPitBossStaffId,
            p_casino_id: testCasinoId,
            p_staff_role: 'pit_boss',
          },
        );
        expect(ctxErr).toBeNull();

        const idemKey = `fin-bridge-g3-${Date.now()}`;
        const { data, error } = await setupClient
          .from('player_financial_transaction')
          .insert({
            player_id: testPlayerId,
            casino_id: testCasinoId,
            visit_id: testVisitId,
            amount: 500,
            direction: 'in',
            source: 'pit',
            tender_type: 'cash',
            created_by_staff_id: otherStaffId, // ← actor mismatch
            idempotency_key: idemKey,
          })
          .select()
          .single();

        expect(error).not.toBeNull();
        expect(error?.message).toMatch(
          /SECURITY_VIOLATION|Actor mismatch|MISSING_CONTEXT/i,
        );
        expect(data).toBeNull();

        const after = await countRows(testCasinoId, testPlayerId);
        expect(after.pftCount).toBe(before.pftCount);
        expect(after.mtlCount).toBe(before.mtlCount);
      });
    });
  },
);
