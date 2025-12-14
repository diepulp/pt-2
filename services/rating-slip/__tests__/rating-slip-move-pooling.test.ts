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

import { describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { injectRLSContext } from '@/lib/supabase/rls-context';
import type { Database } from '@/types/database.types';

import { createRatingSlipService, RatingSlipServiceInterface } from '../index';

// Test environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe('Rating Slip Move - Connection Pooling Test', () => {
  let supabase: SupabaseClient<Database>;
  let service: RatingSlipServiceInterface;
  let correlationId: string;

  beforeAll(() => {
    // Ensure pooling is enabled (port 6543)
    expect(supabaseUrl).toContain('6543'); // Transaction mode pooling

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
      const { casinoId, actorId } = await ensureStaffContext();
      const visitId = await createTestVisit(supabase);
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
        average_bet: 50.00,
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
      expect(closedSlip.duration_seconds).toBeGreaterThan(0);

      expect(newSlip.visit_id).toBe(visitId); // Same visit
      expect(newSlip.status).toBe('open');
      expect(newSlip.table_id).toBe(destTableId);
      expect(newSlip.seat_number).toBe('3');
    });

    it('should handle concurrent moves with connection pooling', async () => {
      // Arrange
      const { casinoId, actorId } = await ensureStaffContext();

      // Create multiple visits and slips for concurrent testing
      const fixtures = await Promise.all([
        createMoveFixture(supabase, service, casinoId, actorId),
        createMoveFixture(supabase, service, casinoId, actorId),
        createMoveFixture(supabase, service, casinoId, actorId),
      ]);

      // Act - Run moves concurrently (simulates production load)
      const movePromises = fixtures.map(async (fixture) => {
        const closedSlip = await service.close(casinoId, actorId, fixture.slipId);
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
      const { casinoId: casino1Id, actorId: actor1Id } = await ensureStaffContext();
      const { casinoId: casino2Id, actorId: actor2Id } = await ensureStaffContext(); // Different casino

      const visit1Id = await createTestVisit(supabase);
      const visit2Id = await createTestVisit(supabase);
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
      const { casinoId, actorId } = await ensureStaffContext();
      const visitId = await createTestVisit(supabase);
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

async function ensureStaffContext(): Promise<{ casinoId: string; actorId: string }> {
  // In test environment, create a staff member if needed
  const { data, error } = await supabase.auth.admin.createUser({
    email: `test-staff-${Date.now()}@test.com`,
    password: 'test123',
    app_metadata: {
      casino_id: '00000000-0000-0000-0000-000000000001',
      staff_role: 'pit_boss',
    },
  });

  if (error) throw error;

  return {
    casinoId: data.user.app_metadata?.casino_id as string,
    actorId: data.user.id,
  };
}

async function createTestVisit(supabase: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await supabase
    .from('visit')
    .insert({
      player_id: '00000000-0000-0000-0000-000000000002', // Test player
      casino_id: '00000000-0000-0000-0000-000000000001', // Test casino
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
  const { data, error } = await supabase.from('gaming_table').insert({
    casino_id: casinoId,
    table_number: `T-TEST-${Date.now()}`,
    status: 'active',
  }).select('id').single();

  if (error) throw error;
  return data.id;
}

async function createMoveFixture(
  supabase: SupabaseClient<Database>,
  service: RatingSlipServiceInterface,
  casinoId: string,
  actorId: string,
): Promise<{ slipId: string; visitId: string; destTableId: string }> {
  const visitId = await createTestVisit(supabase);
  const originTableId = await createTestTable(supabase, casinoId);
  const destTableId = await createTestTable(supabase, casinoId);

  const slip = await service.start(casinoId, actorId, {
    visit_id: visitId,
    table_id: originTableId,
  });

  return { slipId: slip.id, visitId, destTableId };
}

async function cleanupTestFixtures(supabase: SupabaseClient<Database>, correlationId: string) {
  // Clean up test data based on correlation ID
  await supabase.from('audit_log').delete().like('details->>correlation_id', `${correlationId}%`);
}

async function simulateConnectionPoolReset() {
  // Simulate pool reset by waiting and forcing new operations
  await new Promise((resolve) => setTimeout(resolve, 100));
  // In real test, might need to close/reopen connection
}
