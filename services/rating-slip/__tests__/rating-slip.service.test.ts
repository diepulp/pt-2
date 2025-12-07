/**
 * RatingSlipService Unit Tests
 *
 * Tests the state machine transitions and CRUD operations.
 * Uses mocked Supabase client to verify business logic.
 *
 * @see services/rating-slip/crud.ts
 * @see PRD-002 Rating Slip Service
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import * as crud from '../crud';
import type {
  CreateRatingSlipInput,
  RatingSlipDTO,
  RatingSlipStatus,
} from '../dtos';

// === Test Data ===

const CASINO_ID = 'casino-123';
const ACTOR_ID = 'staff-456';
const SLIP_ID = 'slip-789';
const VISIT_ID = 'visit-abc';
const TABLE_ID = 'table-xyz';
const PLAYER_ID = 'player-def';

const mockRatingSlipRow = {
  id: SLIP_ID,
  casino_id: CASINO_ID,
  visit_id: VISIT_ID,
  table_id: TABLE_ID,
  seat_number: '3',
  start_time: '2025-01-15T10:00:00Z',
  end_time: null,
  status: 'open' as RatingSlipStatus,
  average_bet: 100,
  game_settings: { min_bet: 25, max_bet: 500 },
  policy_snapshot: { house_edge: 0.02 },
};

const mockPausedSlipRow = {
  ...mockRatingSlipRow,
  status: 'paused' as RatingSlipStatus,
};

const mockClosedSlipRow = {
  ...mockRatingSlipRow,
  status: 'closed' as RatingSlipStatus,
  end_time: '2025-01-15T14:00:00Z',
};

const mockVisitRow = {
  id: VISIT_ID,
  player_id: PLAYER_ID,
  ended_at: null,
  casino_id: CASINO_ID,
};

// === Mock Helpers ===

type MockChain = {
  select: jest.Mock;
  eq: jest.Mock;
  in: jest.Mock;
  lt: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  single: jest.Mock;
  maybeSingle: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  rpc: jest.Mock;
  from: jest.Mock;
};

function createMockChain(): MockChain {
  // Create the chain object first without circular references
  const chain: MockChain = {} as MockChain;

  // Initialize all mock functions
  chain.select = jest.fn();
  chain.eq = jest.fn();
  chain.in = jest.fn();
  chain.lt = jest.fn();
  chain.order = jest.fn();
  chain.limit = jest.fn();
  chain.single = jest.fn();
  chain.maybeSingle = jest.fn();
  chain.insert = jest.fn();
  chain.update = jest.fn();
  chain.rpc = jest.fn();
  chain.from = jest.fn();

  // Make methods chainable (all return chain for method chaining)
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.lt.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);

  return chain;
}

/**
 * Creates a thenable chain - the chain can be awaited directly.
 * This mimics Supabase's query builder behavior.
 */
function makeThenableChain(
  chain: MockChain,
  resolveValue: { data: unknown; error: unknown },
): MockChain {
  // Make chain thenable (can be awaited)
  (chain as unknown as { then: typeof Promise.prototype.then }).then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => {
    return Promise.resolve(resolveValue).then(onFulfilled, onRejected);
  };
  return chain;
}

function createMockSupabase(chain: MockChain): SupabaseClient<Database> {
  return {
    from: jest.fn().mockReturnValue(chain),
    rpc: chain.rpc,
  } as unknown as SupabaseClient<Database>;
}

// === Tests ===

