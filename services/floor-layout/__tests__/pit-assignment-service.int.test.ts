/** @jest-environment node */

/**
 * PRD-067: FloorLayoutService pit-assignment wrapper integration tests.
 *
 * Exercises the WS2 service layer (getPitAssignmentState,
 * assignOrMoveTableToSlot, clearSlotAssignment) and verifies typed
 * DomainError mapping from RPC exceptions.
 *
 * Uses Mode C JWT auth (admin A). A no-layout casino is created to
 * exercise the NO_ACTIVE_LAYOUT + null-aggregate branches.
 *
 * @see services/floor-layout/crud.ts § mapPitAssignmentRpcError
 * @see services/floor-layout/mappers.ts § toPitAssignmentStateDTO
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '../../../lib/errors/domain-errors';
import type { Database } from '../../../types/database.types';
import {
  assignOrMoveTableToSlot,
  clearSlotAssignment,
  getPitAssignmentState,
} from '../crud';

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
  'PRD-067: FloorLayoutService pit-assignment wrappers',
  () => {
    let setupClient: SupabaseClient<Database>;
    let adminClient: SupabaseClient<Database>;
    let pitBossClient: SupabaseClient<Database>;

    let companyId: string;
    let casinoId: string;
    let emptyCasinoId: string;
    let companyIdEmpty: string;
    let adminId: string;
    let adminUserId: string;
    let pitBossId: string;
    let pitBossUserId: string;

    let activeVersionId: string;
    let pitId: string;
    let pitLabel: string;
    let slotId: string;
    let slotInactiveId: string;
    let inactiveVersionId: string;
    let tableId: string;
    let tableOtherCasinoId: string;
    let otherCompanyId: string;
    let otherCasinoId: string;

    const TS = Date.now();
    const ADMIN_EMAIL = `test-prd067-svc-admin-${TS}@test.com`;
    const PB_EMAIL = `test-prd067-svc-pb-${TS}@test.com`;
    const TEST_PASSWORD = 'TestPassword123!';

    beforeAll(async () => {
      setupClient = createClient<Database>(supabaseUrl!, supabaseServiceKey!);

      const [adminUser, pbUser] = await Promise.all([
        setupClient.auth.admin.createUser({
          email: ADMIN_EMAIL,
          password: TEST_PASSWORD,
          email_confirm: true,
        }),
        setupClient.auth.admin.createUser({
          email: PB_EMAIL,
          password: TEST_PASSWORD,
          email_confirm: true,
        }),
      ]);
      adminUserId = adminUser.data!.user!.id;
      pitBossUserId = pbUser.data!.user!.id;

      const { data: company } = await setupClient
        .from('company')
        .insert({ name: `PRD-067 SvcCo ${TS}` })
        .select('id')
        .single();
      companyId = company!.id;

      const { data: casino } = await setupClient
        .from('casino')
        .insert({ name: `PRD-067 SvcCasino ${TS}`, company_id: companyId })
        .select('id')
        .single();
      casinoId = casino!.id;

      const { data: emptyCompany } = await setupClient
        .from('company')
        .insert({ name: `PRD-067 EmptyCo ${TS}` })
        .select('id')
        .single();
      companyIdEmpty = emptyCompany!.id;

      const { data: emptyCasino } = await setupClient
        .from('casino')
        .insert({
          name: `PRD-067 EmptyCasino ${TS}`,
          company_id: companyIdEmpty,
        })
        .select('id')
        .single();
      emptyCasinoId = emptyCasino!.id;

      // Second unrelated casino for cross-casino table
      const { data: otherCompany } = await setupClient
        .from('company')
        .insert({ name: `PRD-067 OtherCo ${TS}` })
        .select('id')
        .single();
      otherCompanyId = otherCompany!.id;
      const { data: otherCasino } = await setupClient
        .from('casino')
        .insert({
          name: `PRD-067 OtherCasino ${TS}`,
          company_id: otherCompanyId,
        })
        .select('id')
        .single();
      otherCasinoId = otherCasino!.id;

      await setupClient.from('casino_settings').insert([
        {
          casino_id: casinoId,
          gaming_day_start_time: '06:00',
          timezone: 'America/Los_Angeles',
        },
        {
          casino_id: emptyCasinoId,
          gaming_day_start_time: '06:00',
          timezone: 'America/Los_Angeles',
        },
        {
          casino_id: otherCasinoId,
          gaming_day_start_time: '06:00',
          timezone: 'America/Los_Angeles',
        },
      ]);

      const { data: adminStaff } = await setupClient
        .from('staff')
        .insert({
          user_id: adminUserId,
          casino_id: casinoId,
          role: 'admin',
          first_name: 'Svc',
          last_name: 'Admin',
          status: 'active',
        })
        .select('id')
        .single();
      adminId = adminStaff!.id;

      const { data: pbStaff } = await setupClient
        .from('staff')
        .insert({
          user_id: pitBossUserId,
          casino_id: casinoId,
          role: 'pit_boss',
          first_name: 'Svc',
          last_name: 'PitBoss',
          status: 'active',
        })
        .select('id')
        .single();
      pitBossId = pbStaff!.id;

      await Promise.all([
        setupClient.auth.admin.updateUserById(adminUserId, {
          app_metadata: {
            casino_id: casinoId,
            staff_id: adminId,
            staff_role: 'admin',
          },
        }),
        setupClient.auth.admin.updateUserById(pitBossUserId, {
          app_metadata: {
            casino_id: casinoId,
            staff_id: pitBossId,
            staff_role: 'pit_boss',
          },
        }),
      ]);

      // Layout, active version + inactive version
      const { data: layout } = await setupClient
        .from('floor_layout')
        .insert({
          casino_id: casinoId,
          name: `PRD-067 Svc Layout ${TS}`,
          status: 'approved',
          created_by: adminId,
        })
        .select('id')
        .single();

      const { data: activeVersion } = await setupClient
        .from('floor_layout_version')
        .insert({
          layout_id: layout!.id,
          version_no: 1,
          status: 'active',
          created_by: adminId,
        })
        .select('id')
        .single();
      activeVersionId = activeVersion!.id;

      const { data: inactiveVersion } = await setupClient
        .from('floor_layout_version')
        .insert({
          layout_id: layout!.id,
          version_no: 2,
          status: 'draft',
          created_by: adminId,
        })
        .select('id')
        .single();
      inactiveVersionId = inactiveVersion!.id;

      pitLabel = `SVC-PIT-${TS}`;
      const { data: pit } = await setupClient
        .from('floor_pit')
        .insert({
          layout_version_id: activeVersionId,
          label: pitLabel,
          sequence: 1,
        })
        .select('id')
        .single();
      pitId = pit!.id;

      const { data: slot } = await setupClient
        .from('floor_table_slot')
        .insert({
          layout_version_id: activeVersionId,
          pit_id: pitId,
          slot_label: 'SVC-SLOT-1',
          game_type: 'blackjack',
        })
        .select('id')
        .single();
      slotId = slot!.id;

      // Inactive-version slot (for SLOT_NOT_ACTIVE)
      const { data: inactivePit } = await setupClient
        .from('floor_pit')
        .insert({
          layout_version_id: inactiveVersionId,
          label: 'SVC-PIT-INACTIVE',
          sequence: 1,
        })
        .select('id')
        .single();
      const { data: slotInactive } = await setupClient
        .from('floor_table_slot')
        .insert({
          layout_version_id: inactiveVersionId,
          pit_id: inactivePit!.id,
          slot_label: 'SVC-SLOT-INACTIVE',
          game_type: 'blackjack',
        })
        .select('id')
        .single();
      slotInactiveId = slotInactive!.id;

      const { data: table } = await setupClient
        .from('gaming_table')
        .insert({
          casino_id: casinoId,
          label: `SVC-TABLE-${TS}`,
          type: 'blackjack',
          status: 'active',
        })
        .select('id')
        .single();
      tableId = table!.id;

      const { data: otherTable } = await setupClient
        .from('gaming_table')
        .insert({
          casino_id: otherCasinoId,
          label: `SVC-OTHER-${TS}`,
          type: 'blackjack',
          status: 'active',
        })
        .select('id')
        .single();
      tableOtherCasinoId = otherTable!.id;

      // Activate layout for primary casino
      await setupClient.from('floor_layout_activation').insert({
        casino_id: casinoId,
        layout_version_id: activeVersionId,
        activated_by: adminId,
        activation_request_id: crypto.randomUUID(),
      });

      // Sign-in clients
      adminClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
      pitBossClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
      await Promise.all([
        adminClient.auth.signInWithPassword({
          email: ADMIN_EMAIL,
          password: TEST_PASSWORD,
        }),
        pitBossClient.auth.signInWithPassword({
          email: PB_EMAIL,
          password: TEST_PASSWORD,
        }),
      ]);
    }, 60000);

    afterAll(async () => {
      // Clean dependent state then tables / auth
      await setupClient
        .from('floor_table_slot')
        .update({ preferred_table_id: null })
        .in('layout_version_id', [activeVersionId, inactiveVersionId]);
      await setupClient
        .from('audit_log')
        .delete()
        .in('casino_id', [casinoId, emptyCasinoId, otherCasinoId]);
      await setupClient
        .from('floor_layout_activation')
        .delete()
        .eq('casino_id', casinoId);
      await setupClient
        .from('floor_table_slot')
        .delete()
        .in('layout_version_id', [activeVersionId, inactiveVersionId]);
      await setupClient
        .from('floor_pit')
        .delete()
        .in('layout_version_id', [activeVersionId, inactiveVersionId]);
      await setupClient
        .from('floor_layout_version')
        .delete()
        .in('id', [activeVersionId, inactiveVersionId]);
      await setupClient.from('floor_layout').delete().eq('casino_id', casinoId);
      await setupClient
        .from('gaming_table')
        .delete()
        .in('casino_id', [casinoId, otherCasinoId]);
      await setupClient.from('staff').delete().eq('casino_id', casinoId);
      await setupClient
        .from('casino_settings')
        .delete()
        .in('casino_id', [casinoId, emptyCasinoId, otherCasinoId]);
      await setupClient
        .from('casino')
        .delete()
        .in('id', [casinoId, emptyCasinoId, otherCasinoId]);
      await setupClient
        .from('company')
        .delete()
        .in('id', [companyId, companyIdEmpty, otherCompanyId]);
      await Promise.all([
        setupClient.auth.admin.deleteUser(adminUserId),
        setupClient.auth.admin.deleteUser(pitBossUserId),
      ]);
    }, 60000);

    async function resetSlotAssignment() {
      await setupClient
        .from('floor_table_slot')
        .update({ preferred_table_id: null })
        .eq('layout_version_id', activeVersionId);
      await setupClient
        .from('gaming_table')
        .update({ pit: null })
        .eq('casino_id', casinoId);
    }

    // ========================================================================
    // getPitAssignmentState — happy + null
    // ========================================================================
    describe('getPitAssignmentState', () => {
      beforeAll(resetSlotAssignment);

      it('returns null when casino has no active layout', async () => {
        // emptyCasinoId has no floor_layout_activation rows. Service-role
        // client reads the aggregate — RLS context is irrelevant for this
        // path (function uses explicit casino_id filter).
        const result = await getPitAssignmentState(setupClient, emptyCasinoId);
        expect(result).toBeNull();
      });

      it('aggregates pits + slots + unassigned_tables for active layout', async () => {
        const result = await getPitAssignmentState(setupClient, casinoId);
        expect(result).not.toBeNull();
        expect(result!.layout_version_id).toBe(activeVersionId);
        expect(result!.pits.length).toBeGreaterThanOrEqual(1);
        expect(result!.pits.some((p) => p.id === pitId)).toBe(true);
        expect(result!.slots.some((s) => s.id === slotId)).toBe(true);
        expect(result!.unassigned_tables.some((t) => t.id === tableId)).toBe(
          true,
        );
      });

      it('moves table from unassigned_tables to slot.assigned_table after assign', async () => {
        await adminClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableId,
          p_slot_id: slotId,
        });

        const result = await getPitAssignmentState(setupClient, casinoId);
        expect(result).not.toBeNull();

        const slot = result!.slots.find((s) => s.id === slotId)!;
        expect(slot.preferred_table_id).toBe(tableId);
        expect(slot.assigned_table).not.toBeNull();
        expect(slot.assigned_table!.id).toBe(tableId);

        expect(result!.unassigned_tables.some((t) => t.id === tableId)).toBe(
          false,
        );

        // Cleanup
        await resetSlotAssignment();
      });
    });

    // ========================================================================
    // assignOrMoveTableToSlot — DTO shape
    // ========================================================================
    describe('assignOrMoveTableToSlot', () => {
      beforeAll(resetSlotAssignment);

      it('returns AssignOrMoveResultDTO with typed fields on happy path', async () => {
        const result = await assignOrMoveTableToSlot(
          adminClient,
          tableId,
          slotId,
        );
        expect(result).toEqual({
          table_id: tableId,
          slot_id: slotId,
          pit_id: pitId,
          pit_label: pitLabel,
          previous_slot_id: null,
        });

        await resetSlotAssignment();
      });
    });

    // ========================================================================
    // clearSlotAssignment — idempotent + non-idempotent
    // ========================================================================
    describe('clearSlotAssignment', () => {
      beforeAll(resetSlotAssignment);

      it('returns { cleared: true, previous_table_id } when slot held a table', async () => {
        await adminClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableId,
          p_slot_id: slotId,
        });

        const result = await clearSlotAssignment(adminClient, slotId);
        expect(result).toMatchObject({
          cleared: true,
          slot_id: slotId,
          previous_table_id: tableId,
        });
        // Non-idempotent branch does not include the idempotent flag
        expect(result.idempotent).toBeUndefined();

        await resetSlotAssignment();
      });

      it('returns { cleared: false, idempotent: true } for empty slot', async () => {
        const result = await clearSlotAssignment(adminClient, slotId);
        expect(result).toMatchObject({
          cleared: false,
          slot_id: slotId,
          previous_table_id: null,
          idempotent: true,
        });
      });
    });

    // ========================================================================
    // mapPitAssignmentRpcError — typed DomainError surfacing per RPC error
    // ========================================================================
    describe('mapPitAssignmentRpcError surfaces typed DomainErrors', () => {
      beforeAll(resetSlotAssignment);

      it('FORBIDDEN_ADMIN_REQUIRED (403) for non-admin caller', async () => {
        await expect(
          assignOrMoveTableToSlot(pitBossClient, tableId, slotId),
        ).rejects.toMatchObject({
          code: 'FORBIDDEN_ADMIN_REQUIRED',
          httpStatus: 403,
        });
      });

      it('SLOT_NOT_FOUND (404) for unknown slot id', async () => {
        const ghostSlotId = crypto.randomUUID();
        await expect(
          assignOrMoveTableToSlot(adminClient, tableId, ghostSlotId),
        ).rejects.toMatchObject({
          code: 'SLOT_NOT_FOUND',
        });
      });

      it('SLOT_NOT_ACTIVE (409) for slot in non-active layout version', async () => {
        await expect(
          assignOrMoveTableToSlot(adminClient, tableId, slotInactiveId),
        ).rejects.toMatchObject({
          code: 'SLOT_NOT_ACTIVE',
          httpStatus: 409,
        });
      });

      it('TABLE_NOT_FOUND for unknown table id', async () => {
        const ghostTableId = crypto.randomUUID();
        await expect(
          assignOrMoveTableToSlot(adminClient, ghostTableId, slotId),
        ).rejects.toMatchObject({
          code: 'TABLE_NOT_FOUND',
        });
      });

      it('CROSS_CASINO_FORBIDDEN (403) for table from different casino', async () => {
        await expect(
          assignOrMoveTableToSlot(adminClient, tableOtherCasinoId, slotId),
        ).rejects.toMatchObject({
          code: 'CROSS_CASINO_FORBIDDEN',
          httpStatus: 403,
        });
      });

      it('SLOT_OCCUPIED (409) when target slot already holds a different table', async () => {
        await adminClient.rpc('rpc_assign_or_move_table_to_slot', {
          p_table_id: tableId,
          p_slot_id: slotId,
        });

        // Create a second table to attempt conflict
        const { data: otherLocalTable } = await setupClient
          .from('gaming_table')
          .insert({
            casino_id: casinoId,
            label: `SVC-OCC-${TS}`,
            type: 'blackjack',
            status: 'active',
          })
          .select('id')
          .single();

        await expect(
          assignOrMoveTableToSlot(adminClient, otherLocalTable!.id, slotId),
        ).rejects.toMatchObject({
          code: 'SLOT_OCCUPIED',
          httpStatus: 409,
        });

        // Cleanup
        await setupClient
          .from('gaming_table')
          .delete()
          .eq('id', otherLocalTable!.id);
        await resetSlotAssignment();
      });

      it('thrown error is a DomainError instance with safe details (no circular Error ref)', async () => {
        let thrown: unknown = null;
        try {
          await assignOrMoveTableToSlot(
            adminClient,
            tableOtherCasinoId,
            slotId,
          );
        } catch (e) {
          thrown = e;
        }
        expect(thrown).toBeInstanceOf(DomainError);
        const err = thrown as DomainError;
        expect(err.details).toBeDefined();
        // safeErrorDetails returns either a Record or a string — never a raw Error
        expect(err.details instanceof Error).toBe(false);
      });
    });
  },
);

export {};
