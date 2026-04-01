/** @jest-environment node */

/**
 * PRD-059: rpc_activate_table_session — Custody Gate Integration Tests
 *
 * Tests:
 * AC-5:  Creates table_opening_attestation row with all required fields
 * AC-6:  Transitions session from OPEN to ACTIVE
 * AC-7:  Rejects when session status != OPEN
 * AC-8:  Rejects when dealer_confirmed = false (P0008)
 * AC-9:  Rejects when note required but missing (bootstrap/no predecessor) (P0009)
 * AC-10: Rejects when note required but missing (variance) (P0009)
 * AC-11: Rejects when note required but missing (requires_reconciliation) (P0009)
 * AC-12: Allows null note when predecessor matches and no flags
 * AC-13: Sets provenance_source = 'par_bootstrap' when no predecessor
 * AC-14: Sets provenance_source = 'predecessor' when predecessor exists
 * AC-15: Consumes predecessor snapshot (consumed_by_session_id set)
 * AC-16: Rejects when predecessor snapshot already consumed (P0011)
 * AC-17: Sets attested_by from app.actor_id, not from client
 * AC-18: Rejects dealer role (P0001)
 *
 * PREREQUISITES:
 * - Migrations must be applied including PRD-059 custody gate RPCs
 * - Local Supabase running: `npx supabase start`
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 * - RUN_INTEGRATION_TESTS=true
 *
 * @see docs/10-prd/PRD-059-open-table-custody-gate-pilot-lite-v0.md
 * @see supabase/migrations/20260326020531_prd059_open_custody_rpcs.sql
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isIntegrationEnvironment =
  supabaseUrl &&
  supabaseServiceKey &&
  process.env.RUN_INTEGRATION_TESTS === 'true';

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

describeIntegration(
  'PRD-059: rpc_activate_table_session — Custody Gate',
  () => {
    let svc: SupabaseClient<Database>;

    // Shared test entities
    let companyId: string;
    let casinoId: string;
    let pitBossId: string;
    let pitBossUserId: string;
    let dealerId: string;
    let dealerUserId: string;
    let tableId: string;

    /** Set RLS context as pit_boss */
    async function asPitBoss() {
      await svc.rpc('set_rls_context_internal', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });
    }

    /** Set RLS context as dealer */
    async function asDealer() {
      await svc.rpc('set_rls_context_internal', {
        p_actor_id: dealerId,
        p_casino_id: casinoId,
        p_staff_role: 'dealer',
      });
    }

    /** Open an OPEN session, return session ID */
    async function openSession(): Promise<string> {
      await asPitBoss();
      const { data, error } = await svc.rpc('rpc_open_table_session', {
        p_gaming_table_id: tableId,
      });
      if (error) throw new Error(`openSession failed: ${error.message}`);
      return data!.id;
    }

    /** Clean up all sessions + attestations on tableId */
    async function cleanAll() {
      await svc
        .from('table_opening_attestation')
        .delete()
        .eq('casino_id', casinoId);
      await svc.from('table_rundown_report').delete().eq('casino_id', casinoId);
      await svc.from('table_session').delete().eq('gaming_table_id', tableId);
      // Reset consumed_by on snapshots
      await svc
        .from('table_inventory_snapshot')
        .update({ consumed_by_session_id: null, consumed_at: null })
        .eq('casino_id', casinoId);
    }

    /**
     * Create a CLOSED predecessor session with a closing inventory snapshot.
     * Returns { sessionId, snapshotId }.
     */
    async function createClosedPredecessorWithSnapshot(opts?: {
      snapshotTotalCents?: number;
      requiresReconciliation?: boolean;
    }): Promise<{ sessionId: string; snapshotId: string }> {
      const totalCents = opts?.snapshotTotalCents ?? 50000;
      const reqRecon = opts?.requiresReconciliation ?? false;

      // Create closing snapshot
      const { data: snapshot } = await svc
        .from('table_inventory_snapshot')
        .insert({
          casino_id: casinoId,
          table_id: tableId,
          counted_by: pitBossId,
          chipset: { '25': 200 },
          snapshot_type: 'close',
          total_cents: totalCents,
        })
        .select('id')
        .single();

      // Create CLOSED session referencing the snapshot
      const { data: session } = await svc
        .from('table_session')
        .insert({
          casino_id: casinoId,
          gaming_table_id: tableId,
          status: 'CLOSED',
          opened_by_staff_id: pitBossId,
          closed_at: new Date().toISOString(),
          closed_by_staff_id: pitBossId,
          closing_inventory_snapshot_id: snapshot!.id,
          requires_reconciliation: reqRecon,
          gaming_day: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single();

      return { sessionId: session!.id, snapshotId: snapshot!.id };
    }

    beforeAll(async () => {
      svc = createClient<Database>(supabaseUrl!, supabaseServiceKey!);

      // Create test users
      const { data: pbUser } = await svc.auth.admin.createUser({
        email: `test-prd059-activate-pb-${Date.now()}@example.com`,
        password: 'test-password',
        email_confirm: true,
      });
      pitBossUserId = pbUser!.user!.id;

      const { data: dlrUser } = await svc.auth.admin.createUser({
        email: `test-prd059-activate-dlr-${Date.now()}@example.com`,
        password: 'test-password',
        email_confirm: true,
      });
      dealerUserId = dlrUser!.user!.id;

      // Company
      const { data: company } = await svc
        .from('company')
        .insert({ name: 'PRD-059 Activate Test Company' })
        .select('id')
        .single();
      companyId = company!.id;

      // Casino + settings
      const { data: casino } = await svc
        .from('casino')
        .insert({
          name: 'PRD-059 Activate Test Casino',
          company_id: company!.id,
        })
        .select('id')
        .single();
      casinoId = casino!.id;

      await svc.from('casino_settings').insert({
        casino_id: casinoId,
        gaming_day_start_time: '06:00',
        timezone: 'America/Los_Angeles',
      });

      // Staff (pit_boss)
      const { data: pbStaff } = await svc
        .from('staff')
        .insert({
          user_id: pitBossUserId,
          casino_id: casinoId,
          role: 'pit_boss',
          first_name: 'PRD059',
          last_name: 'PitBoss',
          status: 'active',
        })
        .select('id')
        .single();
      pitBossId = pbStaff!.id;

      // Staff (dealer — for AC-18)
      const { data: dlrStaff } = await svc
        .from('staff')
        .insert({
          user_id: dealerUserId,
          casino_id: casinoId,
          role: 'dealer',
          first_name: 'PRD059',
          last_name: 'Dealer',
          status: 'active',
        })
        .select('id')
        .single();
      dealerId = dlrStaff!.id;

      // Gaming table
      const { data: table } = await svc
        .from('gaming_table')
        .insert({
          casino_id: casinoId,
          label: 'PRD059-ACTIVATE-T1',
          type: 'blackjack',
          pit: 'PIT-A',
          status: 'active',
        })
        .select('id')
        .single();
      tableId = table!.id;
    });

    afterAll(async () => {
      // Cleanup in dependency order
      await svc.from('audit_log').delete().eq('casino_id', casinoId);
      await svc
        .from('table_opening_attestation')
        .delete()
        .eq('casino_id', casinoId);
      await svc.from('table_rundown_report').delete().eq('casino_id', casinoId);
      await svc.from('table_session').delete().eq('casino_id', casinoId);
      await svc
        .from('table_inventory_snapshot')
        .delete()
        .eq('casino_id', casinoId);
      await svc.from('table_drop_event').delete().eq('casino_id', casinoId);
      await svc.from('gaming_table').delete().eq('casino_id', casinoId);
      await svc.from('staff').delete().eq('casino_id', casinoId);
      await svc.from('casino_settings').delete().eq('casino_id', casinoId);
      await svc.from('casino').delete().eq('id', casinoId);
      await svc.from('company').delete().eq('id', companyId);
      await svc.auth.admin.deleteUser(pitBossUserId);
      await svc.auth.admin.deleteUser(dealerUserId);
    });

    // =========================================================================
    // AC-5: Creates table_opening_attestation row with all required fields
    // =========================================================================
    describe('AC-5: attestation row created with required fields', () => {
      let sessionId: string;

      beforeAll(async () => {
        await cleanAll();
        sessionId = await openSession();
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('creates attestation with all required fields', async () => {
        await asPitBoss();
        const { error } = await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: sessionId,
          p_opening_total_cents: 50000,
          p_dealer_confirmed: true,
          p_opening_note: 'Bootstrap opening',
        });

        expect(error).toBeNull();

        // Verify attestation row
        const { data: attestation } = await svc
          .from('table_opening_attestation')
          .select('*')
          .eq('session_id', sessionId)
          .single();

        expect(attestation).not.toBeNull();
        expect(attestation!.casino_id).toBe(casinoId);
        expect(attestation!.session_id).toBe(sessionId);
        expect(attestation!.opening_total_cents).toBe(50000);
        expect(attestation!.attested_by).toBe(pitBossId);
        expect(attestation!.dealer_confirmed).toBe(true);
        expect(attestation!.provenance_source).toBeDefined();
        expect(attestation!.attested_at).toBeDefined();
      });
    });

    // =========================================================================
    // AC-6: Transitions session from OPEN to ACTIVE
    // =========================================================================
    describe('AC-6: OPEN -> ACTIVE transition', () => {
      let sessionId: string;

      beforeAll(async () => {
        await cleanAll();
        sessionId = await openSession();
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('transitions session status to ACTIVE', async () => {
        await asPitBoss();
        const { data, error } = await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: sessionId,
          p_opening_total_cents: 50000,
          p_dealer_confirmed: true,
          p_opening_note: 'Bootstrap opening',
        });

        expect(error).toBeNull();
        expect(data!.status).toBe('ACTIVE');

        // Verify in database
        const { data: session } = await svc
          .from('table_session')
          .select('status')
          .eq('id', sessionId)
          .single();

        expect(session!.status).toBe('ACTIVE');
      });
    });

    // =========================================================================
    // AC-7: Rejects when session status != OPEN
    // =========================================================================
    describe('AC-7: rejects activation from non-OPEN status', () => {
      let activeSessionId: string;

      beforeAll(async () => {
        await cleanAll();
        // Create and activate a session (making it ACTIVE)
        activeSessionId = await openSession();
        await asPitBoss();
        await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: activeSessionId,
          p_opening_total_cents: 50000,
          p_dealer_confirmed: true,
          p_opening_note: 'Bootstrap opening',
        });
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('raises P0003 when session is already ACTIVE', async () => {
        await asPitBoss();
        const { error } = await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: activeSessionId,
          p_opening_total_cents: 50000,
          p_dealer_confirmed: true,
          p_opening_note: 'Should fail',
        });

        expect(error).not.toBeNull();
        expect(error!.message).toContain('invalid_state_transition');
      });
    });

    // =========================================================================
    // AC-8: Rejects when dealer_confirmed = false (P0008)
    // =========================================================================
    describe('AC-8: rejects when dealer_confirmed = false', () => {
      let sessionId: string;

      beforeAll(async () => {
        await cleanAll();
        sessionId = await openSession();
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('raises P0008 when dealer_confirmed is false', async () => {
        await asPitBoss();
        const { error } = await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: sessionId,
          p_opening_total_cents: 50000,
          p_dealer_confirmed: false,
          p_opening_note: 'Should fail',
        });

        expect(error).not.toBeNull();
        expect(error!.message).toContain('dealer_not_confirmed');
      });
    });

    // =========================================================================
    // AC-9: Rejects when note required but missing (bootstrap/no predecessor)
    // =========================================================================
    describe('AC-9: note required for bootstrap (no predecessor)', () => {
      let sessionId: string;

      beforeAll(async () => {
        await cleanAll();
        // No predecessor — this is a first-ever session
        sessionId = await openSession();
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('raises P0009 when note is null for par_bootstrap', async () => {
        await asPitBoss();
        const { error } = await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: sessionId,
          p_opening_total_cents: 50000,
          p_dealer_confirmed: true,
          // No note provided
        });

        expect(error).not.toBeNull();
        expect(error!.message).toContain('note_required');
      });
    });

    // =========================================================================
    // AC-10: Rejects when note required but missing (variance — amounts differ)
    // =========================================================================
    describe('AC-10: note required for amount variance', () => {
      let sessionId: string;

      beforeAll(async () => {
        await cleanAll();
        // Create predecessor with snapshot total_cents = 50000
        await createClosedPredecessorWithSnapshot({
          snapshotTotalCents: 50000,
        });
        // Open new session (will link predecessor)
        sessionId = await openSession();
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('raises P0009 when opening amount differs from predecessor close total', async () => {
        await asPitBoss();
        // Opening with 60000 but predecessor closed with 50000 => variance
        const { error } = await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: sessionId,
          p_opening_total_cents: 60000,
          p_dealer_confirmed: true,
          // No note provided
        });

        expect(error).not.toBeNull();
        expect(error!.message).toContain('note_required');
      });
    });

    // =========================================================================
    // AC-11: Rejects when note required but missing (requires_reconciliation)
    // =========================================================================
    describe('AC-11: note required when predecessor requires reconciliation', () => {
      let sessionId: string;

      beforeAll(async () => {
        await cleanAll();
        // Create predecessor with requires_reconciliation = true
        await createClosedPredecessorWithSnapshot({
          snapshotTotalCents: 50000,
          requiresReconciliation: true,
        });
        sessionId = await openSession();
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('raises P0009 when predecessor requires_reconciliation and no note', async () => {
        await asPitBoss();
        // Same amount (no variance) but requires_reconciliation flag is set
        const { error } = await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: sessionId,
          p_opening_total_cents: 50000,
          p_dealer_confirmed: true,
          // No note provided
        });

        expect(error).not.toBeNull();
        expect(error!.message).toContain('note_required');
      });
    });

    // =========================================================================
    // AC-12: Allows null note when predecessor matches and no flags
    // =========================================================================
    describe('AC-12: null note allowed when amounts match and no recon flag', () => {
      let sessionId: string;

      beforeAll(async () => {
        await cleanAll();
        // Create clean predecessor: matching amounts, no reconciliation
        await createClosedPredecessorWithSnapshot({
          snapshotTotalCents: 50000,
          requiresReconciliation: false,
        });
        sessionId = await openSession();
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('succeeds without note when amounts match and no flags', async () => {
        await asPitBoss();
        const { data, error } = await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: sessionId,
          p_opening_total_cents: 50000,
          p_dealer_confirmed: true,
          // No note — should succeed
        });

        expect(error).toBeNull();
        expect(data!.status).toBe('ACTIVE');
      });
    });

    // =========================================================================
    // AC-13: Sets provenance_source = 'par_bootstrap' when no predecessor
    // =========================================================================
    describe('AC-13: provenance_source = par_bootstrap (no predecessor)', () => {
      let sessionId: string;

      beforeAll(async () => {
        await cleanAll();
        // No predecessor
        sessionId = await openSession();
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('attestation has provenance_source = par_bootstrap', async () => {
        await asPitBoss();
        await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: sessionId,
          p_opening_total_cents: 50000,
          p_dealer_confirmed: true,
          p_opening_note: 'First opening — no predecessor',
        });

        const { data: attestation } = await svc
          .from('table_opening_attestation')
          .select('provenance_source')
          .eq('session_id', sessionId)
          .single();

        expect(attestation!.provenance_source).toBe('par_bootstrap');
      });
    });

    // =========================================================================
    // AC-14: Sets provenance_source = 'predecessor' when predecessor exists
    // =========================================================================
    describe('AC-14: provenance_source = predecessor', () => {
      let sessionId: string;

      beforeAll(async () => {
        await cleanAll();
        await createClosedPredecessorWithSnapshot({
          snapshotTotalCents: 50000,
        });
        sessionId = await openSession();
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('attestation has provenance_source = predecessor', async () => {
        await asPitBoss();
        await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: sessionId,
          p_opening_total_cents: 50000,
          p_dealer_confirmed: true,
          // Amounts match, no note required
        });

        const { data: attestation } = await svc
          .from('table_opening_attestation')
          .select('provenance_source')
          .eq('session_id', sessionId)
          .single();

        expect(attestation!.provenance_source).toBe('predecessor');
      });
    });

    // =========================================================================
    // AC-15: Consumes predecessor snapshot (consumed_by_session_id set)
    // =========================================================================
    describe('AC-15: predecessor snapshot consumed', () => {
      let sessionId: string;
      let snapshotId: string;

      beforeAll(async () => {
        await cleanAll();
        const pred = await createClosedPredecessorWithSnapshot({
          snapshotTotalCents: 50000,
        });
        snapshotId = pred.snapshotId;
        sessionId = await openSession();
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('sets consumed_by_session_id on predecessor snapshot', async () => {
        await asPitBoss();
        await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: sessionId,
          p_opening_total_cents: 50000,
          p_dealer_confirmed: true,
        });

        const { data: snapshot } = await svc
          .from('table_inventory_snapshot')
          .select('consumed_by_session_id, consumed_at')
          .eq('id', snapshotId)
          .single();

        expect(snapshot!.consumed_by_session_id).toBe(sessionId);
        expect(snapshot!.consumed_at).not.toBeNull();
      });
    });

    // =========================================================================
    // AC-16: Rejects when predecessor snapshot already consumed (P0011)
    // =========================================================================
    describe('AC-16: rejects when snapshot already consumed', () => {
      let secondSessionId: string;

      beforeAll(async () => {
        await cleanAll();

        // Create predecessor with snapshot
        const pred = await createClosedPredecessorWithSnapshot({
          snapshotTotalCents: 50000,
        });

        // First session: open and activate (consumes snapshot)
        const firstSessionId = await openSession();
        await asPitBoss();
        await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: firstSessionId,
          p_opening_total_cents: 50000,
          p_dealer_confirmed: true,
        });

        // Close first session so we can open another
        await svc
          .from('table_session')
          .update({
            status: 'CLOSED',
            closed_at: new Date().toISOString(),
            closed_by_staff_id: pitBossId,
            // Keep the same closing_inventory_snapshot_id to trigger double-consume
            closing_inventory_snapshot_id: pred.snapshotId,
          })
          .eq('id', firstSessionId);

        // Open second session (will link to first session as predecessor,
        // and pick up the same snapshot that's already consumed)
        secondSessionId = await openSession();
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('raises P0011 when snapshot was already consumed', async () => {
        await asPitBoss();
        const { error } = await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: secondSessionId,
          p_opening_total_cents: 50000,
          p_dealer_confirmed: true,
        });

        expect(error).not.toBeNull();
        expect(error!.message).toContain('predecessor_already_consumed');
      });
    });

    // =========================================================================
    // AC-17: Sets attested_by from app.actor_id, not from client
    // =========================================================================
    describe('AC-17: attested_by derived from context', () => {
      let sessionId: string;

      beforeAll(async () => {
        await cleanAll();
        sessionId = await openSession();
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('attested_by matches the pit_boss actor_id from context', async () => {
        await asPitBoss();
        await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: sessionId,
          p_opening_total_cents: 50000,
          p_dealer_confirmed: true,
          p_opening_note: 'Bootstrap',
        });

        const { data: attestation } = await svc
          .from('table_opening_attestation')
          .select('attested_by')
          .eq('session_id', sessionId)
          .single();

        // attested_by must be the pit_boss staff_id from server context
        // (no client-provided attested_by parameter exists in the RPC)
        expect(attestation!.attested_by).toBe(pitBossId);
      });
    });

    // =========================================================================
    // AC-18: Rejects dealer role (P0001)
    // =========================================================================
    describe('AC-18: dealer role rejected', () => {
      let sessionId: string;

      beforeAll(async () => {
        await cleanAll();
        sessionId = await openSession();
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('raises P0001 (forbidden) for dealer role', async () => {
        await asDealer();
        const { error } = await svc.rpc('rpc_activate_table_session', {
          p_table_session_id: sessionId,
          p_opening_total_cents: 50000,
          p_dealer_confirmed: true,
          p_opening_note: 'Should fail',
        });

        expect(error).not.toBeNull();
        expect(error!.message).toContain('forbidden');
      });
    });
  },
);