describe('RatingSlipService', () => {
  let mockChain: MockChain;
  let mockSupabase: SupabaseClient<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChain = createMockChain();
    mockSupabase = createMockSupabase(mockChain);
  });

  // ===========================================================================
  // State Machine Transitions
  // ===========================================================================

  describe('State Machine Transitions', () => {
    describe('start', () => {
      it('should create a new rating slip in open state', async () => {
        // Mock visit lookup
        mockChain.maybeSingle.mockResolvedValueOnce({
          data: mockVisitRow,
          error: null,
        });

        // Mock RPC response
        mockChain.rpc.mockResolvedValue({
          data: mockRatingSlipRow,
          error: null,
        });

        const input: CreateRatingSlipInput = {
          visit_id: VISIT_ID,
          table_id: TABLE_ID,
          seat_number: '3',
        };

        const result = await crud.start(
          mockSupabase,
          CASINO_ID,
          ACTOR_ID,
          input,
        );

        expect(result.id).toBe(SLIP_ID);
        expect(result.status).toBe('open');
        expect(result.visit_id).toBe(VISIT_ID);
        expect(result.table_id).toBe(TABLE_ID);
        expect(mockChain.rpc).toHaveBeenCalledWith('rpc_start_rating_slip', {
          p_casino_id: CASINO_ID,
          p_actor_id: ACTOR_ID,
          p_visit_id: VISIT_ID,
          p_table_id: TABLE_ID,
          p_seat_number: '3',
          p_game_settings: {},
          p_player_id: PLAYER_ID,
        });
      });

      it('should throw VISIT_NOT_FOUND for non-existent visit', async () => {
        mockChain.maybeSingle.mockResolvedValue({
          data: null,
          error: null,
        });

        const input: CreateRatingSlipInput = {
          visit_id: 'nonexistent',
          table_id: TABLE_ID,
        };

        await expect(
          crud.start(mockSupabase, CASINO_ID, ACTOR_ID, input),
        ).rejects.toThrow(DomainError);

        try {
          await crud.start(mockSupabase, CASINO_ID, ACTOR_ID, input);
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('VISIT_NOT_FOUND');
        }
      });

      it('should throw VISIT_NOT_OPEN for closed visit', async () => {
        mockChain.maybeSingle.mockResolvedValue({
          data: { ...mockVisitRow, ended_at: '2025-01-15T12:00:00Z' },
          error: null,
        });

        const input: CreateRatingSlipInput = {
          visit_id: VISIT_ID,
          table_id: TABLE_ID,
        };

        await expect(
          crud.start(mockSupabase, CASINO_ID, ACTOR_ID, input),
        ).rejects.toThrow(DomainError);

        try {
          await crud.start(mockSupabase, CASINO_ID, ACTOR_ID, input);
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('VISIT_NOT_OPEN');
        }
      });

      it('should throw RATING_SLIP_INVALID_STATE for ghost visit', async () => {
        mockChain.maybeSingle.mockResolvedValue({
          data: { ...mockVisitRow, player_id: null },
          error: null,
        });

        const input: CreateRatingSlipInput = {
          visit_id: VISIT_ID,
          table_id: TABLE_ID,
        };

        await expect(
          crud.start(mockSupabase, CASINO_ID, ACTOR_ID, input),
        ).rejects.toThrow(DomainError);

        try {
          await crud.start(mockSupabase, CASINO_ID, ACTOR_ID, input);
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('RATING_SLIP_INVALID_STATE');
        }
      });

      it('should throw VISIT_CASINO_MISMATCH for wrong casino', async () => {
        mockChain.maybeSingle.mockResolvedValue({
          data: { ...mockVisitRow, casino_id: 'other-casino' },
          error: null,
        });

        const input: CreateRatingSlipInput = {
          visit_id: VISIT_ID,
          table_id: TABLE_ID,
        };

        await expect(
          crud.start(mockSupabase, CASINO_ID, ACTOR_ID, input),
        ).rejects.toThrow(DomainError);

        try {
          await crud.start(mockSupabase, CASINO_ID, ACTOR_ID, input);
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('VISIT_CASINO_MISMATCH');
        }
      });

      it('should throw RATING_SLIP_DUPLICATE for unique constraint violation', async () => {
        mockChain.maybeSingle.mockResolvedValue({
          data: mockVisitRow,
          error: null,
        });

        mockChain.rpc.mockResolvedValue({
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint',
          },
        });

        const input: CreateRatingSlipInput = {
          visit_id: VISIT_ID,
          table_id: TABLE_ID,
        };

        await expect(
          crud.start(mockSupabase, CASINO_ID, ACTOR_ID, input),
        ).rejects.toThrow(DomainError);

        try {
          await crud.start(mockSupabase, CASINO_ID, ACTOR_ID, input);
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('RATING_SLIP_DUPLICATE');
        }
      });
    });

    describe('pause', () => {
      it('should transition from open to paused via pause()', async () => {
        mockChain.rpc.mockResolvedValue({
          data: mockPausedSlipRow,
          error: null,
        });

        const result = await crud.pause(
          mockSupabase,
          CASINO_ID,
          ACTOR_ID,
          SLIP_ID,
        );

        expect(result.status).toBe('paused');
        expect(mockChain.rpc).toHaveBeenCalledWith('rpc_pause_rating_slip', {
          p_casino_id: CASINO_ID,
          p_actor_id: ACTOR_ID,
          p_rating_slip_id: SLIP_ID,
        });
      });

      it('should throw RATING_SLIP_NOT_OPEN when pausing non-open slip', async () => {
        mockChain.rpc.mockResolvedValue({
          data: null,
          error: {
            message: 'RATING_SLIP_NOT_OPEN: Rating slip is not in open state',
          },
        });

        await expect(
          crud.pause(mockSupabase, CASINO_ID, ACTOR_ID, SLIP_ID),
        ).rejects.toThrow(DomainError);

        try {
          await crud.pause(mockSupabase, CASINO_ID, ACTOR_ID, SLIP_ID);
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('RATING_SLIP_NOT_OPEN');
        }
      });

      it('should throw RATING_SLIP_NOT_FOUND when slip does not exist', async () => {
        mockChain.rpc.mockResolvedValue({
          data: null,
          error: null,
        });

        await expect(
          crud.pause(mockSupabase, CASINO_ID, ACTOR_ID, 'nonexistent'),
        ).rejects.toThrow(DomainError);

        try {
          await crud.pause(mockSupabase, CASINO_ID, ACTOR_ID, 'nonexistent');
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('RATING_SLIP_NOT_FOUND');
        }
      });
    });

    describe('resume', () => {
      it('should transition from paused to open via resume()', async () => {
        mockChain.rpc.mockResolvedValue({
          data: mockRatingSlipRow, // Returns open status
          error: null,
        });

        const result = await crud.resume(
          mockSupabase,
          CASINO_ID,
          ACTOR_ID,
          SLIP_ID,
        );

        expect(result.status).toBe('open');
        expect(mockChain.rpc).toHaveBeenCalledWith('rpc_resume_rating_slip', {
          p_casino_id: CASINO_ID,
          p_actor_id: ACTOR_ID,
          p_rating_slip_id: SLIP_ID,
        });
      });

      it('should throw RATING_SLIP_NOT_PAUSED when resuming non-paused slip', async () => {
        mockChain.rpc.mockResolvedValue({
          data: null,
          error: {
            message:
              'RATING_SLIP_NOT_PAUSED: Rating slip is not in paused state',
          },
        });

        await expect(
          crud.resume(mockSupabase, CASINO_ID, ACTOR_ID, SLIP_ID),
        ).rejects.toThrow(DomainError);

        try {
          await crud.resume(mockSupabase, CASINO_ID, ACTOR_ID, SLIP_ID);
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('RATING_SLIP_NOT_PAUSED');
        }
      });

      it('should throw RATING_SLIP_NOT_FOUND when slip does not exist', async () => {
        mockChain.rpc.mockResolvedValue({
          data: null,
          error: null,
        });

        await expect(
          crud.resume(mockSupabase, CASINO_ID, ACTOR_ID, 'nonexistent'),
        ).rejects.toThrow(DomainError);

        try {
          await crud.resume(mockSupabase, CASINO_ID, ACTOR_ID, 'nonexistent');
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('RATING_SLIP_NOT_FOUND');
        }
      });
    });

    describe('close', () => {
      it('should transition from open to closed via close()', async () => {
        const closedWithDuration = {
          slip: mockClosedSlipRow,
          duration_seconds: 14400, // 4 hours
        };

        mockChain.rpc.mockResolvedValue({
          data: closedWithDuration,
          error: null,
        });

        const result = await crud.close(
          mockSupabase,
          CASINO_ID,
          ACTOR_ID,
          SLIP_ID,
        );

        expect(result.status).toBe('closed');
        expect(result.end_time).not.toBeNull();
        expect(result.duration_seconds).toBe(14400);
        expect(mockChain.rpc).toHaveBeenCalledWith('rpc_close_rating_slip', {
          p_casino_id: CASINO_ID,
          p_actor_id: ACTOR_ID,
          p_rating_slip_id: SLIP_ID,
          p_average_bet: undefined,
        });
      });

      it('should transition from paused to closed via close() with auto-end pause', async () => {
        const closedWithDuration = {
          slip: mockClosedSlipRow,
          duration_seconds: 10800, // 3 hours (excluding pause)
        };

        mockChain.rpc.mockResolvedValue({
          data: closedWithDuration,
          error: null,
        });

        const result = await crud.close(
          mockSupabase,
          CASINO_ID,
          ACTOR_ID,
          SLIP_ID,
        );

        expect(result.status).toBe('closed');
        expect(result.duration_seconds).toBe(10800);
      });

      it('should accept optional average_bet on close', async () => {
        const closedWithDuration = {
          slip: { ...mockClosedSlipRow, average_bet: 250 },
          duration_seconds: 14400,
        };

        mockChain.rpc.mockResolvedValue({
          data: closedWithDuration,
          error: null,
        });

        const result = await crud.close(
          mockSupabase,
          CASINO_ID,
          ACTOR_ID,
          SLIP_ID,
          { average_bet: 250 },
        );

        expect(result.average_bet).toBe(250);
        expect(mockChain.rpc).toHaveBeenCalledWith('rpc_close_rating_slip', {
          p_casino_id: CASINO_ID,
          p_actor_id: ACTOR_ID,
          p_rating_slip_id: SLIP_ID,
          p_average_bet: 250,
        });
      });

      it('should throw RATING_SLIP_ALREADY_CLOSED when closing already closed slip', async () => {
        mockChain.rpc.mockResolvedValue({
          data: null,
          error: {
            message:
              'RATING_SLIP_ALREADY_CLOSED: Rating slip has already been closed',
          },
        });

        await expect(
          crud.close(mockSupabase, CASINO_ID, ACTOR_ID, SLIP_ID),
        ).rejects.toThrow(DomainError);

        try {
          await crud.close(mockSupabase, CASINO_ID, ACTOR_ID, SLIP_ID);
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe(
            'RATING_SLIP_ALREADY_CLOSED',
          );
        }
      });

      it('should throw RATING_SLIP_NOT_FOUND when slip does not exist', async () => {
        mockChain.rpc.mockResolvedValue({
          data: null,
          error: null,
        });

        await expect(
          crud.close(mockSupabase, CASINO_ID, ACTOR_ID, 'nonexistent'),
        ).rejects.toThrow(DomainError);

        try {
          await crud.close(mockSupabase, CASINO_ID, ACTOR_ID, 'nonexistent');
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('RATING_SLIP_NOT_FOUND');
        }
      });

      it('should handle array response from RPC', async () => {
        const closedWithDuration = {
          slip: mockClosedSlipRow,
          duration_seconds: 14400,
        };

        // RPC returns array
        mockChain.rpc.mockResolvedValue({
          data: [closedWithDuration],
          error: null,
        });

        const result = await crud.close(
          mockSupabase,
          CASINO_ID,
          ACTOR_ID,
          SLIP_ID,
        );

        expect(result.status).toBe('closed');
        expect(result.duration_seconds).toBe(14400);
      });
    });
  });

  // ===========================================================================
  // Duration Calculation
  // ===========================================================================

  describe('Duration Calculation', () => {
    it('should return duration excluding paused time', async () => {
      mockChain.rpc.mockResolvedValue({
        data: 10800, // 3 hours in seconds
        error: null,
      });

      const result = await crud.getDuration(mockSupabase, SLIP_ID);

      expect(result).toBe(10800);
      expect(mockChain.rpc).toHaveBeenCalledWith(
        'rpc_get_rating_slip_duration',
        {
          p_rating_slip_id: SLIP_ID,
          p_as_of: undefined,
        },
      );
    });

    it('should accept optional asOf parameter', async () => {
      const asOf = '2025-01-15T12:00:00Z';

      mockChain.rpc.mockResolvedValue({
        data: 7200, // 2 hours
        error: null,
      });

      const result = await crud.getDuration(mockSupabase, SLIP_ID, asOf);

      expect(result).toBe(7200);
      expect(mockChain.rpc).toHaveBeenCalledWith(
        'rpc_get_rating_slip_duration',
        {
          p_rating_slip_id: SLIP_ID,
          p_as_of: asOf,
        },
      );
    });

    it('should throw RATING_SLIP_NOT_FOUND for non-existent slip', async () => {
      mockChain.rpc.mockResolvedValue({
        data: null,
        error: null,
      });

      await expect(
        crud.getDuration(mockSupabase, 'nonexistent'),
      ).rejects.toThrow(DomainError);

      try {
        await crud.getDuration(mockSupabase, 'nonexistent');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('RATING_SLIP_NOT_FOUND');
      }
    });
  });

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  describe('Read Operations', () => {
    describe('getById', () => {
      it('should return slip with pause history', async () => {
        const slipWithPauses = {
          ...mockRatingSlipRow,
          rating_slip_pause: [
            {
              id: 'pause-1',
              rating_slip_id: SLIP_ID,
              casino_id: CASINO_ID,
              started_at: '2025-01-15T11:00:00Z',
              ended_at: '2025-01-15T11:30:00Z',
              created_by: ACTOR_ID,
            },
          ],
        };

        mockChain.maybeSingle.mockResolvedValue({
          data: slipWithPauses,
          error: null,
        });

        const result = await crud.getById(mockSupabase, SLIP_ID);

        expect(result.id).toBe(SLIP_ID);
        expect(result.pauses).toHaveLength(1);
        expect(result.pauses[0].started_at).toBe('2025-01-15T11:00:00Z');
      });

      it('should throw RATING_SLIP_NOT_FOUND for non-existent slip', async () => {
        mockChain.maybeSingle.mockResolvedValue({
          data: null,
          error: null,
        });

        await expect(crud.getById(mockSupabase, 'nonexistent')).rejects.toThrow(
          DomainError,
        );

        try {
          await crud.getById(mockSupabase, 'nonexistent');
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('RATING_SLIP_NOT_FOUND');
        }
      });
    });

    describe('listForTable', () => {
      it('should return slips for table with pagination', async () => {
        // Make chain thenable to simulate awaiting the query
        makeThenableChain(mockChain, {
          data: [mockRatingSlipRow, mockPausedSlipRow],
          error: null,
        });

        const result = await crud.listForTable(mockSupabase, TABLE_ID);

        expect(result.items).toHaveLength(2);
        expect(result.cursor).toBeNull();
      });

      it('should apply status filter', async () => {
        // Make chain thenable
        makeThenableChain(mockChain, {
          data: [mockRatingSlipRow],
          error: null,
        });

        await crud.listForTable(mockSupabase, TABLE_ID, { status: 'open' });

        expect(mockChain.eq).toHaveBeenCalledWith('status', 'open');
      });

      it('should handle cursor pagination', async () => {
        // Return limit + 1 items to indicate hasMore
        makeThenableChain(mockChain, {
          data: Array(21).fill(mockRatingSlipRow),
          error: null,
        });

        const result = await crud.listForTable(mockSupabase, TABLE_ID, {
          limit: 20,
        });

        expect(result.items).toHaveLength(20);
        expect(result.cursor).not.toBeNull();
      });
    });

    describe('listForVisit', () => {
      it('should return all slips for visit', async () => {
        // Make chain thenable
        makeThenableChain(mockChain, {
          data: [mockRatingSlipRow, mockClosedSlipRow],
          error: null,
        });

        const result = await crud.listForVisit(mockSupabase, VISIT_ID);

        expect(result).toHaveLength(2);
      });
    });

    describe('getActiveForTable', () => {
      it('should return only open and paused slips', async () => {
        // Make chain thenable
        makeThenableChain(mockChain, {
          data: [mockRatingSlipRow, mockPausedSlipRow],
          error: null,
        });

        const result = await crud.getActiveForTable(mockSupabase, TABLE_ID);

        expect(result).toHaveLength(2);
        expect(mockChain.in).toHaveBeenCalledWith('status', ['open', 'paused']);
      });
    });
  });

  // ===========================================================================
  // Update Operations
  // ===========================================================================

  describe('Update Operations', () => {
    describe('updateAverageBet', () => {
      it('should update average bet on open slip', async () => {
        const updatedSlip = { ...mockRatingSlipRow, average_bet: 200 };

        mockChain.single.mockResolvedValue({
          data: updatedSlip,
          error: null,
        });

        const result = await crud.updateAverageBet(mockSupabase, SLIP_ID, 200);

        expect(result.average_bet).toBe(200);
      });

      it('should throw RATING_SLIP_INVALID_STATE for closed slip', async () => {
        // First call fails with PGRST116
        mockChain.single.mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'No rows returned' },
        });

        // Second call (check if exists and closed)
        mockChain.maybeSingle.mockResolvedValue({
          data: { id: SLIP_ID, status: 'closed' },
          error: null,
        });

        await expect(
          crud.updateAverageBet(mockSupabase, SLIP_ID, 200),
        ).rejects.toThrow(DomainError);

        try {
          await crud.updateAverageBet(mockSupabase, SLIP_ID, 200);
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('RATING_SLIP_INVALID_STATE');
        }
      });

      it('should throw RATING_SLIP_NOT_FOUND for non-existent slip', async () => {
        // First call fails with PGRST116
        mockChain.single.mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'No rows returned' },
        });

        // Second call (check if exists)
        mockChain.maybeSingle.mockResolvedValue({
          data: null,
          error: null,
        });

        await expect(
          crud.updateAverageBet(mockSupabase, 'nonexistent', 200),
        ).rejects.toThrow(DomainError);

        try {
          await crud.updateAverageBet(mockSupabase, 'nonexistent', 200);
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('RATING_SLIP_NOT_FOUND');
        }
      });
    });
  });

  // ===========================================================================
  // Error Mapping
  // ===========================================================================

  describe('Error Mapping', () => {
    it('should map 23503 FK violation to VISIT_NOT_FOUND', async () => {
      mockChain.maybeSingle.mockResolvedValue({
        data: mockVisitRow,
        error: null,
      });

      mockChain.rpc.mockResolvedValue({
        data: null,
        error: {
          code: '23503',
          message: 'violates foreign key constraint on visit_id',
        },
      });

      const input: CreateRatingSlipInput = {
        visit_id: VISIT_ID,
        table_id: TABLE_ID,
      };

      try {
        await crud.start(mockSupabase, CASINO_ID, ACTOR_ID, input);
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('VISIT_NOT_FOUND');
      }
    });

    it('should map 23503 FK violation to TABLE_NOT_FOUND', async () => {
      mockChain.maybeSingle.mockResolvedValue({
        data: mockVisitRow,
        error: null,
      });

      mockChain.rpc.mockResolvedValue({
        data: null,
        error: {
          code: '23503',
          message: 'violates foreign key constraint on table_id',
        },
      });

      const input: CreateRatingSlipInput = {
        visit_id: VISIT_ID,
        table_id: TABLE_ID,
      };

      try {
        await crud.start(mockSupabase, CASINO_ID, ACTOR_ID, input);
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('TABLE_NOT_FOUND');
      }
    });

    it('should map PGRST116 to RATING_SLIP_NOT_FOUND', async () => {
      mockChain.maybeSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows returned' },
      });

      try {
        await crud.getById(mockSupabase, 'nonexistent');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('RATING_SLIP_NOT_FOUND');
      }
    });

    it('should map unknown errors to INTERNAL_ERROR', async () => {
      mockChain.maybeSingle.mockResolvedValue({
        data: mockVisitRow,
        error: null,
      });

      mockChain.rpc.mockResolvedValue({
        data: null,
        error: { code: '12345', message: 'Unknown database error' },
      });

      const input: CreateRatingSlipInput = {
        visit_id: VISIT_ID,
        table_id: TABLE_ID,
      };

      try {
        await crud.start(mockSupabase, CASINO_ID, ACTOR_ID, input);
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INTERNAL_ERROR');
      }
    });
  });
});
