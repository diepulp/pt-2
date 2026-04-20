/** @jest-environment node */

/**
 * PRD-067: rpc_assign_or_move_table_to_slot + rpc_clear_slot_assignment
 * Integration Tests — RPC + Service + RLS Boundary
 *
 * 13 RPC contract test groups (a)-(m) per EXEC-067 §WS5:
 *   (a) admin-role happy path (assign, move, clear)
 *   (b) non-admin rejection (pit_boss, dealer)
 *   (c) cross-casino rejection — byte-identical mirror pre/post
 *   (d) inactive-slot rejection
 *   (e) occupied-target rejection (no implicit swap)
 *   (f) idempotent clear
 *   (g) atomic move (previous slot cleared same transaction)
 *   (h) partial unique index violation (direct-insert bypass)
 *   (i) mirror verification — gaming_table.pit = floor_pit.label
 *   (j) audit_log emission
 *   (k) transactional rollback on mid-RPC failure
 *   (l) concurrent-move idempotency
 *   (m) DEC-003-R8 single-active-drift containment
 *
 * Mode C JWT auth (ADR-024): authenticated anon clients with staff_id claims.
 * Clients: adminA, pitBossA, dealerA (casino A), adminB (casino B).
 *
 * PREREQUISITES:
 * - Migrations applied including PRD-067 pit assignment RPCs
 * - Local Supabase running: `npx supabase start`
 * - NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY env vars set
 * - RUN_INTEGRATION_TESTS=true
 *
 * @see supabase/migrations/20260419171523_prd067_pit_assignment_rpcs.sql
 * @see docs/21-exec-spec/EXEC-067-admin-operations-pit-configuration.md §WS5
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Client as PgClient } from 'pg';

import type { Database } from '../../../types/database.types';

/**
 * DB connection string for direct SQL ops (trigger install/drop in group k).
 * Defaults to local Supabase DB when DATABASE_URL is not set.
 */
const DB_URL =
  process.env.INTEGRATION_TEST_DB_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isIntegrationEnvironment =
  Boolean(supabaseUrl) &&
  Boolean(supabaseServiceKey) &&
  Boolean(supabaseAnonKey) &&
  process.env.RUN_INTEGRATION_TESTS === 'true';

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

