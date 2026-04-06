/** @jest-environment node */

/**
 * PRD-059: rpc_close_table_session OPEN-Cancellation — Integration Tests
 *
 * Mode C JWT auth (ADR-024): authenticated anon client with staff_id claim.
 *
 * Tests:
 * AC-19: rpc_close_table_session accepts OPEN with close_reason='cancelled'
 * AC-20: Skips artifact requirement for OPEN-cancellation
 * AC-21: Cancelled OPEN session has no attestation, no predecessor consumed
 *
 * PREREQUISITES:
 * - Migrations must be applied including PRD-059 custody gate RPCs
 * - Local Supabase running: `npx supabase start`
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable set
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
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isIntegrationEnvironment =
  supabaseUrl &&
  supabaseServiceKey &&
  supabaseAnonKey &&
  process.env.RUN_INTEGRATION_TESTS === 'true';

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

describeIntegration(
  'PRD-059: rpc_close_table_session — OPEN-Cancellation',
  () => {
    // setupClient: service-role, for fixture creation/teardown/verification
    let setupClient: SupabaseClient<Database>;
    // pitBossClient: authenticated anon client with JWT staff_id claim
    let pitBossClient: SupabaseClient<Database>;

    // Shared test entities
    let companyId: string;
    let casinoId: string;
    let pitBossId: string;
    let pitBossUserId: string;
    let tableId: string;

    const TEST_EMAIL = `test-tc-mode-c-cancel-pb-${Date.now()}@test.com`;
    const TEST_PASSWORD = 'TestPassword123!';

    /** Open an OPEN session, return session ID */
    async function openSession(): Promise<string> {
      const { data, error } = await pitBossClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId,
        },
      );
      if (error) throw new Error(`openSession failed: ${error.message}`);
      return data!.id;
    }

    /** Clean up all sessions + attestations (via setupClient) */
    async function cleanAll() {
      await setupClient
        .from('table_opening_attestation')
        .delete()
        .eq('casino_id', casinoId);
      await setupClient
        .from('table_rundown_report')
        .delete()
        .eq('casino_id', casinoId);
      await setupClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId);
      // Reset consumed_by on snapshots
      await setupClient
        .from('table_inventory_snapshot')
        .update({ consumed_by_session_id: null, consumed_at: null })
        .eq('casino_id', casinoId);
    }

    beforeAll(async () => {
      setupClient = createClient<Database>(supabaseUrl!, supabaseServiceKey!);

      // 1. Create auth user
      const { data: user } = await setupClient.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
      });
      pitBossUserId = user!.user!.id;

      // 2. Company
      const { data: company } = await setupClient
        .from('company')
        .insert({ name: 'PRD-059 Cancel Test Company' })
        .select('id')
        .single();
      companyId = company!.id;

      // 3. Casino + settings
      const { data: casino } = await setupClient
        .from('casino')
        .insert({ name: 'PRD-059 Cancel Test Casino', company_id: company!.id })
        .select('id')
        .single();
      casinoId = casino!.id;

      await setupClient.from('casino_settings').insert({
        casino_id: casinoId,
        gaming_day_start_time: '06:00',
        timezone: 'America/Los_Angeles',
      });

      // 4. Staff (pit_boss)
      const { data: staff } = await setupClient
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
      pitBossId = staff!.id;

      // 5. Two-phase ADR-024: stamp staff_id into app_metadata
      await setupClient.auth.admin.updateUserById(pitBossUserId, {
        app_metadata: {
          casino_id: casinoId,
          staff_id: pitBossId,
          staff_role: 'pit_boss',
        },
      });

      // 6. Gaming table
      const { data: table } = await setupClient
        .from('gaming_table')
        .insert({
          casino_id: casinoId,
          label: 'PRD059-CANCEL-T1',
          type: 'blackjack',
          pit: 'PIT-A',
          status: 'active',
        })
        .select('id')
        .single();
      tableId = table!.id;

      // 7. Sign in and create authenticated anon client
      pitBossClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
      const { error: signInError } =
        await pitBossClient.auth.signInWithPassword({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        });
      if (signInError)
        throw new Error(`Sign-in failed: ${signInError.message}`);
    });

    afterAll(async () => {
      await setupClient.from('audit_log').delete().eq('casino_id', casinoId);
      await setupClient
        .from('table_opening_attestation')
        .delete()
        .eq('casino_id', casinoId);
      await setupClient
        .from('table_rundown_report')
        .delete()
        .eq('casino_id', casinoId);
      await setupClient
        .from('table_session')
        .delete()
        .eq('casino_id', casinoId);
      await setupClient
        .from('table_inventory_snapshot')
        .delete()
        .eq('casino_id', casinoId);
      await setupClient
        .from('table_drop_event')
        .delete()
        .eq('casino_id', casinoId);
      await setupClient.from('gaming_table').delete().eq('casino_id', casinoId);
      await setupClient.from('staff').delete().eq('casino_id', casinoId);
      await setupClient
        .from('casino_settings')
        .delete()
        .eq('casino_id', casinoId);
      await setupClient.from('casino').delete().eq('id', casinoId);
      await setupClient.from('company').delete().eq('id', companyId);
      await setupClient.auth.admin.deleteUser(pitBossUserId);
    });

    // =========================================================================
    // AC-19: rpc_close_table_session accepts OPEN with close_reason='cancelled'
    // =========================================================================
    describe('AC-19: OPEN session closed with cancelled reason', () => {
      let sessionId: string;

      beforeAll(async () => {
        await cleanAll();
        sessionId = await openSession();
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('closes OPEN session with close_reason=cancelled', async () => {
        const { data, error } = await pitBossClient.rpc(
          'rpc_close_table_session',
          {
            p_table_session_id: sessionId,
            p_close_reason:
              'cancelled' as Database['public']['Enums']['close_reason_type'],
            p_close_note: 'Wrong table opened',
          },
        );

        expect(error).toBeNull();
        expect(data!.status).toBe('CLOSED');
        expect(data!.close_reason).toBe('cancelled');
      });

      it('rejects OPEN session close without cancelled reason', async () => {
        await cleanAll();
        const sid = await openSession();

        const { error } = await pitBossClient.rpc('rpc_close_table_session', {
          p_table_session_id: sid,
          // No close_reason or close_reason != 'cancelled'
          p_close_reason:
            'end_of_shift' as Database['public']['Enums']['close_reason_type'],
        });

        expect(error).not.toBeNull();
        expect(error!.message).toContain('invalid_state_transition');
      });
    });

    // =========================================================================
    // AC-20: Skips artifact requirement for OPEN-cancellation
    // =========================================================================
    describe('AC-20: no artifact required for OPEN-cancellation', () => {
      let sessionId: string;

      beforeAll(async () => {
        await cleanAll();
        sessionId = await openSession();
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('succeeds without drop_event_id or closing_inventory_snapshot_id', async () => {
        const { data, error } = await pitBossClient.rpc(
          'rpc_close_table_session',
          {
            p_table_session_id: sessionId,
            p_close_reason:
              'cancelled' as Database['public']['Enums']['close_reason_type'],
            // No p_drop_event_id, no p_closing_inventory_snapshot_id
          },
        );

        expect(error).toBeNull();
        expect(data!.status).toBe('CLOSED');
        expect(data!.close_reason).toBe('cancelled');
      });
    });

    // =========================================================================
    // AC-21: Cancelled OPEN session has no attestation, no predecessor consumed
    // =========================================================================
    describe('AC-21: cancelled OPEN session — no side effects', () => {
      let sessionId: string;
      let snapshotId: string;

      beforeAll(async () => {
        await cleanAll();

        // Create a predecessor with a snapshot (to verify no consumption)
        // Use setupClient for fixture creation
        const { data: snapshot } = await setupClient
          .from('table_inventory_snapshot')
          .insert({
            casino_id: casinoId,
            table_id: tableId,
            counted_by: pitBossId,
            chipset: { '25': 200 },
            snapshot_type: 'close',
            total_cents: 50000,
          })
          .select('id')
          .single();
        snapshotId = snapshot!.id;

        await setupClient.from('table_session').insert({
          casino_id: casinoId,
          gaming_table_id: tableId,
          status: 'CLOSED',
          opened_by_staff_id: pitBossId,
          closed_at: new Date().toISOString(),
          closed_by_staff_id: pitBossId,
          closing_inventory_snapshot_id: snapshotId,
          gaming_day: new Date().toISOString().slice(0, 10),
        });

        // Open session (will link predecessor) via authenticated client
        sessionId = await openSession();

        // Cancel the OPEN session via authenticated client
        await pitBossClient.rpc('rpc_close_table_session', {
          p_table_session_id: sessionId,
          p_close_reason:
            'cancelled' as Database['public']['Enums']['close_reason_type'],
          p_close_note: 'Test cancellation',
        });
      });

      afterAll(async () => {
        await cleanAll();
      });

      it('no attestation row exists for cancelled session', async () => {
        // Verify via setupClient (service-role, bypasses RLS)
        const { data: attestations } = await setupClient
          .from('table_opening_attestation')
          .select('id')
          .eq('session_id', sessionId);

        expect(attestations).toHaveLength(0);
      });

      it('predecessor snapshot not consumed', async () => {
        // Verify via setupClient
        const { data: snapshot } = await setupClient
          .from('table_inventory_snapshot')
          .select('consumed_by_session_id')
          .eq('id', snapshotId)
          .single();

        expect(snapshot!.consumed_by_session_id).toBeNull();
      });
    });
  },
);
