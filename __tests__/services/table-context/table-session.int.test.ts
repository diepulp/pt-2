/**
 * Table Session Lifecycle Integration Tests
 *
 * Integration tests for table session state machine operations.
 * Tests state transitions, constraints, and RLS policies.
 *
 * PREREQUISITES:
 * - Migrations must be applied including table_session and RPCs
 * - Local Supabase running: `npx supabase start`
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 *
 * @see PRD-TABLE-SESSION-LIFECYCLE-MVP
 * @see ADR-024 (RLS context injection)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database.types';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Skip integration tests if environment not configured
const isIntegrationEnvironment =
  supabaseUrl &&
  supabaseServiceKey &&
  process.env.RUN_INTEGRATION_TESTS === 'true';

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

describeIntegration('Table Session Lifecycle Integration Tests', () => {
  let serviceClient: SupabaseClient<Database>;

  // Test data IDs
  let casinoId: string;
  let pitBossId: string;
  let pitBossUserId: string;
  let adminId: string;
  let adminUserId: string;
  let dealerUserId: string;
  let tableId1: string;
  let tableId2: string;
  let dropEventId: string;
  let inventorySnapshotId: string;

  beforeAll(async () => {
    // Create service client (bypasses RLS)
    serviceClient = createClient<Database>(supabaseUrl!, supabaseServiceKey!);

    // Create test users
    const { data: pitBossUser } = await serviceClient.auth.admin.createUser({
      email: `test-pitboss-session-${Date.now()}@example.com`,
      password: 'test-password',
      email_confirm: true,
    });
    if (!pitBossUser?.user) throw new Error('Failed to create pit boss user');
    pitBossUserId = pitBossUser.user.id;

    const { data: adminUser } = await serviceClient.auth.admin.createUser({
      email: `test-admin-session-${Date.now()}@example.com`,
      password: 'test-password',
      email_confirm: true,
    });
    if (!adminUser?.user) throw new Error('Failed to create admin user');
    adminUserId = adminUser.user.id;

    const { data: dealerUser } = await serviceClient.auth.admin.createUser({
      email: `test-dealer-session-${Date.now()}@example.com`,
      password: 'test-password',
      email_confirm: true,
    });
    if (!dealerUser?.user) throw new Error('Failed to create dealer user');
    dealerUserId = dealerUser.user.id;

    // Create test casino with settings
    const { data: casino } = await serviceClient
      .from('casino')
      .insert({ name: 'Session Test Casino' })
      .select('id')
      .single();
    casinoId = casino!.id;

    // Create casino_settings (required for compute_gaming_day)
    await serviceClient.from('casino_settings').insert({
      casino_id: casinoId,
      gaming_day_start_time: '06:00',
      timezone: 'America/Los_Angeles',
    });

    // Create test staff - pit_boss
    const { data: pitBoss } = await serviceClient
      .from('staff')
      .insert({
        user_id: pitBossUserId,
        casino_id: casinoId,
        role: 'pit_boss',
        first_name: 'Session',
        last_name: 'Pit Boss',
        status: 'active',
      })
      .select('id')
      .single();
    pitBossId = pitBoss!.id;

    // Create test staff - admin
    const { data: admin } = await serviceClient
      .from('staff')
      .insert({
        user_id: adminUserId,
        casino_id: casinoId,
        role: 'admin',
        first_name: 'Session',
        last_name: 'Admin',
        status: 'active',
      })
      .select('id')
      .single();
    adminId = admin!.id;

    // Create test staff - dealer (should NOT be able to perform session operations)
    // Note: Dealer is created but not used in tests - kept for potential future RLS tests
    await serviceClient
      .from('staff')
      .insert({
        user_id: dealerUserId,
        casino_id: casinoId,
        role: 'dealer',
        first_name: 'Session',
        last_name: 'Dealer',
        status: 'active',
      })
      .select('id')
      .single();

    // Create test tables
    const { data: table1 } = await serviceClient
      .from('gaming_table')
      .insert({
        casino_id: casinoId,
        label: 'SESSION-01',
        type: 'blackjack',
        pit: 'PIT-A',
        status: 'active',
      })
      .select('id')
      .single();
    tableId1 = table1!.id;

    const { data: table2 } = await serviceClient
      .from('gaming_table')
      .insert({
        casino_id: casinoId,
        label: 'SESSION-02',
        type: 'blackjack',
        pit: 'PIT-A',
        status: 'active',
      })
      .select('id')
      .single();
    tableId2 = table2!.id;

    // Create test drop event (for close operation)
    const { data: drop } = await serviceClient
      .from('table_drop_event')
      .insert({
        casino_id: casinoId,
        table_id: tableId1,
        staff_id: pitBossId,
        cash_drop_cents: 100000,
      })
      .select('id')
      .single();
    dropEventId = drop!.id;

    // Create test inventory snapshot (for close operation)
    const { data: snapshot } = await serviceClient
      .from('table_inventory_snapshot')
      .insert({
        casino_id: casinoId,
        table_id: tableId1,
        counted_by: pitBossId,
        chipset: { '1': 100, '5': 50, '25': 20 },
        snapshot_type: 'close',
      })
      .select('id')
      .single();
    inventorySnapshotId = snapshot!.id;
  });

  afterAll(async () => {
    // Cleanup test data in reverse order of dependencies
    await serviceClient
      .from('table_session')
      .delete()
      .eq('casino_id', casinoId);
    await serviceClient
      .from('table_inventory_snapshot')
      .delete()
      .eq('casino_id', casinoId);
    await serviceClient
      .from('table_drop_event')
      .delete()
      .eq('casino_id', casinoId);
    await serviceClient.from('gaming_table').delete().eq('casino_id', casinoId);
    await serviceClient.from('staff').delete().eq('casino_id', casinoId);
    await serviceClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', casinoId);
    await serviceClient.from('casino').delete().eq('id', casinoId);
    await serviceClient.auth.admin.deleteUser(pitBossUserId);
    await serviceClient.auth.admin.deleteUser(adminUserId);
    await serviceClient.auth.admin.deleteUser(dealerUserId);
  });

  describe('rpc_open_table_session', () => {
    let createdSessionId: string | null = null;

    afterAll(async () => {
      // Cleanup any sessions created in this describe block
      if (createdSessionId) {
        await serviceClient
          .from('table_session')
          .delete()
          .eq('id', createdSessionId);
      }
    });

    it('opens a new session in ACTIVE state', async () => {
      // Set RLS context first (service client bypasses RLS for setup)
      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { data, error } = await serviceClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId2, // Use table2 to avoid conflicts
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.id).toBeDefined();
      expect(data.status).toBe('ACTIVE');
      expect(data.casino_id).toBe(casinoId);
      expect(data.gaming_table_id).toBe(tableId2);
      expect(data.opened_by_staff_id).toBe(pitBossId);
      expect(data.gaming_day).toBeDefined();
      expect(data.opened_at).toBeDefined();

      createdSessionId = data.id;
    });

    it('auto-computes gaming_day based on casino settings', async () => {
      // Clean up any existing session on table1
      await serviceClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId1)
        .neq('status', 'CLOSED');

      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { data, error } = await serviceClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId1,
        },
      );

      expect(error).toBeNull();
      expect(data.gaming_day).toBeDefined();
      // Gaming day should be a valid date format (YYYY-MM-DD)
      expect(data.gaming_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Cleanup
      await serviceClient.from('table_session').delete().eq('id', data.id);
    });

    it('allows admin to open session', async () => {
      // Clean up any existing session on table2
      await serviceClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId2)
        .neq('status', 'CLOSED');

      await serviceClient.rpc('set_rls_context', {
        p_actor_id: adminId,
        p_casino_id: casinoId,
        p_staff_role: 'admin',
      });

      const { data, error } = await serviceClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId2,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.opened_by_staff_id).toBe(adminId);

      // Cleanup
      await serviceClient.from('table_session').delete().eq('id', data.id);
    });
  });

  describe('Double-open Prevention (Constraint Test)', () => {
    let existingSessionId: string;

    beforeAll(async () => {
      // Ensure no existing session on table1
      await serviceClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId1)
        .neq('status', 'CLOSED');

      // Create an active session
      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { data } = await serviceClient.rpc('rpc_open_table_session', {
        p_gaming_table_id: tableId1,
      });
      existingSessionId = data!.id;
    });

    afterAll(async () => {
      await serviceClient
        .from('table_session')
        .delete()
        .eq('id', existingSessionId);
    });

    it('prevents opening second session for same table', async () => {
      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { error } = await serviceClient.rpc('rpc_open_table_session', {
        p_gaming_table_id: tableId1,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('active_session_exists');
    });

    it('allows opening session for different table', async () => {
      // Clean up any existing session on table2
      await serviceClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId2)
        .neq('status', 'CLOSED');

      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { data, error } = await serviceClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId2,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.gaming_table_id).toBe(tableId2);

      // Cleanup
      await serviceClient.from('table_session').delete().eq('id', data.id);
    });
  });

  describe('State Machine Transitions', () => {
    let sessionId: string;

    beforeAll(async () => {
      // Ensure no existing session on table1
      await serviceClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId1)
        .neq('status', 'CLOSED');

      // Create a fresh session
      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { data } = await serviceClient.rpc('rpc_open_table_session', {
        p_gaming_table_id: tableId1,
      });
      sessionId = data!.id;
    });

    afterAll(async () => {
      await serviceClient.from('table_session').delete().eq('id', sessionId);
    });

    it('transitions ACTIVE → RUNDOWN', async () => {
      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { data, error } = await serviceClient.rpc(
        'rpc_start_table_rundown',
        {
          p_table_session_id: sessionId,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.status).toBe('RUNDOWN');
      expect(data.rundown_started_at).toBeDefined();
      expect(data.rundown_started_by_staff_id).toBe(pitBossId);
    });

    it('prevents RUNDOWN → RUNDOWN (already in rundown)', async () => {
      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { error } = await serviceClient.rpc('rpc_start_table_rundown', {
        p_table_session_id: sessionId,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('invalid_state_transition');
    });

    it('transitions RUNDOWN → CLOSED with drop_event_id', async () => {
      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { data, error } = await serviceClient.rpc(
        'rpc_close_table_session',
        {
          p_table_session_id: sessionId,
          p_drop_event_id: dropEventId,
          p_notes: 'Test close with drop event',
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.status).toBe('CLOSED');
      expect(data.closed_at).toBeDefined();
      expect(data.closed_by_staff_id).toBe(pitBossId);
      expect(data.drop_event_id).toBe(dropEventId);
      expect(data.notes).toBe('Test close with drop event');
    });
  });

  describe('Close Session Artifact Requirements', () => {
    let sessionId: string;

    beforeAll(async () => {
      // Create a fresh session in RUNDOWN state
      await serviceClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId2)
        .neq('status', 'CLOSED');

      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { data: opened } = await serviceClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId2,
        },
      );

      await serviceClient.rpc('rpc_start_table_rundown', {
        p_table_session_id: opened!.id,
      });

      sessionId = opened!.id;
    });

    afterAll(async () => {
      await serviceClient.from('table_session').delete().eq('id', sessionId);
    });

    it('rejects close without any artifact', async () => {
      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { error } = await serviceClient.rpc('rpc_close_table_session', {
        p_table_session_id: sessionId,
        // No drop_event_id or closing_inventory_snapshot_id
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('missing_closing_artifact');
    });

    it('accepts close with closing_inventory_snapshot_id', async () => {
      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { data, error } = await serviceClient.rpc(
        'rpc_close_table_session',
        {
          p_table_session_id: sessionId,
          p_closing_inventory_snapshot_id: inventorySnapshotId,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.status).toBe('CLOSED');
      expect(data.closing_inventory_snapshot_id).toBe(inventorySnapshotId);
    });
  });

  describe('rpc_get_current_table_session', () => {
    let activeSessionId: string;

    beforeAll(async () => {
      // Create active session on table1
      await serviceClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId1)
        .neq('status', 'CLOSED');

      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { data } = await serviceClient.rpc('rpc_open_table_session', {
        p_gaming_table_id: tableId1,
      });
      activeSessionId = data!.id;
    });

    afterAll(async () => {
      await serviceClient
        .from('table_session')
        .delete()
        .eq('id', activeSessionId);
    });

    it('returns current session for table with active session', async () => {
      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { data, error } = await serviceClient.rpc(
        'rpc_get_current_table_session',
        {
          p_gaming_table_id: tableId1,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.id).toBe(activeSessionId);
      expect(data.status).not.toBe('CLOSED');
    });

    it('returns null for table without active session', async () => {
      // Ensure table2 has no active session
      await serviceClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId2)
        .neq('status', 'CLOSED');

      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { data, error } = await serviceClient.rpc(
        'rpc_get_current_table_session',
        {
          p_gaming_table_id: tableId2,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeNull();
    });
  });

  describe('Shortcut Close (ACTIVE → CLOSED)', () => {
    let sessionId: string;

    beforeAll(async () => {
      // Create fresh ACTIVE session (not in RUNDOWN)
      await serviceClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId2)
        .neq('status', 'CLOSED');

      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { data } = await serviceClient.rpc('rpc_open_table_session', {
        p_gaming_table_id: tableId2,
      });
      sessionId = data!.id;
    });

    afterAll(async () => {
      await serviceClient.from('table_session').delete().eq('id', sessionId);
    });

    it('allows closing directly from ACTIVE state (shortcut)', async () => {
      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { data, error } = await serviceClient.rpc(
        'rpc_close_table_session',
        {
          p_table_session_id: sessionId,
          p_drop_event_id: dropEventId,
          p_notes: 'Shortcut close from ACTIVE',
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.status).toBe('CLOSED');
      // Rundown fields should NOT be set for shortcut close
      expect(data.rundown_started_at).toBeNull();
      expect(data.rundown_started_by_staff_id).toBeNull();
    });
  });

  describe('Invalid State Transitions', () => {
    let closedSessionId: string;

    beforeAll(async () => {
      // Create and immediately close a session
      await serviceClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId2)
        .neq('status', 'CLOSED');

      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { data: opened } = await serviceClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId2,
        },
      );

      const { data: closed } = await serviceClient.rpc(
        'rpc_close_table_session',
        {
          p_table_session_id: opened!.id,
          p_drop_event_id: dropEventId,
        },
      );

      closedSessionId = closed!.id;
    });

    afterAll(async () => {
      await serviceClient
        .from('table_session')
        .delete()
        .eq('id', closedSessionId);
    });

    it('prevents rundown on CLOSED session', async () => {
      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { error } = await serviceClient.rpc('rpc_start_table_rundown', {
        p_table_session_id: closedSessionId,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('invalid_state_transition');
    });

    it('prevents close on already CLOSED session', async () => {
      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const { error } = await serviceClient.rpc('rpc_close_table_session', {
        p_table_session_id: closedSessionId,
        p_drop_event_id: dropEventId,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('invalid_state_transition');
    });

    it('rejects non-existent session ID', async () => {
      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      const fakeId = '00000000-0000-0000-0000-000000000000';

      const { error } = await serviceClient.rpc('rpc_start_table_rundown', {
        p_table_session_id: fakeId,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('session_not_found');
    });
  });

  describe('Reopen After Close', () => {
    it('allows opening new session after previous is closed', async () => {
      // Clean up any existing sessions
      await serviceClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId2)
        .neq('status', 'CLOSED');

      await serviceClient.rpc('set_rls_context', {
        p_actor_id: pitBossId,
        p_casino_id: casinoId,
        p_staff_role: 'pit_boss',
      });

      // Open first session
      const { data: session1 } = await serviceClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId2,
        },
      );

      // Close it
      await serviceClient.rpc('rpc_close_table_session', {
        p_table_session_id: session1!.id,
        p_drop_event_id: dropEventId,
      });

      // Open second session - should succeed
      const { data: session2, error } = await serviceClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId2,
        },
      );

      expect(error).toBeNull();
      expect(session2).toBeDefined();
      expect(session2.id).not.toBe(session1!.id);
      expect(session2.status).toBe('ACTIVE');

      // Cleanup
      await serviceClient.from('table_session').delete().eq('id', session2.id);
    });
  });
});
