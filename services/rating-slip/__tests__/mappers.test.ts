/**
 * RatingSlipService Mappers Unit Tests
 *
 * Tests type-safe transformations from database rows to DTOs.
 * Verifies proper handling of all fields including null values.
 *
 * @see services/rating-slip/mappers.ts
 * @see PRD-002 Rating Slip Service
 */

import type { RatingSlipStatus } from '../dtos';
import {
  toRatingSlipDTO,
  toRatingSlipDTOList,
  toRatingSlipDTOOrNull,
  toRatingSlipPauseDTO,
  toRatingSlipPauseDTOList,
  toRatingSlipWithDurationDTO,
  toRatingSlipWithDurationDTOFromRpc,
  toRatingSlipWithPausesDTO,
  toRatingSlipWithPausesDTOOrNull,
  toRatingSlipWithPlayerDTO,
  toRatingSlipWithPlayerDTOList,
} from '../mappers';

// === Test Data ===

const mockRatingSlipRow = {
  id: 'slip-123',
  casino_id: 'casino-456',
  visit_id: 'visit-789',
  table_id: 'table-abc',
  seat_number: '3',
  start_time: '2025-01-15T10:00:00Z',
  end_time: null,
  status: 'open' as RatingSlipStatus,
  average_bet: 100,
  game_settings: { min_bet: 25, max_bet: 500 },
  policy_snapshot: { house_edge: 0.02 },
};

const mockRatingSlipRowClosed = {
  ...mockRatingSlipRow,
  id: 'slip-closed',
  status: 'closed' as RatingSlipStatus,
  end_time: '2025-01-15T14:00:00Z',
  average_bet: 150,
};

const mockRatingSlipRowNullOptionals = {
  id: 'slip-nulls',
  casino_id: 'casino-456',
  visit_id: 'visit-789',
  table_id: 'table-abc',
  seat_number: null,
  start_time: '2025-01-15T10:00:00Z',
  end_time: null,
  status: 'open' as RatingSlipStatus,
  average_bet: null,
  game_settings: null,
  policy_snapshot: null,
};

const mockPauseRow = {
  id: 'pause-1',
  rating_slip_id: 'slip-123',
  casino_id: 'casino-456',
  started_at: '2025-01-15T11:00:00Z',
  ended_at: '2025-01-15T11:30:00Z',
  created_by: 'staff-789',
};

const mockPauseRowActive = {
  id: 'pause-2',
  rating_slip_id: 'slip-123',
  casino_id: 'casino-456',
  started_at: '2025-01-15T12:00:00Z',
  ended_at: null,
  created_by: null,
};

// === Tests ===

