/**
 * Visit Continuation Service Unit Tests
 *
 * Tests the PRD-017 visit continuation service layer functions in isolation
 * with mocked Supabase client. Validates business logic without database dependency.
 *
 * @see PRD-017 Start From Previous Session
 * @see services/visit/crud.ts - Visit continuation operations
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import * as crud from '../crud';
import type {
  RecentSessionsDTO,
  LastSessionContextDTO,
  StartFromPreviousRequest,
  VisitDTO,
} from '../dtos';

// Type for mocked Supabase client
type MockSupabaseClient = {
  from: jest.Mock;
  rpc: jest.Mock;
};

describe('Visit Continuation Service - Unit Tests', () => {
  let mockSupabase: MockSupabaseClient;
  let supabase: SupabaseClient<Database>;

  const TEST_CASINO_ID = 'casino-123';
  const TEST_ACTOR_ID = 'actor-456';
  const TEST_PLAYER_ID = 'player-789';
  const TEST_TABLE_ID = 'table-abc';
  const TEST_VISIT_ID = 'visit-xyz';
  const TEST_VISIT_GROUP_ID = 'group-def';

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock Supabase client
    mockSupabase = {
      from: jest.fn(),
      rpc: jest.fn(),
    };

    supabase = mockSupabase as unknown as SupabaseClient<Database>;
  });

  // ===========================================================================
  // getPlayerRecentSessions Tests
  // ===========================================================================

  describe('getPlayerRecentSessions', () => {
    it('returns empty sessions array when no closed sessions exist', async () => {
      const mockRpcResponse = {
        sessions: [],
        next_cursor: null,
        open_visit: null,
      };

      mockSupabase.rpc.mockResolvedValue({
        data: mockRpcResponse,
        error: null,
      });

      const result = await crud.getPlayerRecentSessions(
        supabase,
        TEST_CASINO_ID,
        TEST_PLAYER_ID,
      );

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'rpc_get_player_recent_sessions',
        {
          p_casino_id: TEST_CASINO_ID,
          p_player_id: TEST_PLAYER_ID,
          p_limit: 5,
          p_cursor: undefined,
        },
      );

      expect(result.sessions).toEqual([]);
      expect(result.next_cursor).toBeNull();
      expect(result.open_visit).toBeNull();
    });

    it('returns sessions with correct aggregate fields', async () => {
      const mockRpcResponse = {
        sessions: [
          {
            visit_id: 'v1',
            visit_group_id: 'g1',
            started_at: '2025-01-15T10:00:00Z',
            ended_at: '2025-01-15T12:00:00Z',
            last_table_id: 't1',
            last_table_name: 'BJ-01',
            last_seat_number: 3,
            total_duration_seconds: 7200,
            total_buy_in: 500,
            total_cash_out: 450,
            net: -50,
            points_earned: 100,
            segment_count: 2,
          },
        ],
        next_cursor: null,
        open_visit: null,
      };

      mockSupabase.rpc.mockResolvedValue({
        data: mockRpcResponse,
        error: null,
      });

      const result = await crud.getPlayerRecentSessions(
        supabase,
        TEST_CASINO_ID,
        TEST_PLAYER_ID,
      );

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].visit_id).toBe('v1');
      expect(result.sessions[0].total_duration_seconds).toBe(7200);
      expect(result.sessions[0].net).toBe(-50);
      expect(result.sessions[0].segment_count).toBe(2);
    });

    it('respects limit parameter', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: { sessions: [], next_cursor: null, open_visit: null },
        error: null,
      });

      await crud.getPlayerRecentSessions(
        supabase,
        TEST_CASINO_ID,
        TEST_PLAYER_ID,
        {
          limit: 10,
        },
      );

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'rpc_get_player_recent_sessions',
        {
          p_casino_id: TEST_CASINO_ID,
          p_player_id: TEST_PLAYER_ID,
          p_limit: 10,
          p_cursor: undefined,
        },
      );
    });

    it('handles cursor pagination correctly', async () => {
      const cursor = 'eyJlbmRlZF9hdCI6IjIwMjUtMDEtMTUiLCJpZCI6InYxIn0=';

      mockSupabase.rpc.mockResolvedValue({
        data: { sessions: [], next_cursor: null, open_visit: null },
        error: null,
      });

      await crud.getPlayerRecentSessions(
        supabase,
        TEST_CASINO_ID,
        TEST_PLAYER_ID,
        {
          cursor,
        },
      );

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'rpc_get_player_recent_sessions',
        {
          p_casino_id: TEST_CASINO_ID,
          p_player_id: TEST_PLAYER_ID,
          p_limit: 5,
          p_cursor: cursor,
        },
      );
    });

    it('excludes open visits from sessions array', async () => {
      const mockRpcResponse = {
        sessions: [
          {
            visit_id: 'v1',
            visit_group_id: 'g1',
            started_at: '2025-01-15T10:00:00Z',
            ended_at: '2025-01-15T12:00:00Z',
            last_table_id: 't1',
            last_table_name: 'BJ-01',
            last_seat_number: 3,
            total_duration_seconds: 7200,
            total_buy_in: 500,
            total_cash_out: 450,
            net: -50,
            points_earned: 100,
            segment_count: 2,
          },
        ],
        next_cursor: null,
        open_visit: {
          visit_id: 'v2',
          visit_group_id: 'g2',
          started_at: '2025-01-15T14:00:00Z',
          ended_at: null,
          last_table_id: 't2',
          last_table_name: 'BJ-02',
          last_seat_number: 5,
          total_duration_seconds: 1800,
          total_buy_in: 200,
          total_cash_out: 0,
          net: -200,
          points_earned: 50,
          segment_count: 1,
        },
      };

      mockSupabase.rpc.mockResolvedValue({
        data: mockRpcResponse,
        error: null,
      });

      const result = await crud.getPlayerRecentSessions(
        supabase,
        TEST_CASINO_ID,
        TEST_PLAYER_ID,
      );

      // Sessions should only contain closed visits
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].ended_at).not.toBeNull();

      // Open visit returned separately
      expect(result.open_visit).not.toBeNull();
      expect(result.open_visit!.visit_id).toBe('v2');
      expect(result.open_visit!.ended_at).toBeNull();
    });

    it('returns open_visit separately if exists', async () => {
      const mockRpcResponse = {
        sessions: [],
        next_cursor: null,
        open_visit: {
          visit_id: 'v-open',
          visit_group_id: 'g-open',
          started_at: '2025-01-15T15:00:00Z',
          ended_at: null,
          last_table_id: 't3',
          last_table_name: 'BJ-03',
          last_seat_number: 1,
          total_duration_seconds: 300,
          total_buy_in: 100,
          total_cash_out: 0,
          net: -100,
          points_earned: 25,
          segment_count: 1,
        },
      };

      mockSupabase.rpc.mockResolvedValue({
        data: mockRpcResponse,
        error: null,
      });

      const result = await crud.getPlayerRecentSessions(
        supabase,
        TEST_CASINO_ID,
        TEST_PLAYER_ID,
      );

      expect(result.open_visit).toBeDefined();
      expect(result.open_visit!.visit_id).toBe('v-open');
      expect(result.open_visit!.ended_at).toBeNull();
    });

    it('throws on RPC error', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { code: 'PGRST000', message: 'RPC failed' },
      });

      await expect(
        crud.getPlayerRecentSessions(supabase, TEST_CASINO_ID, TEST_PLAYER_ID),
      ).rejects.toThrow(DomainError);
    });

    it('throws when RPC returns null unexpectedly', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: null,
      });

      await expect(
        crud.getPlayerRecentSessions(supabase, TEST_CASINO_ID, TEST_PLAYER_ID),
      ).rejects.toThrow('RPC returned null unexpectedly');
    });
  });

  // ===========================================================================
  // getPlayerLastSessionContext Tests
  // ===========================================================================

  describe('getPlayerLastSessionContext', () => {
    it('returns null when no closed sessions exist', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await crud.getPlayerLastSessionContext(
        supabase,
        TEST_CASINO_ID,
        TEST_PLAYER_ID,
      );

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'rpc_get_player_last_session_context',
        {
          p_casino_id: TEST_CASINO_ID,
          p_player_id: TEST_PLAYER_ID,
        },
      );

      expect(result).toBeNull();
    });

    it('returns last session context with all fields', async () => {
      const mockContext: LastSessionContextDTO = {
        visit_id: 'v-last',
        visit_group_id: 'g-last',
        last_table_id: 't-last',
        last_table_name: 'BJ-05',
        last_seat_number: 4,
        last_game_settings: { min_bet: 25, max_bet: 500 },
        last_average_bet: 50.5,
        ended_at: '2025-01-15T12:00:00Z',
      };

      mockSupabase.rpc.mockResolvedValue({
        data: mockContext,
        error: null,
      });

      const result = await crud.getPlayerLastSessionContext(
        supabase,
        TEST_CASINO_ID,
        TEST_PLAYER_ID,
      );

      expect(result).toEqual(mockContext);
      expect(result!.last_game_settings).toEqual({ min_bet: 25, max_bet: 500 });
      expect(result!.last_average_bet).toBe(50.5);
    });

    it('returns most recent session by ended_at', async () => {
      // RPC should return the most recent closed session
      const mockContext: LastSessionContextDTO = {
        visit_id: 'v-most-recent',
        visit_group_id: 'g-most-recent',
        last_table_id: 't-recent',
        last_table_name: 'BJ-10',
        last_seat_number: 2,
        last_game_settings: null,
        last_average_bet: null,
        ended_at: '2025-01-15T18:00:00Z',
      };

      mockSupabase.rpc.mockResolvedValue({
        data: mockContext,
        error: null,
      });

      const result = await crud.getPlayerLastSessionContext(
        supabase,
        TEST_CASINO_ID,
        TEST_PLAYER_ID,
      );

      expect(result!.visit_id).toBe('v-most-recent');
      expect(result!.ended_at).toBe('2025-01-15T18:00:00Z');
    });

    it('throws on RPC error', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { code: 'PGRST000', message: 'RPC failed' },
      });

      await expect(
        crud.getPlayerLastSessionContext(
          supabase,
          TEST_CASINO_ID,
          TEST_PLAYER_ID,
        ),
      ).rejects.toThrow(DomainError);
    });
  });

  // ===========================================================================
  // startFromPrevious Validation Tests
  // ===========================================================================

  describe('startFromPrevious validation', () => {
    const mockRequest: StartFromPreviousRequest = {
      player_id: TEST_PLAYER_ID,
      source_visit_id: TEST_VISIT_ID,
      destination_table_id: TEST_TABLE_ID,
      destination_seat_number: 3,
    };

    it('throws VISIT_NOT_FOUND when source visit not found', async () => {
      // Mock getVisitById to return null
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      mockSupabase.from = mockFrom;

      await expect(
        crud.startFromPrevious(
          supabase,
          TEST_CASINO_ID,
          TEST_ACTOR_ID,
          mockRequest,
        ),
      ).rejects.toThrow(DomainError);

      await expect(
        crud.startFromPrevious(
          supabase,
          TEST_CASINO_ID,
          TEST_ACTOR_ID,
          mockRequest,
        ),
      ).rejects.toThrow('Source visit not found');
    });

    it('throws SOURCE_VISIT_NOT_CLOSED when source visit is open', async () => {
      const openVisit: VisitDTO = {
        id: TEST_VISIT_ID,
        player_id: TEST_PLAYER_ID,
        casino_id: TEST_CASINO_ID,
        visit_kind: 'gaming_identified_rated',
        visit_group_id: TEST_VISIT_GROUP_ID,
        started_at: '2025-01-15T10:00:00Z',
        ended_at: null, // Still open
      };

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: openVisit,
              error: null,
            }),
          }),
        }),
      });

      mockSupabase.from = mockFrom;

      await expect(
        crud.startFromPrevious(
          supabase,
          TEST_CASINO_ID,
          TEST_ACTOR_ID,
          mockRequest,
        ),
      ).rejects.toThrow('Cannot continue from an open visit');
    });

    it('throws PLAYER_MISMATCH when player_id does not match', async () => {
      const visitWithDifferentPlayer: VisitDTO = {
        id: TEST_VISIT_ID,
        player_id: 'different-player-id',
        casino_id: TEST_CASINO_ID,
        visit_kind: 'gaming_identified_rated',
        visit_group_id: TEST_VISIT_GROUP_ID,
        started_at: '2025-01-15T10:00:00Z',
        ended_at: '2025-01-15T12:00:00Z',
      };

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: visitWithDifferentPlayer,
              error: null,
            }),
          }),
        }),
      });

      mockSupabase.from = mockFrom;

      await expect(
        crud.startFromPrevious(
          supabase,
          TEST_CASINO_ID,
          TEST_ACTOR_ID,
          mockRequest,
        ),
      ).rejects.toThrow('does not match request player_id');
    });

    it('throws FORBIDDEN when casino_id mismatch (cross-casino)', async () => {
      const visitFromDifferentCasino: VisitDTO = {
        id: TEST_VISIT_ID,
        player_id: TEST_PLAYER_ID,
        casino_id: 'different-casino-id',
        visit_kind: 'gaming_identified_rated',
        visit_group_id: TEST_VISIT_GROUP_ID,
        started_at: '2025-01-15T10:00:00Z',
        ended_at: '2025-01-15T12:00:00Z',
      };

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: visitFromDifferentCasino,
              error: null,
            }),
          }),
        }),
      });

      mockSupabase.from = mockFrom;

      await expect(
        crud.startFromPrevious(
          supabase,
          TEST_CASINO_ID,
          TEST_ACTOR_ID,
          mockRequest,
        ),
      ).rejects.toThrow('belongs to a different casino');
    });

    it('calls table availability check RPC', async () => {
      const closedVisit: VisitDTO = {
        id: TEST_VISIT_ID,
        player_id: TEST_PLAYER_ID,
        casino_id: TEST_CASINO_ID,
        visit_kind: 'gaming_identified_rated',
        visit_group_id: TEST_VISIT_GROUP_ID,
        started_at: '2025-01-15T10:00:00Z',
        ended_at: '2025-01-15T12:00:00Z',
      };

      // Mock getVisitById
      const mockFrom = jest.fn().mockImplementation((table: string) => {
        if (table === 'visit') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }),
                maybeSingle: jest.fn().mockResolvedValue({
                  data: closedVisit,
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      mockSupabase.from = mockFrom;

      // Mock RPC calls
      mockSupabase.rpc.mockImplementation((rpcName: string) => {
        if (rpcName === 'rpc_check_table_seat_availability') {
          return Promise.resolve({
            data: { is_available: true, reason: null },
            error: null,
          });
        }
        if (rpcName === 'rpc_start_rating_slip') {
          return Promise.resolve({
            data: { id: 'slip-123' },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      // Mock getActiveVisitForPlayer to return no active visit
      const activeVisit = {
        has_active_visit: false,
        visit: null,
      };

      // We need to add insert mock for new visit creation
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: 'new-visit-123',
              player_id: TEST_PLAYER_ID,
              casino_id: TEST_CASINO_ID,
              visit_kind: 'gaming_identified_rated',
              visit_group_id: TEST_VISIT_GROUP_ID,
              started_at: '2025-01-15T14:00:00Z',
              ended_at: null,
            },
            error: null,
          }),
        }),
      });

      mockSupabase.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'visit') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: activeVisit.visit,
                    error: null,
                  }),
                }),
                maybeSingle: jest.fn().mockResolvedValue({
                  data: closedVisit,
                  error: null,
                }),
              }),
            }),
            insert: mockInsert,
          };
        }
        return {};
      });

      await crud.startFromPrevious(
        supabase,
        TEST_CASINO_ID,
        TEST_ACTOR_ID,
        mockRequest,
      );

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'rpc_check_table_seat_availability',
        {
          p_table_id: TEST_TABLE_ID,
          p_seat_number: 3,
        },
      );
    });

    it('creates visit with correct visit_group_id from source', async () => {
      const closedVisit: VisitDTO = {
        id: TEST_VISIT_ID,
        player_id: TEST_PLAYER_ID,
        casino_id: TEST_CASINO_ID,
        visit_kind: 'gaming_identified_rated',
        visit_group_id: TEST_VISIT_GROUP_ID,
        started_at: '2025-01-15T10:00:00Z',
        ended_at: '2025-01-15T12:00:00Z',
      };

      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: 'new-visit-456',
              player_id: TEST_PLAYER_ID,
              casino_id: TEST_CASINO_ID,
              visit_kind: 'gaming_identified_rated',
              visit_group_id: TEST_VISIT_GROUP_ID, // Inherited from source
              started_at: '2025-01-15T14:00:00Z',
              ended_at: null,
            },
            error: null,
          }),
        }),
      });

      mockSupabase.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'visit') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }),
                maybeSingle: jest.fn().mockResolvedValue({
                  data: closedVisit,
                  error: null,
                }),
              }),
            }),
            insert: mockInsert,
          };
        }
        return {};
      });

      mockSupabase.rpc.mockImplementation((rpcName: string) => {
        if (rpcName === 'rpc_check_table_seat_availability') {
          return Promise.resolve({
            data: { is_available: true, reason: null },
            error: null,
          });
        }
        if (rpcName === 'rpc_start_rating_slip') {
          return Promise.resolve({
            data: { id: 'slip-789' },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const result = await crud.startFromPrevious(
        supabase,
        TEST_CASINO_ID,
        TEST_ACTOR_ID,
        mockRequest,
      );

      // Verify insert was called with correct visit_group_id
      expect(mockInsert).toHaveBeenCalledWith({
        player_id: TEST_PLAYER_ID,
        casino_id: TEST_CASINO_ID,
        visit_kind: 'gaming_identified_rated',
        visit_group_id: TEST_VISIT_GROUP_ID, // From source.visit_group_id
      });

      expect(result.visit_group_id).toBe(TEST_VISIT_GROUP_ID);
    });
  });
});
