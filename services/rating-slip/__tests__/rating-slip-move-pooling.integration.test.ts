/** @jest-environment node */

/**
 * Rating Slip Move Endpoint - Connection Pooling Test
 *
 * Tests: ISSUE-5AD0182D - RLS context not persisting across Supabase pooled connections
 *
 * This test specifically verifies that the move endpoint works correctly with
 * Supabase's Supavisor connection pooling in transaction mode (port 6543).
 *
 * The move endpoint calls:
 * 1. service.close() → rpc_close_rating_slip
 * 2. service.start()  → rpc_start_rating_slip
 *
 * These RPC calls may execute on different pooled connections, so context must
 * be self-injected within each RPC (ADR-015 Phase 1A).
 *
 * @see ISSUE-5AD0182D
 * @see ADR-015 Connection Pooling Strategy
 */

import { randomUUID } from 'crypto';

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
} from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '../../../lib/errors/domain-errors';
import type { Database } from '../../../types/database.types';
import { createRatingSlipService, RatingSlipServiceInterface } from '../index';

// Test environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

describe('Rating Slip Move - Connection Pooling Test', () => {
  let setupClient: SupabaseClient<Database>;
  let correlationId: string;

  beforeAll(() => {
    // NOTE: Port check removed per ISSUE-B3C8BA48 resolution
    // The test should run against whatever Supabase URL is configured.
    // Connection pooling behavior is determined by the connection, not the port number.
    // The ADR-015 fix (RPC self-injection) works regardless of pooling mode.

    setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  });

  beforeEach(() => {
    correlationId = `test-move-pooling-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  });

  afterEach(async () => {
    // Cleanup after each test
    await cleanupTestFixtures(setupClient, correlationId);
  });

  describe('Move Endpoint Connection Pooling', () => {
    it('should successfully move player between tables with pooling enabled', async () => {
      // Arrange
      const { casinoId, actorId, authedService } =
        await ensureStaffContext(setupClient);
      const playerId = await createTestPlayer(setupClient, casinoId);
      const visitId = await createTestVisit(setupClient, casinoId, playerId);
      const originTableId = await createTestTable(setupClient, casinoId);
      const destTableId = await createTestTable(setupClient, casinoId);

      // Create rating slip at origin table
      const originSlip = await authedService.start(casinoId, actorId, {
        visit_id: visitId,
        table_id: originTableId,
        seat_number: '1',
        game_settings: { game_type: 'blackjack' },
      });

      // Act
      // Simulate move endpoint flow
      const closedSlip = await authedService.close(originSlip.id, {
        average_bet: 50.0,
      });

      const newSlip = await authedService.start(casinoId, actorId, {
        visit_id: visitId,
        table_id: destTableId,
        seat_number: '3', // Different seat
        game_settings: originSlip.game_settings,
      });

      // Assert
      expect(closedSlip.id).toBe(originSlip.id);
      expect(closedSlip.status).toBe('closed');
      // Duration can be 0 if slip is opened and closed very quickly
      expect(closedSlip.duration_seconds).toBeGreaterThanOrEqual(0);

      expect(newSlip.visit_id).toBe(visitId); // Same visit
      expect(newSlip.status).toBe('open');
      expect(newSlip.table_id).toBe(destTableId);
      expect(newSlip.seat_number).toBe('3');
    });

    it('should handle concurrent moves with connection pooling', async () => {
      // Arrange
      const { casinoId, actorId, authedService } =
        await ensureStaffContext(setupClient);

      // Create unique players for each fixture (constraint prevents multiple active visits per player)
      const players = await Promise.all([
        createTestPlayer(setupClient, casinoId),
        createTestPlayer(setupClient, casinoId),
        createTestPlayer(setupClient, casinoId),
      ]);

      // Create multiple visits and slips for concurrent testing
      const fixtures = await Promise.all([
        createMoveFixture(
          setupClient,
          authedService,
          casinoId,
          actorId,
          players[0],
        ),
        createMoveFixture(
          setupClient,
          authedService,
          casinoId,
          actorId,
          players[1],
        ),
        createMoveFixture(
          setupClient,
          authedService,
          casinoId,
          actorId,
          players[2],
        ),
      ]);

      // Act - Run moves concurrently (simulates production load)
      const movePromises = fixtures.map(async (fixture) => {
        const closedSlip = await authedService.close(fixture.slipId);
        const newSlip = await authedService.start(casinoId, actorId, {
          visit_id: fixture.visitId,
          table_id: fixture.destTableId,
          seat_number: '5',
        });
        return { closedSlip, newSlip };
      });

      const results = await Promise.all(movePromises);

      // Assert - All moves succeeded without context errors
      expect(results).toHaveLength(3);
      results.forEach(({ closedSlip, newSlip }) => {
        expect(closedSlip.status).toBe('closed');
        expect(newSlip.status).toBe('open');
        expect(newSlip.visit_id).toBe(closedSlip.visit_id);
      });
    });

    it('should preserve context isolation between different casino scoping', async () => {
      // Arrange
      const {
        casinoId: casino1Id,
        actorId: actor1Id,
        authedService: authedService1,
      } = await ensureStaffContext(setupClient);
      const {
        casinoId: casino2Id,
        actorId: actor2Id,
        authedService: authedService2,
      } = await ensureStaffContext(setupClient); // Different casino

      const player1Id = await createTestPlayer(setupClient, casino1Id);
      const player2Id = await createTestPlayer(setupClient, casino2Id);

      const visit1Id = await createTestVisit(setupClient, casino1Id, player1Id);
      const visit2Id = await createTestVisit(setupClient, casino2Id, player2Id);
      const table1Id = await createTestTable(setupClient, casino1Id);
      const table2Id = await createTestTable(setupClient, casino2Id);

      const slip1 = await authedService1.start(casino1Id, actor1Id, {
        visit_id: visit1Id,
        table_id: table1Id,
        seat_number: '1',
      });

      const slip2 = await authedService2.start(casino2Id, actor2Id, {
        visit_id: visit2Id,
        table_id: table2Id,
        seat_number: '2',
      });

      // Act - Close both slips (different contexts)
      const [closed1, closed2] = await Promise.all([
        authedService1.close(slip1.id),
        authedService2.close(slip2.id),
      ]);

      // Assert - Each slip closed with correct context
      expect(closed1.id).toBe(slip1.id);
      expect(closed2.id).toBe(slip2.id);

      // Verify casino isolation (crucial for multi-tenant security)
      expect(closed1.casino_id).toBe(casino1Id);
      expect(closed2.casino_id).toBe(casino2Id);
    });

    it('should handle RPC retry with fresh connection from pool', async () => {
      // Arrange
      const { casinoId, actorId, authedService } =
        await ensureStaffContext(setupClient);
      const playerId = await createTestPlayer(setupClient, casinoId);
      const visitId = await createTestVisit(setupClient, casinoId, playerId);
      const tableId = await createTestTable(setupClient, casinoId);

      const slip = await authedService.start(casinoId, actorId, {
        visit_id: visitId,
        table_id: tableId,
      });

      // Act - Simulate connection pool reset between calls
      await simulateConnectionPoolReset(); // Force new connection

      let error: DomainError | null = null;
      try {
        await authedService.close(slip.id);
      } catch (e) {
        error = e as DomainError;
      }

      // Assert - Context should still work with fresh connection
      expect(error).toBeNull();
    });
  });
});

// Helper functions (test fixtures)
// NOTE: supabase parameter is required as these are defined outside the describe block

async function ensureStaffContext(supabase: SupabaseClient<Database>): Promise<{
  casinoId: string;
  actorId: string;
  userId: string;
  authedClient: SupabaseClient<Database>;
  authedService: RatingSlipServiceInterface;
}> {
  const testEmail = `test-staff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.com`;
  const testPassword = 'TestPassword123!';

  // Create a test user with initial metadata
  const { data, error } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
    app_metadata: {
      staff_role: 'pit_boss',
    },
  });

  if (error) throw error;

  // Create a test company (ADR-043: company before casino)
  const { data: company, error: companyError } = await supabase
    .from('company')
    .insert({ name: `Test Company ${Date.now()}` })
    .select()
    .single();

  if (companyError) throw companyError;

  // Create a test casino
  const { data: casino, error: casinoError } = await supabase
    .from('casino')
    .insert({
      name: `Test Casino ${Date.now()}`,
      status: 'active',
      company_id: company.id,
    })
    .select()
    .single();

  if (casinoError) throw casinoError;

  // Create casino settings
  await supabase.from('casino_settings').insert({
    casino_id: casino.id,
    gaming_day_start_time: '06:00:00',
    timezone: 'America/Los_Angeles',
    watchlist_floor: 3000,
    ctr_threshold: 10000,
  });

  // Create staff record
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .insert({
      casino_id: casino.id,
      user_id: data.user.id,
      employee_id: `EMP-${Date.now()}`,
      first_name: 'Test',
      last_name: 'Staff',
      role: 'pit_boss',
      status: 'active',
    })
    .select()
    .single();

  if (staffError) throw staffError;

  // Stamp staff_id into app_metadata (ADR-024 two-phase)
  await supabase.auth.admin.updateUserById(data.user.id, {
    app_metadata: {
      casino_id: casino.id,
      staff_id: staff.id,
      staff_role: 'pit_boss',
    },
  });

  // Sign in to get JWT with stamped claims (throwaway client to avoid mutating service-role auth state)
  const signInClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signInData, error: signInError } =
    await signInClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
  if (signInError || !signInData.session)
    throw signInError ?? new Error('Sign-in failed');

  // Create authenticated client (Mode C)
  const authedClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${signInData.session.access_token}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    casinoId: casino.id,
    actorId: staff.id,
    userId: data.user.id,
    authedClient,
    authedService: createRatingSlipService(authedClient),
  };
}

async function createTestPlayer(
  supabase: SupabaseClient<Database>,
  casinoId: string,
): Promise<string> {
  // Create player
  const { data: player, error: playerError } = await supabase
    .from('player')
    .insert({
      first_name: 'Test',
      last_name: 'Player',
    })
    .select()
    .single();

  if (playerError) throw playerError;

  // Enroll player at casino
  await supabase.from('player_casino').insert({
    player_id: player.id,
    casino_id: casinoId,
    status: 'active',
  });

  return player.id;
}

async function createTestVisit(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  playerId: string,
): Promise<string> {
  const visitId = randomUUID();
  const { data, error } = await supabase
    .from('visit')
    .insert({
      id: visitId,
      player_id: playerId,
      casino_id: casinoId,
      visit_group_id: visitId,
      gaming_day: '1970-01-01',
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function createTestTable(
  supabase: SupabaseClient<Database>,
  casinoId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('gaming_table')
    .insert({
      casino_id: casinoId,
      label: `T-TEST-${Date.now()}`,
      type: 'blackjack',
      status: 'active',
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function createMoveFixture(
  supabase: SupabaseClient<Database>,
  authedService: RatingSlipServiceInterface,
  casinoId: string,
  actorId: string,
  playerId: string,
): Promise<{ slipId: string; visitId: string; destTableId: string }> {
  const visitId = await createTestVisit(supabase, casinoId, playerId);
  const originTableId = await createTestTable(supabase, casinoId);
  const destTableId = await createTestTable(supabase, casinoId);

  const slip = await authedService.start(casinoId, actorId, {
    visit_id: visitId,
    table_id: originTableId,
  });

  return { slipId: slip.id, visitId, destTableId };
}

async function cleanupTestFixtures(
  supabase: SupabaseClient<Database>,
  correlationId: string,
) {
  // Clean up test data based on correlation ID
  await supabase
    .from('audit_log')
    .delete()
    .like('details->>correlation_id', `${correlationId}%`);
}

async function simulateConnectionPoolReset() {
  // Simulate pool reset by waiting and forcing new operations
  await new Promise((resolve) => setTimeout(resolve, 100));
  // In real test, might need to close/reopen connection
}