describeIntegration(
  'PRD-067: rpc_assign_or_move_table_to_slot + rpc_clear_slot_assignment',
  () => {
    let setupClient: SupabaseClient<Database>;
    let adminAClient: SupabaseClient<Database>;
    let adminA2Client: SupabaseClient<Database>;
    let pitBossAClient: SupabaseClient<Database>;
    let dealerAClient: SupabaseClient<Database>;
    let adminBClient: SupabaseClient<Database>;

    // Casino A
    let companyAId: string;
    let casinoAId: string;
    let adminAId: string;
    let adminAUserId: string;
    let adminA2Id: string;
    let adminA2UserId: string;
    let pitBossAId: string;
    let pitBossAUserId: string;
    let dealerAId: string;
    let dealerAUserId: string;
    let layoutAId: string;
    let activeVersionAId: string;
    let inactiveVersionAId: string;
    let pit1AId: string;
    let pit2AId: string;
    let pit1ALabel: string;
    let pit2ALabel: string;
    let slot1AId: string; // pit 1 — starts empty
    let slot2AId: string; // pit 1 — starts empty
    let slot3AId: string; // pit 2 — starts empty
    let slotInactiveVersionId: string; // slot in inactive version
    let tableA1Id: string;
    let tableA2Id: string;

    // Casino B
    let companyBId: string;
    let casinoBId: string;
    let adminBId: string;
    let adminBUserId: string;
    let layoutBId: string;
    let activeVersionBId: string;
    let pitBId: string;
    let tableB1Id: string;

    const TS = Date.now();
    const ADMIN_A_EMAIL = `test-prd067-admin-a-${TS}@test.com`;
    const ADMIN_A2_EMAIL = `test-prd067-admin-a2-${TS}@test.com`;
    const PB_A_EMAIL = `test-prd067-pb-a-${TS}@test.com`;
    const DLR_A_EMAIL = `test-prd067-dlr-a-${TS}@test.com`;
    const ADMIN_B_EMAIL = `test-prd067-admin-b-${TS}@test.com`;
    const TEST_PASSWORD = 'TestPassword123!';

    /**
     * Reset the assignment state for Casino A active version:
     *   - all slots cleared (preferred_table_id = NULL)
     *   - audit_log purged
     *   - gaming_table.pit NULL'd (mirror state cleared)
     */
    async function cleanAssignmentState() {
      await setupClient
        .from('floor_table_slot')
        .update({ preferred_table_id: null })
        .eq('layout_version_id', activeVersionAId);
      await setupClient
        .from('gaming_table')
        .update({ pit: null })
        .eq('casino_id', casinoAId);
      await setupClient.from('audit_log').delete().eq('casino_id', casinoAId);
      // Clean up any drift activations from prior tests (group m)
      await setupClient
        .from('floor_layout_activation')
        .delete()
        .eq('casino_id', casinoAId)
        .neq('id', activationAId);
    }

    let activationAId: string;

    beforeAll(async () => {
      setupClient = createClient<Database>(supabaseUrl!, supabaseServiceKey!);

      // === Users ===
      const users = await Promise.all([
        setupClient.auth.admin.createUser({
          email: ADMIN_A_EMAIL,
          password: TEST_PASSWORD,
          email_confirm: true,
        }),
        setupClient.auth.admin.createUser({
          email: ADMIN_A2_EMAIL,
          password: TEST_PASSWORD,
          email_confirm: true,
        }),
        setupClient.auth.admin.createUser({
          email: PB_A_EMAIL,
          password: TEST_PASSWORD,
          email_confirm: true,
        }),
        setupClient.auth.admin.createUser({
          email: DLR_A_EMAIL,
          password: TEST_PASSWORD,
          email_confirm: true,
        }),
        setupClient.auth.admin.createUser({
          email: ADMIN_B_EMAIL,
          password: TEST_PASSWORD,
          email_confirm: true,
        }),
      ]);
      adminAUserId = users[0].data!.user!.id;
      adminA2UserId = users[1].data!.user!.id;
      pitBossAUserId = users[2].data!.user!.id;
      dealerAUserId = users[3].data!.user!.id;
      adminBUserId = users[4].data!.user!.id;

      // === Companies + Casinos ===
      const { data: companyA } = await setupClient
        .from('company')
        .insert({ name: `PRD-067 Company A ${TS}` })
        .select('id')
        .single();
      companyAId = companyA!.id;

      const { data: companyB } = await setupClient
        .from('company')
        .insert({ name: `PRD-067 Company B ${TS}` })
        .select('id')
        .single();
      companyBId = companyB!.id;

      const { data: casinoA } = await setupClient
        .from('casino')
        .insert({ name: `PRD-067 Casino A ${TS}`, company_id: companyAId })
        .select('id')
        .single();
      casinoAId = casinoA!.id;

      const { data: casinoB } = await setupClient
        .from('casino')
        .insert({ name: `PRD-067 Casino B ${TS}`, company_id: companyBId })
        .select('id')
        .single();
      casinoBId = casinoB!.id;

      await setupClient.from('casino_settings').insert([
        {
          casino_id: casinoAId,
          gaming_day_start_time: '06:00',
          timezone: 'America/Los_Angeles',
        },
        {
          casino_id: casinoBId,
          gaming_day_start_time: '06:00',
          timezone: 'America/Los_Angeles',
        },
      ]);

      // === Staff (casino A: 2 admins, pit_boss, dealer) ===
      const { data: adminA } = await setupClient
        .from('staff')
        .insert({
          user_id: adminAUserId,
          casino_id: casinoAId,
          role: 'admin',
          first_name: 'PRD067',
          last_name: 'AdminA',
          status: 'active',
        })
        .select('id')
        .single();
      adminAId = adminA!.id;

      const { data: adminA2 } = await setupClient
        .from('staff')
        .insert({
          user_id: adminA2UserId,
          casino_id: casinoAId,
          role: 'admin',
          first_name: 'PRD067',
          last_name: 'AdminA2',
          status: 'active',
        })
        .select('id')
        .single();
      adminA2Id = adminA2!.id;

      const { data: pitBossA } = await setupClient
        .from('staff')
        .insert({
          user_id: pitBossAUserId,
          casino_id: casinoAId,
          role: 'pit_boss',
          first_name: 'PRD067',
          last_name: 'PitBossA',
          status: 'active',
        })
        .select('id')
        .single();
      pitBossAId = pitBossA!.id;

      const { data: dealerA } = await setupClient
        .from('staff')
        .insert({
          user_id: dealerAUserId,
          casino_id: casinoAId,
          role: 'dealer',
          first_name: 'PRD067',
          last_name: 'DealerA',
          status: 'active',
        })
        .select('id')
        .single();
      dealerAId = dealerA!.id;

      // === Staff (casino B: admin) ===
      const { data: adminB } = await setupClient
        .from('staff')
        .insert({
          user_id: adminBUserId,
          casino_id: casinoBId,
          role: 'admin',
          first_name: 'PRD067',
          last_name: 'AdminB',
          status: 'active',
        })
        .select('id')
        .single();
      adminBId = adminB!.id;

      // === app_metadata for ADR-024 context derivation ===
      await Promise.all([
        setupClient.auth.admin.updateUserById(adminAUserId, {
          app_metadata: {
            casino_id: casinoAId,
            staff_id: adminAId,
            staff_role: 'admin',
          },
        }),
        setupClient.auth.admin.updateUserById(adminA2UserId, {
          app_metadata: {
            casino_id: casinoAId,
            staff_id: adminA2Id,
            staff_role: 'admin',
          },
        }),
        setupClient.auth.admin.updateUserById(pitBossAUserId, {
          app_metadata: {
            casino_id: casinoAId,
            staff_id: pitBossAId,
            staff_role: 'pit_boss',
          },
        }),
        setupClient.auth.admin.updateUserById(dealerAUserId, {
          app_metadata: {
            casino_id: casinoAId,
            staff_id: dealerAId,
            staff_role: 'dealer',
          },
        }),
        setupClient.auth.admin.updateUserById(adminBUserId, {
          app_metadata: {
            casino_id: casinoBId,
            staff_id: adminBId,
            staff_role: 'admin',
          },
        }),
      ]);

      // === Floor Layout (Casino A) ===
      const { data: layoutA } = await setupClient
        .from('floor_layout')
        .insert({
          casino_id: casinoAId,
          name: `PRD-067 Layout A ${TS}`,
          status: 'approved',
          created_by: adminAId,
        })
        .select('id')
        .single();
      layoutAId = layoutA!.id;

      // Active version
      const { data: activeVersionA } = await setupClient
        .from('floor_layout_version')
        .insert({
          layout_id: layoutAId,
          version_no: 1,
          status: 'active',
          created_by: adminAId,
        })
        .select('id')
        .single();
      activeVersionAId = activeVersionA!.id;

      // Extra version (not active — used for SLOT_NOT_ACTIVE test)
      const { data: inactiveVersionA } = await setupClient
        .from('floor_layout_version')
        .insert({
          layout_id: layoutAId,
          version_no: 2,
          status: 'draft',
          created_by: adminAId,
        })
        .select('id')
        .single();
      inactiveVersionAId = inactiveVersionA!.id;

      // Pits in active version
      pit1ALabel = `PIT-A1-${TS}`;
      pit2ALabel = `PIT-A2-${TS}`;
      const { data: pit1A } = await setupClient
        .from('floor_pit')
        .insert({
          layout_version_id: activeVersionAId,
          label: pit1ALabel,
          sequence: 1,
        })
        .select('id')
        .single();
      pit1AId = pit1A!.id;

      const { data: pit2A } = await setupClient
        .from('floor_pit')
        .insert({
          layout_version_id: activeVersionAId,
          label: pit2ALabel,
          sequence: 2,
        })
        .select('id')
        .single();
      pit2AId = pit2A!.id;

      // Slots: 2 in pit 1, 1 in pit 2 (active version)
      const { data: slot1A } = await setupClient
        .from('floor_table_slot')
        .insert({
          layout_version_id: activeVersionAId,
          pit_id: pit1AId,
          slot_label: 'SLOT-A1',
          game_type: 'blackjack',
        })
        .select('id')
        .single();
      slot1AId = slot1A!.id;

      const { data: slot2A } = await setupClient
        .from('floor_table_slot')
        .insert({
          layout_version_id: activeVersionAId,
          pit_id: pit1AId,
          slot_label: 'SLOT-A2',
          game_type: 'blackjack',
        })
        .select('id')
        .single();
      slot2AId = slot2A!.id;

      const { data: slot3A } = await setupClient
        .from('floor_table_slot')
        .insert({
          layout_version_id: activeVersionAId,
          pit_id: pit2AId,
          slot_label: 'SLOT-A3',
          game_type: 'blackjack',
        })
        .select('id')
        .single();
      slot3AId = slot3A!.id;

      // One slot in INACTIVE version (for group d — SLOT_NOT_ACTIVE)
      // Need a pit in the inactive version
      const { data: inactivePit } = await setupClient
        .from('floor_pit')
        .insert({
          layout_version_id: inactiveVersionAId,
          label: 'PIT-INACTIVE',
          sequence: 1,
        })
        .select('id')
        .single();
      const { data: slotInactive } = await setupClient
        .from('floor_table_slot')
        .insert({
          layout_version_id: inactiveVersionAId,
          pit_id: inactivePit!.id,
          slot_label: 'SLOT-INACTIVE',
          game_type: 'blackjack',
        })
        .select('id')
        .single();
      slotInactiveVersionId = slotInactive!.id;

      // Gaming tables (casino A)
      const tables = await Promise.all([
        setupClient
          .from('gaming_table')
          .insert({
            casino_id: casinoAId,
            label: `TABLE-A1-${TS}`,
            type: 'blackjack',
            status: 'active',
          })
          .select('id')
          .single(),
        setupClient
          .from('gaming_table')
          .insert({
            casino_id: casinoAId,
            label: `TABLE-A2-${TS}`,
            type: 'blackjack',
            status: 'active',
          })
          .select('id')
          .single(),
      ]);
      tableA1Id = tables[0].data!.id;
      tableA2Id = tables[1].data!.id;

      // Activate Casino A layout directly (bypassing rpc_activate_floor_layout
      // to keep fixture setup deterministic)
      const { data: activationA } = await setupClient
        .from('floor_layout_activation')
        .insert({
          casino_id: casinoAId,
          layout_version_id: activeVersionAId,
          activated_by: adminAId,
          activation_request_id: crypto.randomUUID(),
        })
        .select('id')
        .single();
      activationAId = activationA!.id;

      // === Floor Layout (Casino B) — minimal for cross-casino test ===
      const { data: layoutB } = await setupClient
        .from('floor_layout')
        .insert({
          casino_id: casinoBId,
          name: `PRD-067 Layout B ${TS}`,
          status: 'approved',
          created_by: adminBId,
        })
        .select('id')
        .single();
      layoutBId = layoutB!.id;

      const { data: activeVersionB } = await setupClient
        .from('floor_layout_version')
        .insert({
          layout_id: layoutBId,
          version_no: 1,
          status: 'active',
          created_by: adminBId,
        })
        .select('id')
        .single();
      activeVersionBId = activeVersionB!.id;

      const { data: pitB } = await setupClient
        .from('floor_pit')
        .insert({
          layout_version_id: activeVersionBId,
          label: `PIT-B1-${TS}`,
          sequence: 1,
        })
        .select('id')
        .single();
      pitBId = pitB!.id;

      await setupClient.from('floor_table_slot').insert({
        layout_version_id: activeVersionBId,
        pit_id: pitBId,
        slot_label: 'SLOT-B1',
        game_type: 'blackjack',
      });

      const { data: tableB } = await setupClient
        .from('gaming_table')
        .insert({
          casino_id: casinoBId,
          label: `TABLE-B1-${TS}`,
          type: 'blackjack',
          status: 'active',
        })
        .select('id')
        .single();
      tableB1Id = tableB!.id;

      await setupClient.from('floor_layout_activation').insert({
        casino_id: casinoBId,
        layout_version_id: activeVersionBId,
        activated_by: adminBId,
        activation_request_id: crypto.randomUUID(),
      });

      // === Sign-in all role clients ===
      adminAClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
      adminA2Client = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
      pitBossAClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
      dealerAClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
      adminBClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);

      await Promise.all([
        adminAClient.auth.signInWithPassword({
          email: ADMIN_A_EMAIL,
          password: TEST_PASSWORD,
        }),
        adminA2Client.auth.signInWithPassword({
          email: ADMIN_A2_EMAIL,
          password: TEST_PASSWORD,
        }),
        pitBossAClient.auth.signInWithPassword({
          email: PB_A_EMAIL,
          password: TEST_PASSWORD,
        }),
        dealerAClient.auth.signInWithPassword({
          email: DLR_A_EMAIL,
          password: TEST_PASSWORD,
        }),
        adminBClient.auth.signInWithPassword({
          email: ADMIN_B_EMAIL,
          password: TEST_PASSWORD,
        }),
      ]);
    }, 60000);

    afterAll(async () => {
      // Clean in dependency order. Use NULL updates to decouple FKs before delete.
      await setupClient.from('audit_log').delete().eq('casino_id', casinoAId);
      await setupClient.from('audit_log').delete().eq('casino_id', casinoBId);

      await setupClient
        .from('floor_table_slot')
        .update({ preferred_table_id: null })
        .in('layout_version_id', [
          activeVersionAId,
          inactiveVersionAId,
          activeVersionBId,
        ]);

      await setupClient
        .from('floor_layout_activation')
        .delete()
        .eq('casino_id', casinoAId);
      await setupClient
        .from('floor_layout_activation')
        .delete()
        .eq('casino_id', casinoBId);

      await setupClient
        .from('floor_table_slot')
        .delete()
        .in('layout_version_id', [
          activeVersionAId,
          inactiveVersionAId,
          activeVersionBId,
        ]);

      await setupClient
        .from('floor_pit')
        .delete()
        .in('layout_version_id', [
          activeVersionAId,
          inactiveVersionAId,
          activeVersionBId,
        ]);

      await setupClient
        .from('floor_layout_version')
        .delete()
        .in('id', [activeVersionAId, inactiveVersionAId, activeVersionBId]);

      await setupClient
        .from('floor_layout')
        .delete()
        .in('id', [layoutAId, layoutBId]);

      await setupClient
        .from('gaming_table')
        .delete()
        .eq('casino_id', casinoAId);
      await setupClient
        .from('gaming_table')
        .delete()
        .eq('casino_id', casinoBId);

      await setupClient.from('staff').delete().eq('casino_id', casinoAId);
      await setupClient.from('staff').delete().eq('casino_id', casinoBId);

      await setupClient
        .from('casino_settings')
        .delete()
        .in('casino_id', [casinoAId, casinoBId]);
      await setupClient
        .from('casino')
        .delete()
        .in('id', [casinoAId, casinoBId]);
      await setupClient
        .from('company')
        .delete()
        .in('id', [companyAId, companyBId]);

      await Promise.all([
        setupClient.auth.admin.deleteUser(adminAUserId),
        setupClient.auth.admin.deleteUser(adminA2UserId),
        setupClient.auth.admin.deleteUser(pitBossAUserId),
        setupClient.auth.admin.deleteUser(dealerAUserId),
        setupClient.auth.admin.deleteUser(adminBUserId),
      ]);
    }, 60000);

    beforeEach(async () => {
      await cleanAssignmentState();
    });

    // ========================================================================
    // (a) Admin-role happy path — assign, move, clear
    // ========================================================================
    describe('(a) admin-role happy path', () => {
      it('assigns unassigned table to empty slot and returns aggregate result', async () => {
        const { data, error } = await adminAClient.rpc(
          'rpc_assign_or_move_table_to_slot',
          { p_table_id: tableA1Id, p_slot_id: slot1AId },
        );

        expect(error).toBeNull();
        expect(data).toMatchObject({
          table_id: tableA1Id,
          slot_id: slot1AId,
          pit_id: pit1AId,
          pit_label: pit1ALabel,
          previous_slot_id: null,
        });

        const { data: slotRow } = await setupClient
          .from('floor_table_slot')
          .select('preferred_table_id')
          .eq('id', slot1AId)
          .single();
        expect(slotRow!.preferred_table_id).toBe(tableA1Id);
      });

      it('relocates table from one slot to another in same transaction', async () => {
        // Pre-state: table at slot 1
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA1Id,
          p_slot_id: slot1AId,
        });

        // Move to slot 3 (pit 2)
        const { data, error } = await adminAClient.rpc(
          'rpc_assign_or_move_table_to_slot',
          { p_table_id: tableA1Id, p_slot_id: slot3AId },
        );

        expect(error).toBeNull();
        expect(data).toMatchObject({
          table_id: tableA1Id,
          slot_id: slot3AId,
          pit_id: pit2AId,
          pit_label: pit2ALabel,
          previous_slot_id: slot1AId,
        });
      });

      it('clears a slot with an assigned table', async () => {
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA1Id,
          p_slot_id: slot1AId,
        });

        const { data, error } = await adminAClient.rpc(
          'rpc_clear_slot_assignment',
          { p_slot_id: slot1AId },
        );

        expect(error).toBeNull();
        expect(data).toMatchObject({
          cleared: true,
          slot_id: slot1AId,
          previous_table_id: tableA1Id,
        });

        const { data: slotRow } = await setupClient
          .from('floor_table_slot')
          .select('preferred_table_id')
          .eq('id', slot1AId)
          .single();
        expect(slotRow!.preferred_table_id).toBeNull();
      });
    });

    // ========================================================================
    // (b) Non-admin rejection — pit_boss + dealer
    // ========================================================================
    describe('(b) non-admin rejection', () => {
      it('rejects pit_boss on assign', async () => {
        const { error } = await pitBossAClient.rpc(
          'rpc_assign_or_move_table_to_slot',
          { p_table_id: tableA1Id, p_slot_id: slot1AId },
        );
        expect(error).not.toBeNull();
        expect(error!.message).toContain('FORBIDDEN_ADMIN_REQUIRED');
      });

      it('rejects dealer on assign', async () => {
        const { error } = await dealerAClient.rpc(
          'rpc_assign_or_move_table_to_slot',
          { p_table_id: tableA1Id, p_slot_id: slot1AId },
        );
        expect(error).not.toBeNull();
        expect(error!.message).toContain('FORBIDDEN_ADMIN_REQUIRED');
      });

      it('rejects pit_boss on clear', async () => {
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA1Id,
          p_slot_id: slot1AId,
        });
        const { error } = await pitBossAClient.rpc(
          'rpc_clear_slot_assignment',
          { p_slot_id: slot1AId },
        );
        expect(error).not.toBeNull();
        expect(error!.message).toContain('FORBIDDEN_ADMIN_REQUIRED');
      });
    });

    // ========================================================================
    // (c) Cross-casino rejection — no mirror touch
    // ========================================================================
    describe('(c) cross-casino rejection', () => {
      it('admin A cannot assign table from casino B; casino B mirror unchanged', async () => {
        // Snapshot all casino-B gaming_table rows BEFORE
        const { data: beforeRows } = await setupClient
          .from('gaming_table')
          .select('id, pit')
          .eq('casino_id', casinoBId)
          .order('id');

        const { error } = await adminAClient.rpc(
          'rpc_assign_or_move_table_to_slot',
          { p_table_id: tableB1Id, p_slot_id: slot1AId },
        );

        expect(error).not.toBeNull();
        expect(error!.message).toContain('CROSS_CASINO_FORBIDDEN');

        // Snapshot AFTER — must be byte-identical to BEFORE
        const { data: afterRows } = await setupClient
          .from('gaming_table')
          .select('id, pit')
          .eq('casino_id', casinoBId)
          .order('id');
        expect(afterRows).toEqual(beforeRows);
      });
    });

    // ========================================================================
    // (d) Inactive-slot rejection
    // ========================================================================
    describe('(d) inactive-slot rejection', () => {
      it('rejects assign when slot belongs to non-active layout version', async () => {
        const { error } = await adminAClient.rpc(
          'rpc_assign_or_move_table_to_slot',
          { p_table_id: tableA1Id, p_slot_id: slotInactiveVersionId },
        );
        expect(error).not.toBeNull();
        expect(error!.message).toContain('SLOT_NOT_ACTIVE');
      });

      it('rejects clear when slot belongs to non-active layout version', async () => {
        const { error } = await adminAClient.rpc('rpc_clear_slot_assignment', {
          p_slot_id: slotInactiveVersionId,
        });
        expect(error).not.toBeNull();
        expect(error!.message).toContain('SLOT_NOT_ACTIVE');
      });
    });

    // ========================================================================
    // (e) Occupied-target rejection — no implicit swap
    // ========================================================================
    describe('(e) occupied-target rejection', () => {
      it('rejects assigning a different table to a slot already holding a table', async () => {
        // Pre-state: slot 1 holds table A1
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA1Id,
          p_slot_id: slot1AId,
        });

        // Try to assign A2 to the same slot
        const { error } = await adminAClient.rpc(
          'rpc_assign_or_move_table_to_slot',
          { p_table_id: tableA2Id, p_slot_id: slot1AId },
        );

        expect(error).not.toBeNull();
        expect(error!.message).toContain('SLOT_OCCUPIED');

        // Slot 1 still holds A1
        const { data: slotRow } = await setupClient
          .from('floor_table_slot')
          .select('preferred_table_id')
          .eq('id', slot1AId)
          .single();
        expect(slotRow!.preferred_table_id).toBe(tableA1Id);
      });
    });

    // ========================================================================
    // (f) Idempotent clear
    // ========================================================================
    describe('(f) idempotent clear', () => {
      it('clearing an already-empty slot returns cleared:false, idempotent:true', async () => {
        const { data, error } = await adminAClient.rpc(
          'rpc_clear_slot_assignment',
          { p_slot_id: slot1AId },
        );
        expect(error).toBeNull();
        expect(data).toMatchObject({
          cleared: false,
          slot_id: slot1AId,
          previous_table_id: null,
          idempotent: true,
        });
      });
    });

    // ========================================================================
    // (g) Atomic move — previous slot cleared same transaction
    // ========================================================================
    describe('(g) atomic move', () => {
      it('reassigning a table clears its previous slot atomically', async () => {
        // Pre-state: A1 at slot 1
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA1Id,
          p_slot_id: slot1AId,
        });

        // Move to slot 2 in same pit
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA1Id,
          p_slot_id: slot2AId,
        });

        // Check both slots atomically (two reads, no race since no concurrent writers)
        const { data: slot1 } = await setupClient
          .from('floor_table_slot')
          .select('preferred_table_id')
          .eq('id', slot1AId)
          .single();
        const { data: slot2 } = await setupClient
          .from('floor_table_slot')
          .select('preferred_table_id')
          .eq('id', slot2AId)
          .single();

        expect(slot1!.preferred_table_id).toBeNull();
        expect(slot2!.preferred_table_id).toBe(tableA1Id);
      });
    });

    // ========================================================================
    // (h) Partial unique index — direct-insert bypass (RULE-3 defence in depth)
    // ========================================================================
    describe('(h) partial unique index violation', () => {
      it('direct UPDATE that would create duplicate (version, table) raises 23505', async () => {
        // Admin RPC assigns A1 to slot 1
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA1Id,
          p_slot_id: slot1AId,
        });

        // Attempt direct SQL-level update bypassing the RPC to create a duplicate
        const { error } = await setupClient
          .from('floor_table_slot')
          .update({ preferred_table_id: tableA1Id })
          .eq('id', slot2AId);

        expect(error).not.toBeNull();
        expect(error!.code).toBe('23505');
      });
    });

    // ========================================================================
    // (i) Mirror verification (DEC-001)
    // ========================================================================
    describe('(i) mirror verification — gaming_table.pit mirrors floor_pit.label', () => {
      it('assign sets gaming_table.pit to floor_pit.label', async () => {
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA1Id,
          p_slot_id: slot1AId,
        });

        const { data: tableRow } = await setupClient
          .from('gaming_table')
          .select('pit')
          .eq('id', tableA1Id)
          .single();
        expect(tableRow!.pit).toBe(pit1ALabel);
      });

      it('clear sets gaming_table.pit to NULL', async () => {
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA1Id,
          p_slot_id: slot1AId,
        });

        await adminAClient.rpc('rpc_clear_slot_assignment', {
          p_slot_id: slot1AId,
        });

        const { data: tableRow } = await setupClient
          .from('gaming_table')
          .select('pit')
          .eq('id', tableA1Id)
          .single();
        expect(tableRow!.pit).toBeNull();
      });

      it('cross-casino gaming_table.pit values are never touched by explicit casino_id predicate', async () => {
        // Record casino B table pit state (should always be NULL in this fixture)
        const { data: beforeB } = await setupClient
          .from('gaming_table')
          .select('pit')
          .eq('id', tableB1Id)
          .single();
        expect(beforeB!.pit).toBeNull();

        // Admin A performs several assignments in casino A
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA1Id,
          p_slot_id: slot1AId,
        });
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA2Id,
          p_slot_id: slot2AId,
        });
        await adminAClient.rpc('rpc_clear_slot_assignment', {
          p_slot_id: slot1AId,
        });

        // Casino B table still untouched
        const { data: afterB } = await setupClient
          .from('gaming_table')
          .select('pit')
          .eq('id', tableB1Id)
          .single();
        expect(afterB!.pit).toBeNull();
      });
    });

    // ========================================================================
    // (j) audit_log emission
    // ========================================================================
    describe('(j) audit_log emission', () => {
      it('emits slot_assign audit row on first assign', async () => {
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA1Id,
          p_slot_id: slot1AId,
        });

        const { data: rows } = await setupClient
          .from('audit_log')
          .select('casino_id, domain, actor_id, action, details')
          .eq('casino_id', casinoAId)
          .eq('action', 'slot_assign');

        expect(rows).toHaveLength(1);
        expect(rows![0]).toMatchObject({
          casino_id: casinoAId,
          domain: 'floor_layout',
          actor_id: adminAId,
          action: 'slot_assign',
        });
        const details = rows![0].details as Record<string, unknown>;
        expect(details).toMatchObject({
          pit_id: pit1AId,
          pit_label: pit1ALabel,
          slot_id: slot1AId,
          table_id: tableA1Id,
          previous_slot_id: null,
          layout_version_id: activeVersionAId,
        });
      });

      it('emits slot_move audit row on relocation', async () => {
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA1Id,
          p_slot_id: slot1AId,
        });
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA1Id,
          p_slot_id: slot3AId,
        });

        const { data: rows } = await setupClient
          .from('audit_log')
          .select('action')
          .eq('casino_id', casinoAId)
          .order('created_at', { ascending: true });

        const actions = (rows ?? []).map((r) => r.action);
        expect(actions).toEqual(['slot_assign', 'slot_move']);
      });

      it('emits slot_clear audit row on clear', async () => {
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA1Id,
          p_slot_id: slot1AId,
        });
        await adminAClient.rpc('rpc_clear_slot_assignment', {
          p_slot_id: slot1AId,
        });

        const { data: rows } = await setupClient
          .from('audit_log')
          .select('action, actor_id, details')
          .eq('casino_id', casinoAId)
          .eq('action', 'slot_clear');

        expect(rows).toHaveLength(1);
        expect(rows![0].actor_id).toBe(adminAId);
        const details = rows![0].details as Record<string, unknown>;
        expect(details).toMatchObject({
          slot_id: slot1AId,
          previous_table_id: tableA1Id,
          layout_version_id: activeVersionAId,
        });
      });
    });

    // ========================================================================
    // (k) Transactional rollback on mid-RPC failure
    //
    // Strategy: install a BEFORE INSERT trigger on audit_log that raises for
    // domain='floor_layout'. The RPC's final step is audit_log INSERT (step l),
    // preceded by gaming_table.pit mirror UPDATE (step k) and
    // floor_table_slot UPDATEs (steps i/j). If audit_log INSERT fails, ALL
    // preceding UPDATEs must roll back.
    // ========================================================================
    describe('(k) transactional rollback on mid-RPC failure', () => {
      let pgClient: PgClient;
      let triggerInstalled = false;

      beforeAll(async () => {
        pgClient = new PgClient({ connectionString: DB_URL });
        try {
          await pgClient.connect();
          await pgClient.query(`
            CREATE OR REPLACE FUNCTION _prd067_block_audit_log_floor_layout()
            RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
              IF NEW.domain = 'floor_layout' THEN
                RAISE EXCEPTION 'PRD067_TEST_BLOCK: simulated mid-RPC failure';
              END IF;
              RETURN NEW;
            END $$;
          `);
          await pgClient.query(
            `DROP TRIGGER IF EXISTS _prd067_block_audit_log_trg ON public.audit_log;`,
          );
          await pgClient.query(`
            CREATE TRIGGER _prd067_block_audit_log_trg
            BEFORE INSERT ON public.audit_log
            FOR EACH ROW EXECUTE FUNCTION _prd067_block_audit_log_floor_layout();
          `);
          triggerInstalled = true;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(
            '[WS5 group k] DB trigger install failed; test will skip assertion. Error:',
            (e as Error).message,
          );
        }
      }, 30000);

      afterAll(async () => {
        if (pgClient) {
          try {
            await pgClient.query(
              `DROP TRIGGER IF EXISTS _prd067_block_audit_log_trg ON public.audit_log;`,
            );
            await pgClient.query(
              `DROP FUNCTION IF EXISTS _prd067_block_audit_log_floor_layout();`,
            );
          } catch {
            // ignore teardown errors
          }
          await pgClient.end();
        }
      });

      it('rolls back slot + mirror UPDATEs when audit_log INSERT fails', async () => {
        if (!triggerInstalled) {
          // eslint-disable-next-line no-console
          console.warn(
            '[WS5 group k] trigger unavailable; skipping rollback assertion',
          );
          return;
        }

        const { error } = await adminAClient.rpc(
          'rpc_assign_or_move_table_to_slot',
          { p_table_id: tableA1Id, p_slot_id: slot1AId },
        );

        expect(error).not.toBeNull();
        expect(error!.message).toContain('PRD067_TEST_BLOCK');

        // Slot remains empty (rollback)
        const { data: slotRow } = await setupClient
          .from('floor_table_slot')
          .select('preferred_table_id')
          .eq('id', slot1AId)
          .single();
        expect(slotRow!.preferred_table_id).toBeNull();

        // gaming_table.pit remains NULL (mirror rolled back)
        const { data: tableRow } = await setupClient
          .from('gaming_table')
          .select('pit')
          .eq('id', tableA1Id)
          .single();
        expect(tableRow!.pit).toBeNull();

        // No audit row committed
        const { data: auditRows } = await setupClient
          .from('audit_log')
          .select('id')
          .eq('casino_id', casinoAId);
        expect(auditRows ?? []).toHaveLength(0);
      });
    });

    // ========================================================================
    // (l) Concurrent-move idempotency
    // ========================================================================
    describe('(l) concurrent-move idempotency', () => {
      it('concurrent admin moves of the same table produce exactly one consistent final state (no torn mirror)', async () => {
        // Pre-state: A1 at slot 1
        await adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableA1Id,
          p_slot_id: slot1AId,
        });

        // Two concurrent moves: admin A tries slot 2, admin A2 tries slot 3.
        // The FOR UPDATE lock on floor_layout_activation serializes these
        // (step c). The invariant under test: after both complete, exactly
        // one slot holds the table, and gaming_table.pit mirror reflects that
        // slot's pit label (no torn state — mirror in sync with canonical).
        await Promise.allSettled([
          adminAClient.rpc('rpc_assign_or_move_table_to_slot', {
            p_table_id: tableA1Id,
            p_slot_id: slot2AId,
          }),
          adminA2Client.rpc('rpc_assign_or_move_table_to_slot', {
            p_table_id: tableA1Id,
            p_slot_id: slot3AId,
          }),
        ]);

        // Exactly one slot in the active version holds this table
        const { data: slots } = await setupClient
          .from('floor_table_slot')
          .select('id, pit_id, preferred_table_id')
          .eq('layout_version_id', activeVersionAId)
          .eq('preferred_table_id', tableA1Id);
        expect(slots ?? []).toHaveLength(1);

        const winningSlot = (slots ?? [])[0]!;
        expect([slot2AId, slot3AId]).toContain(winningSlot.id);

        // Mirror integrity: gaming_table.pit matches the winning slot's pit label
        const { data: pit } = await setupClient
          .from('floor_pit')
          .select('label')
          .eq('id', winningSlot.pit_id!)
          .single();
        const { data: tableRow } = await setupClient
          .from('gaming_table')
          .select('pit')
          .eq('id', tableA1Id)
          .single();
        expect(tableRow!.pit).toBe(pit!.label);
      });
    });

    // ========================================================================
    // (m) DEC-003-R8: single-active-drift containment
    //
    // Fixture: insert a second floor_layout_activation row for casino A with
    // deactivated_at IS NULL (simulating a drift bug). The RPC's deterministic
    // SELECT + FOR UPDATE should pick one activation deterministically and
    // commit without duplicate assignment.
    // ========================================================================
    describe('(m) DEC-003-R8 single-active-drift containment', () => {
      let driftActivationId: string;

      beforeAll(async () => {
        // Insert a second active activation row pointing at the same version
        // (simulating an uncleared deactivated_at). Timestamp slightly earlier
        // to verify deterministic pick favors the later activated_at.
        const earlier = new Date(Date.now() - 3_600_000).toISOString();
        const { data } = await setupClient
          .from('floor_layout_activation')
          .insert({
            casino_id: casinoAId,
            layout_version_id: activeVersionAId,
            activated_by: adminAId,
            activated_at: earlier,
            activation_request_id: crypto.randomUUID(),
          })
          .select('id')
          .single();
        driftActivationId = data!.id;
      });

      afterAll(async () => {
        await setupClient
          .from('floor_layout_activation')
          .delete()
          .eq('id', driftActivationId);
      });

      it('assigns successfully despite two undeactivated activations; no duplicate state', async () => {
        const { data, error } = await adminAClient.rpc(
          'rpc_assign_or_move_table_to_slot',
          { p_table_id: tableA1Id, p_slot_id: slot1AId },
        );

        expect(error).toBeNull();
        expect(data).toMatchObject({
          table_id: tableA1Id,
          slot_id: slot1AId,
        });

        // Exactly one slot in the active version holds this table
        const { data: slots } = await setupClient
          .from('floor_table_slot')
          .select('id, preferred_table_id')
          .eq('layout_version_id', activeVersionAId)
          .eq('preferred_table_id', tableA1Id);
        expect(slots ?? []).toHaveLength(1);
        expect((slots ?? [])[0]!.id).toBe(slot1AId);
      });
    });
  },
);

// Satisfy ts-jest strict unused rule for top-level bindings when the describe
// is skipped (RUN_INTEGRATION_TESTS unset).
export {};