describe('Rating Slip Mappers', () => {
  // ===========================================================================
  // toRatingSlipDTO
  // ===========================================================================

  describe('toRatingSlipDTO', () => {
    it('should map all required fields', () => {
      const result = toRatingSlipDTO(mockRatingSlipRow);

      expect(result).toEqual({
        id: 'slip-123',
        casino_id: 'casino-456',
        visit_id: 'visit-789',
        table_id: 'table-abc',
        seat_number: '3',
        start_time: '2025-01-15T10:00:00Z',
        end_time: null,
        status: 'open',
        average_bet: 100,
        game_settings: { min_bet: 25, max_bet: 500 },
        policy_snapshot: { house_edge: 0.02 },
      });
    });

    it('should handle null optional fields', () => {
      const result = toRatingSlipDTO(mockRatingSlipRowNullOptionals);

      expect(result.seat_number).toBeNull();
      expect(result.end_time).toBeNull();
      expect(result.average_bet).toBeNull();
      expect(result.game_settings).toBeNull();
      expect(result.policy_snapshot).toBeNull();
    });

    it('should map closed slip with end_time', () => {
      const result = toRatingSlipDTO(mockRatingSlipRowClosed);

      expect(result.status).toBe('closed');
      expect(result.end_time).toBe('2025-01-15T14:00:00Z');
      expect(result.average_bet).toBe(150);
    });

    it('should return a new object (immutability)', () => {
      const result = toRatingSlipDTO(mockRatingSlipRow);

      expect(result).not.toBe(mockRatingSlipRow);
    });

    it('should handle paused status', () => {
      const pausedRow = {
        ...mockRatingSlipRow,
        status: 'paused' as RatingSlipStatus,
      };

      const result = toRatingSlipDTO(pausedRow);

      expect(result.status).toBe('paused');
    });

    it('should preserve complex game_settings JSON', () => {
      const complexRow = {
        ...mockRatingSlipRow,
        game_settings: {
          game_type: 'blackjack',
          deck_count: 6,
          rules: { insurance: true, surrender: false },
        },
      };

      const result = toRatingSlipDTO(complexRow);

      expect(result.game_settings).toEqual({
        game_type: 'blackjack',
        deck_count: 6,
        rules: { insurance: true, surrender: false },
      });
    });
  });

  // ===========================================================================
  // toRatingSlipDTOList
  // ===========================================================================

  describe('toRatingSlipDTOList', () => {
    it('should map empty array', () => {
      const result = toRatingSlipDTOList([]);

      expect(result).toEqual([]);
    });

    it('should map single item array', () => {
      const result = toRatingSlipDTOList([mockRatingSlipRow]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('slip-123');
    });

    it('should map multiple items', () => {
      const result = toRatingSlipDTOList([
        mockRatingSlipRow,
        mockRatingSlipRowClosed,
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('slip-123');
      expect(result[1].id).toBe('slip-closed');
    });

    it('should preserve order', () => {
      const result = toRatingSlipDTOList([
        mockRatingSlipRowClosed,
        mockRatingSlipRow,
      ]);

      expect(result[0].id).toBe('slip-closed');
      expect(result[1].id).toBe('slip-123');
    });
  });

  // ===========================================================================
  // toRatingSlipDTOOrNull
  // ===========================================================================

  describe('toRatingSlipDTOOrNull', () => {
    it('should return DTO for valid row', () => {
      const result = toRatingSlipDTOOrNull(mockRatingSlipRow);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('slip-123');
    });

    it('should return null for null input', () => {
      const result = toRatingSlipDTOOrNull(null);

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // toRatingSlipWithPausesDTO
  // ===========================================================================

  describe('toRatingSlipWithPausesDTO', () => {
    it('should include pause array', () => {
      const rowWithPauses = {
        ...mockRatingSlipRow,
        rating_slip_pause: [mockPauseRow, mockPauseRowActive],
      };

      const result = toRatingSlipWithPausesDTO(rowWithPauses);

      expect(result.id).toBe('slip-123');
      expect(result.pauses).toHaveLength(2);
      expect(result.pauses[0].id).toBe('pause-1');
      expect(result.pauses[0].started_at).toBe('2025-01-15T11:00:00Z');
      expect(result.pauses[0].ended_at).toBe('2025-01-15T11:30:00Z');
      expect(result.pauses[1].id).toBe('pause-2');
      expect(result.pauses[1].ended_at).toBeNull();
    });

    it('should handle empty pause array', () => {
      const rowWithEmptyPauses = {
        ...mockRatingSlipRow,
        rating_slip_pause: [],
      };

      const result = toRatingSlipWithPausesDTO(rowWithEmptyPauses);

      expect(result.pauses).toEqual([]);
    });

    it('should handle undefined pause array (coerced to empty)', () => {
      const rowWithUndefinedPauses = {
        ...mockRatingSlipRow,
        rating_slip_pause: undefined as unknown as [],
      };

      const result = toRatingSlipWithPausesDTO(rowWithUndefinedPauses);

      expect(result.pauses).toEqual([]);
    });

    it('should map all slip fields along with pauses', () => {
      const rowWithPauses = {
        ...mockRatingSlipRowClosed,
        rating_slip_pause: [mockPauseRow],
      };

      const result = toRatingSlipWithPausesDTO(rowWithPauses);

      expect(result.status).toBe('closed');
      expect(result.end_time).toBe('2025-01-15T14:00:00Z');
      expect(result.pauses).toHaveLength(1);
    });
  });

  // ===========================================================================
  // toRatingSlipWithPausesDTOOrNull
  // ===========================================================================

  describe('toRatingSlipWithPausesDTOOrNull', () => {
    it('should return DTO for valid row', () => {
      const rowWithPauses = {
        ...mockRatingSlipRow,
        rating_slip_pause: [mockPauseRow],
      };

      const result = toRatingSlipWithPausesDTOOrNull(rowWithPauses);

      expect(result).not.toBeNull();
      expect(result?.pauses).toHaveLength(1);
    });

    it('should return null for null input', () => {
      const result = toRatingSlipWithPausesDTOOrNull(null);

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // toRatingSlipWithDurationDTO
  // ===========================================================================

  describe('toRatingSlipWithDurationDTO', () => {
    it('should include duration_seconds', () => {
      const result = toRatingSlipWithDurationDTO(
        mockRatingSlipRowClosed,
        14400,
      );

      expect(result.id).toBe('slip-closed');
      expect(result.status).toBe('closed');
      expect(result.duration_seconds).toBe(14400);
    });

    it('should handle zero duration', () => {
      const result = toRatingSlipWithDurationDTO(mockRatingSlipRowClosed, 0);

      expect(result.duration_seconds).toBe(0);
    });

    it('should preserve all slip fields with duration', () => {
      const result = toRatingSlipWithDurationDTO(
        mockRatingSlipRowClosed,
        10800,
      );

      expect(result.casino_id).toBe('casino-456');
      expect(result.visit_id).toBe('visit-789');
      expect(result.table_id).toBe('table-abc');
      expect(result.average_bet).toBe(150);
      expect(result.end_time).toBe('2025-01-15T14:00:00Z');
      expect(result.duration_seconds).toBe(10800);
    });
  });

  // ===========================================================================
  // toRatingSlipWithDurationDTOFromRpc
  // ===========================================================================

  describe('toRatingSlipWithDurationDTOFromRpc', () => {
    it('should map RPC response to DTO', () => {
      const rpcResponse = {
        slip: mockRatingSlipRowClosed,
        duration_seconds: 14400,
      };

      const result = toRatingSlipWithDurationDTOFromRpc(rpcResponse);

      expect(result.id).toBe('slip-closed');
      expect(result.status).toBe('closed');
      expect(result.duration_seconds).toBe(14400);
    });

    it('should handle RPC response with minimal duration', () => {
      const rpcResponse = {
        slip: mockRatingSlipRowClosed,
        duration_seconds: 60, // 1 minute
      };

      const result = toRatingSlipWithDurationDTOFromRpc(rpcResponse);

      expect(result.duration_seconds).toBe(60);
    });
  });

  // ===========================================================================
  // toRatingSlipPauseDTO
  // ===========================================================================

  describe('toRatingSlipPauseDTO', () => {
    it('should map all pause fields', () => {
      const result = toRatingSlipPauseDTO(mockPauseRow);

      expect(result).toEqual({
        id: 'pause-1',
        rating_slip_id: 'slip-123',
        casino_id: 'casino-456',
        started_at: '2025-01-15T11:00:00Z',
        ended_at: '2025-01-15T11:30:00Z',
        created_by: 'staff-789',
      });
    });

    it('should handle active pause (null ended_at)', () => {
      const result = toRatingSlipPauseDTO(mockPauseRowActive);

      expect(result.ended_at).toBeNull();
    });

    it('should handle null created_by', () => {
      const result = toRatingSlipPauseDTO(mockPauseRowActive);

      expect(result.created_by).toBeNull();
    });

    it('should return a new object (immutability)', () => {
      const result = toRatingSlipPauseDTO(mockPauseRow);

      expect(result).not.toBe(mockPauseRow);
    });
  });

  // ===========================================================================
  // toRatingSlipPauseDTOList
  // ===========================================================================

  describe('toRatingSlipPauseDTOList', () => {
    it('should map empty array', () => {
      const result = toRatingSlipPauseDTOList([]);

      expect(result).toEqual([]);
    });

    it('should map single pause', () => {
      const result = toRatingSlipPauseDTOList([mockPauseRow]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('pause-1');
    });

    it('should map multiple pauses', () => {
      const result = toRatingSlipPauseDTOList([
        mockPauseRow,
        mockPauseRowActive,
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('pause-1');
      expect(result[1].id).toBe('pause-2');
    });

    it('should preserve order', () => {
      const result = toRatingSlipPauseDTOList([
        mockPauseRowActive,
        mockPauseRow,
      ]);

      expect(result[0].id).toBe('pause-2');
      expect(result[1].id).toBe('pause-1');
    });
  });

  // ===========================================================================
  // toRatingSlipWithPlayerDTO (PERF-002)
  // ===========================================================================

  describe('toRatingSlipWithPlayerDTO', () => {
    const mockSlipWithPlayerRow = {
      id: 'slip-123',
      casino_id: 'casino-456',
      visit_id: 'visit-789',
      table_id: 'table-abc',
      seat_number: '3',
      start_time: '2025-01-15T10:00:00Z',
      end_time: null,
      status: 'open' as const,
      average_bet: 100,
      visit: {
        player_id: 'player-001',
        player: {
          id: 'player-001',
          first_name: 'John',
          last_name: 'Doe',
        },
      },
    };

    const mockSlipWithGhostVisitRow = {
      id: 'slip-ghost',
      casino_id: 'casino-456',
      visit_id: 'visit-ghost',
      table_id: 'table-abc',
      seat_number: '5',
      start_time: '2025-01-15T11:00:00Z',
      end_time: null,
      status: 'open' as const,
      average_bet: 50,
      visit: {
        player_id: null,
        player: null,
      },
    };

    it('should map slip with player correctly', () => {
      const result = toRatingSlipWithPlayerDTO(mockSlipWithPlayerRow);

      expect(result).toEqual({
        id: 'slip-123',
        casino_id: 'casino-456',
        visit_id: 'visit-789',
        table_id: 'table-abc',
        seat_number: '3',
        start_time: '2025-01-15T10:00:00Z',
        end_time: null,
        status: 'open',
        average_bet: 100,
        player: {
          id: 'player-001',
          firstName: 'John',
          lastName: 'Doe',
        },
      });
    });

    it('should transform snake_case to camelCase for player fields', () => {
      const result = toRatingSlipWithPlayerDTO(mockSlipWithPlayerRow);

      expect(result.player?.firstName).toBe('John');
      expect(result.player?.lastName).toBe('Doe');
    });

    it('should handle ghost visit (null player)', () => {
      const result = toRatingSlipWithPlayerDTO(mockSlipWithGhostVisitRow);

      expect(result.player).toBeNull();
      expect(result.id).toBe('slip-ghost');
      expect(result.seat_number).toBe('5');
    });

    it('should return a new object (immutability)', () => {
      const result = toRatingSlipWithPlayerDTO(mockSlipWithPlayerRow);

      expect(result).not.toBe(mockSlipWithPlayerRow);
    });

    it('should handle paused status', () => {
      const pausedRow = {
        ...mockSlipWithPlayerRow,
        status: 'paused' as const,
      };

      const result = toRatingSlipWithPlayerDTO(pausedRow);

      expect(result.status).toBe('paused');
    });

    it('should handle null seat_number', () => {
      const noSeatRow = {
        ...mockSlipWithPlayerRow,
        seat_number: null,
      };

      const result = toRatingSlipWithPlayerDTO(noSeatRow);

      expect(result.seat_number).toBeNull();
    });
  });

  // ===========================================================================
  // toRatingSlipWithPlayerDTOList (PERF-002)
  // ===========================================================================

  describe('toRatingSlipWithPlayerDTOList', () => {
    const mockSlipWithPlayer1 = {
      id: 'slip-1',
      casino_id: 'casino-456',
      visit_id: 'visit-1',
      table_id: 'table-abc',
      seat_number: '1',
      start_time: '2025-01-15T10:00:00Z',
      end_time: null,
      status: 'open' as const,
      average_bet: 100,
      visit: {
        player_id: 'player-1',
        player: { id: 'player-1', first_name: 'Alice', last_name: 'Smith' },
      },
    };

    const mockSlipWithPlayer2 = {
      id: 'slip-2',
      casino_id: 'casino-456',
      visit_id: 'visit-2',
      table_id: 'table-abc',
      seat_number: '2',
      start_time: '2025-01-15T10:30:00Z',
      end_time: null,
      status: 'paused' as const,
      average_bet: 200,
      visit: {
        player_id: 'player-2',
        player: { id: 'player-2', first_name: 'Bob', last_name: 'Jones' },
      },
    };

    it('should map empty array', () => {
      const result = toRatingSlipWithPlayerDTOList([]);

      expect(result).toEqual([]);
    });

    it('should map single item array', () => {
      const result = toRatingSlipWithPlayerDTOList([mockSlipWithPlayer1]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('slip-1');
      expect(result[0].player?.firstName).toBe('Alice');
    });

    it('should map multiple items', () => {
      const result = toRatingSlipWithPlayerDTOList([
        mockSlipWithPlayer1,
        mockSlipWithPlayer2,
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].player?.firstName).toBe('Alice');
      expect(result[1].player?.firstName).toBe('Bob');
    });

    it('should preserve order', () => {
      const result = toRatingSlipWithPlayerDTOList([
        mockSlipWithPlayer2,
        mockSlipWithPlayer1,
      ]);

      expect(result[0].id).toBe('slip-2');
      expect(result[1].id).toBe('slip-1');
    });

    it('should handle mixed player/ghost visits', () => {
      const ghostSlip = {
        id: 'slip-ghost',
        casino_id: 'casino-456',
        visit_id: 'visit-ghost',
        table_id: 'table-abc',
        seat_number: '3',
        start_time: '2025-01-15T11:00:00Z',
        end_time: null,
        status: 'open' as const,
        average_bet: 50,
        visit: { player_id: null, player: null },
      };

      const result = toRatingSlipWithPlayerDTOList([
        mockSlipWithPlayer1,
        ghostSlip,
        mockSlipWithPlayer2,
      ]);

      expect(result).toHaveLength(3);
      expect(result[0].player).not.toBeNull();
      expect(result[1].player).toBeNull();
      expect(result[2].player).not.toBeNull();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty string seat_number', () => {
      const row = { ...mockRatingSlipRow, seat_number: '' };
      const result = toRatingSlipDTO(row);

      expect(result.seat_number).toBe('');
    });

    it('should handle zero average_bet', () => {
      const row = { ...mockRatingSlipRow, average_bet: 0 };
      const result = toRatingSlipDTO(row);

      expect(result.average_bet).toBe(0);
    });

    it('should handle negative average_bet (edge case)', () => {
      const row = { ...mockRatingSlipRow, average_bet: -100 };
      const result = toRatingSlipDTO(row);

      expect(result.average_bet).toBe(-100);
    });

    it('should handle empty JSON objects', () => {
      const row = {
        ...mockRatingSlipRow,
        game_settings: {},
        policy_snapshot: {},
      };
      const result = toRatingSlipDTO(row);

      expect(result.game_settings).toEqual({});
      expect(result.policy_snapshot).toEqual({});
    });

    it('should handle array in JSON fields', () => {
      const row = {
        ...mockRatingSlipRow,
        game_settings: { allowed_bets: [25, 50, 100, 200] },
      };
      const result = toRatingSlipDTO(row);

      expect(result.game_settings).toEqual({
        allowed_bets: [25, 50, 100, 200],
      });
    });

    it('should handle ISO date strings correctly', () => {
      const row = {
        ...mockRatingSlipRow,
        start_time: '2025-01-15T10:00:00.123456Z',
        end_time: '2025-01-15T14:30:00.654321+00:00',
      };
      const result = toRatingSlipDTO(row);

      expect(result.start_time).toBe('2025-01-15T10:00:00.123456Z');
      expect(result.end_time).toBe('2025-01-15T14:30:00.654321+00:00');
    });

    it('should handle very large duration values', () => {
      const result = toRatingSlipWithDurationDTO(
        mockRatingSlipRowClosed,
        86400 * 7, // 1 week in seconds
      );

      expect(result.duration_seconds).toBe(604800);
    });
  });
});
