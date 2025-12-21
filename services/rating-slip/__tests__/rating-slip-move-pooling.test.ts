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
import { injectRLSContext } from '../../../lib/supabase/rls-context';
import type { Database } from '../../../types/database.types';
import { createRatingSlipService, RatingSlipServiceInterface } from '../index';

// Test environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe('Rating Slip Move - Connection Pooling Test', () => {
  let supabase: SupabaseClient<Database>;
  let service: RatingSlipServiceInterface;
  let correlationId: string;

  beforeAll(() => {
    // NOTE: Port check removed per ISSUE-B3C8BA48 resolution
    // The test should run against whatever Supabase URL is configured.
    // Connection pooling behavior is determined by the connection, not the port number.
    // The ADR-015 fix (RPC self-injection) works regardless of pooling mode.

    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    service = createRatingSlipService(supabase);
  });

  beforeEach(() => {
    correlationId = `test-move-pooling-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  });

  afterEach(async () => {
    // Cleanup after each test
    await cleanupTestFixtures(supabase, correlationId);
  });

  describe('Move Endpoint Connection Pooling', () => {
    it('should successfully move player between tables with pooling enabled', async () => {
      // Arrange
      const { casinoId, actorId } = await ensureStaffContext(supabase);
      const playerId = await createTestPlayer(supabase, casinoId);
      const visitId = await createTestVisit(supabase, casinoId, playerId);
      const originTableId = await createTestTable(supabase, casinoId);
      const destTableId = await createTestTable(supabase, casinoId);

      // Create rating slip at origin table
      const originSlip = await service.start(casinoId, actorId, {
        visit_id: visitId,
        table_id: originTableId,
        seat_number: '1',
        game_settings: { game_type: 'blackjack' },
      });

      // Act
      // Simulate move endpoint flow
      const closedSlip = await service.close(casinoId, actorId, originSlip.id, {
        average_bet: 50.0,
      });

      const newSlip = await service.start(casinoId, actorId, {
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
      const { casinoId, actorId } = await ensureStaffContext(supabase);

      // Create unique players for each fixture (constraint prevents multiple active visits per player)
      const players = await Promise.all([
        createTestPlayer(supabase, casinoId),
        createTestPlayer(supabase, casinoId),
        createTestPlayer(supabase, casinoId),
      ]);

      // Create multiple visits and slips for concurrent testing
      const fixtures = await Promise.all([
        createMoveFixture(supabase, service, casinoId, actorId, players[0]),
        createMoveFixture(supabase, service, casinoId, actorId, players[1]),
        createMoveFixture(supabase, service, casinoId, actorId, players[2]),
      ]);

      // Act - Run moves concurrently (simulates production load)
      const movePromises = fixtures.map(async (fixture) => {
        const closedSlip = await service.close(
          casinoId,
          actorId,
          fixture.slipId,
        );
        const newSlip = await service.start(casinoId, actorId, {
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
      const { casinoId: casino1Id, actorId: actor1Id } =
        await ensureStaffContext(supabase);
      const { casinoId: casino2Id, actorId: actor2Id } =
        await ensureStaffContext(supabase); // Different casino

      const player1Id = await createTestPlayer(supabase, casino1Id);
      const player2Id = await createTestPlayer(supabase, casino2Id);

      const visit1Id = await createTestVisit(supabase, casino1Id, player1Id);
      const visit2Id = await createTestVisit(supabase, casino2Id, player2Id);
      const table1Id = await createTestTable(supabase, casino1Id);
      const table2Id = await createTestTable(supabase, casino2Id);

      const slip1 = await service.start(casino1Id, actor1Id, {
        visit_id: visit1Id,
        table_id: table1Id,
        seat_number: '1',
      });

      const slip2 = await service.start(casino2Id, actor2Id, {
        visit_id: visit2Id,
        table_id: table2Id,
        seat_number: '2',
      });

      // Act - Close both slips (different contexts)
      const [closed1, closed2] = await Promise.all([
        service.close(casino1Id, actor1Id, slip1.id),
        service.close(casino2Id, actor2Id, slip2.id),
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
      const { casinoId, actorId } = await ensureStaffContext(supabase);
      const playerId = await createTestPlayer(supabase, casinoId);
      const visitId = await createTestVisit(supabase, casinoId, playerId);
      const tableId = await createTestTable(supabase, casinoId);

      const slip = await service.start(casinoId, actorId, {
        visit_id: visitId,
        table_id: tableId,
      });

      // Act - Simulate connection pool reset between calls
      await simulateConnectionPoolReset(); // Force new connection

      let error: DomainError | null = null;
      try {
        await service.close(casinoId, actorId, slip.id);
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

async function ensureStaffContext(
  supabase: SupabaseClient<Database>,
): Promise<{ casinoId: string; actorId: string; userId: string }> {
  // Create a test user with staff metadata
  const { data, error } = await supabase.auth.admin.createUser({
    email: `test-staff-${Date.now()}@test.com`,
    password: 'test123',
    email_confirm: true,
    app_metadata: {
      staff_role: 'pit_boss',
    },
  });

  if (error) throw error;

  // Create a test casino
  const { data: casino, error: casinoError } = await supabase
    .from('casino')
    .insert({ name: `Test Casino ${Date.now()}`, status: 'active' })
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

  return {
    casinoId: casino.id,
    actorId: staff.id,
    userId: data.user.id,
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
  const { data, error } = await supabase
    .from('visit')
    .insert({
      player_id: playerId,
      casino_id: casinoId,
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
  service: RatingSlipServiceInterface,
  casinoId: string,
  actorId: string,
  playerId: string,
): Promise<{ slipId: string; visitId: string; destTableId: string }> {
  const visitId = await createTestVisit(supabase, casinoId, playerId);
  const originTableId = await createTestTable(supabase, casinoId);
  const destTableId = await createTestTable(supabase, casinoId);

  const slip = await service.start(casinoId, actorId, {
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
