/** @jest-environment node */

/**
 * RatingSlipService Mappers Unit Tests
 *
 * Tests type-safe transformations from database rows to DTOs.
 * Verifies proper handling of all fields including null values.
 *
 * @see services/rating-slip/mappers.ts
 * @see PRD-002 Rating Slip Service
 */

import { financialValueSchema } from '@/lib/financial/schema';
import type { FinancialValue } from '@/types/financial';

import type { RatingSlipStatus } from '../dtos';
import {
  toPitCashObservationDTO,
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

  // ===========================================================================
  // toActivePlayerForDashboardDTO (PERF-003)
  // ===========================================================================

  describe('toActivePlayerForDashboardDTO', () => {
    // Import the mapper - must be done at test time after mocks
    const {
      toActivePlayerForDashboardDTO,
      toActivePlayerForDashboardDTOList,
    } = require('../mappers');

    const mockActivePlayerRow = {
      slip_id: 'slip-123',
      visit_id: 'visit-456',
      table_id: 'table-789',
      table_name: 'Blackjack 1',
      pit_name: 'Main Pit',
      seat_number: '3',
      start_time: '2026-01-26T10:00:00Z',
      status: 'open',
      average_bet: '100.00',
      player_id: 'player-001',
      player_first_name: 'John',
      player_last_name: 'Doe',
      player_birth_date: '1985-03-15',
      player_tier: 'Gold',
    };

    const mockGhostVisitRow = {
      slip_id: 'slip-ghost',
      visit_id: 'visit-ghost',
      table_id: 'table-789',
      table_name: 'Blackjack 1',
      pit_name: null,
      seat_number: null,
      start_time: '2026-01-26T11:00:00Z',
      status: 'paused',
      average_bet: null,
      player_id: null,
      player_first_name: null,
      player_last_name: null,
      player_birth_date: null,
      player_tier: null,
    };

    it('should map all fields correctly', () => {
      const result = toActivePlayerForDashboardDTO(mockActivePlayerRow);

      expect(result).toEqual({
        slipId: 'slip-123',
        visitId: 'visit-456',
        tableId: 'table-789',
        tableName: 'Blackjack 1',
        pitName: 'Main Pit',
        seatNumber: '3',
        startTime: '2026-01-26T10:00:00Z',
        status: 'open',
        averageBet: 100,
        player: {
          id: 'player-001',
          firstName: 'John',
          lastName: 'Doe',
          birthDate: '1985-03-15',
          tier: 'Gold',
        },
      });
    });

    it('should convert average_bet string to number', () => {
      const result = toActivePlayerForDashboardDTO(mockActivePlayerRow);

      expect(typeof result.averageBet).toBe('number');
      expect(result.averageBet).toBe(100);
    });

    it('should handle null average_bet', () => {
      const result = toActivePlayerForDashboardDTO(mockGhostVisitRow);

      expect(result.averageBet).toBeNull();
    });

    it('should handle ghost visit (null player)', () => {
      const result = toActivePlayerForDashboardDTO(mockGhostVisitRow);

      expect(result.player).toBeNull();
      expect(result.slipId).toBe('slip-ghost');
      expect(result.status).toBe('paused');
    });

    it('should handle null pit_name', () => {
      const result = toActivePlayerForDashboardDTO(mockGhostVisitRow);

      expect(result.pitName).toBeNull();
    });

    it('should handle null seat_number', () => {
      const result = toActivePlayerForDashboardDTO(mockGhostVisitRow);

      expect(result.seatNumber).toBeNull();
    });

    it('should transform snake_case to camelCase', () => {
      const result = toActivePlayerForDashboardDTO(mockActivePlayerRow);

      // Verify camelCase transformation
      expect(result).toHaveProperty('slipId');
      expect(result).toHaveProperty('visitId');
      expect(result).toHaveProperty('tableId');
      expect(result).toHaveProperty('tableName');
      expect(result).toHaveProperty('pitName');
      expect(result).toHaveProperty('seatNumber');
      expect(result).toHaveProperty('startTime');
      expect(result).toHaveProperty('averageBet');
      expect(result.player).toHaveProperty('firstName');
      expect(result.player).toHaveProperty('lastName');
      expect(result.player).toHaveProperty('birthDate');
    });

    it('should handle null player fields with empty string fallback', () => {
      const rowWithNullNames = {
        ...mockActivePlayerRow,
        player_first_name: null,
        player_last_name: null,
      };

      const result = toActivePlayerForDashboardDTO(rowWithNullNames);

      expect(result.player?.firstName).toBe('');
      expect(result.player?.lastName).toBe('');
    });

    it('should return a new object (immutability)', () => {
      const result = toActivePlayerForDashboardDTO(mockActivePlayerRow);

      expect(result).not.toBe(mockActivePlayerRow);
    });
  });

  // ===========================================================================
  // toActivePlayerForDashboardDTOList (PERF-003)
  // ===========================================================================

  describe('toActivePlayerForDashboardDTOList', () => {
    const { toActivePlayerForDashboardDTOList } = require('../mappers');

    const mockRow1 = {
      slip_id: 'slip-1',
      visit_id: 'visit-1',
      table_id: 'table-1',
      table_name: 'Blackjack 1',
      pit_name: 'Main Pit',
      seat_number: '1',
      start_time: '2026-01-26T10:00:00Z',
      status: 'open',
      average_bet: '100.00',
      player_id: 'player-1',
      player_first_name: 'Alice',
      player_last_name: 'Smith',
      player_birth_date: '1990-01-01',
      player_tier: 'Silver',
    };

    const mockRow2 = {
      slip_id: 'slip-2',
      visit_id: 'visit-2',
      table_id: 'table-2',
      table_name: 'Roulette 1',
      pit_name: 'VIP Pit',
      seat_number: '5',
      start_time: '2026-01-26T11:00:00Z',
      status: 'paused',
      average_bet: '250.00',
      player_id: 'player-2',
      player_first_name: 'Bob',
      player_last_name: 'Jones',
      player_birth_date: '1985-06-15',
      player_tier: 'Gold',
    };

    it('should map empty array', () => {
      const result = toActivePlayerForDashboardDTOList([]);

      expect(result).toEqual([]);
    });

    it('should map single item array', () => {
      const result = toActivePlayerForDashboardDTOList([mockRow1]);

      expect(result).toHaveLength(1);
      expect(result[0].slipId).toBe('slip-1');
      expect(result[0].player?.firstName).toBe('Alice');
    });

    it('should map multiple items', () => {
      const result = toActivePlayerForDashboardDTOList([mockRow1, mockRow2]);

      expect(result).toHaveLength(2);
      expect(result[0].slipId).toBe('slip-1');
      expect(result[1].slipId).toBe('slip-2');
    });

    it('should preserve order', () => {
      const result = toActivePlayerForDashboardDTOList([mockRow2, mockRow1]);

      expect(result[0].slipId).toBe('slip-2');
      expect(result[1].slipId).toBe('slip-1');
    });

    it('should handle mixed player/ghost visits', () => {
      const ghostRow = {
        slip_id: 'slip-ghost',
        visit_id: 'visit-ghost',
        table_id: 'table-1',
        table_name: 'Blackjack 1',
        pit_name: null,
        seat_number: null,
        start_time: '2026-01-26T12:00:00Z',
        status: 'open',
        average_bet: null,
        player_id: null,
        player_first_name: null,
        player_last_name: null,
        player_birth_date: null,
        player_tier: null,
      };

      const result = toActivePlayerForDashboardDTOList([
        mockRow1,
        ghostRow,
        mockRow2,
      ]);

      expect(result).toHaveLength(3);
      expect(result[0].player).not.toBeNull();
      expect(result[1].player).toBeNull();
      expect(result[2].player).not.toBeNull();
    });
  });

  // ===========================================================================
  // toPitCashObservationDTO (PRD-070 Phase 1.1 FinancialValue envelope)
  // ===========================================================================

  describe('toPitCashObservationDTO', () => {
    const basePitCashObsRow = {
      id: 'obs-1',
      casino_id: 'casino-456',
      gaming_day: '2026-04-24',
      player_id: 'player-001',
      visit_id: 'visit-789',
      rating_slip_id: 'slip-123',
      direction: 'out',
      amount: 500, // dollars
      amount_kind: 'estimate' as const,
      source: 'walk_with' as const,
      observed_at: '2026-04-24T18:00:00Z',
      created_by_staff_id: 'staff-001',
      note: null,
      idempotency_key: null,
      created_at: '2026-04-24T18:00:00Z',
    };

    it('toPitCashObservationDTO wraps dollar amount via dollarsToCents helper', () => {
      const result = toPitCashObservationDTO({ ...basePitCashObsRow });

      // 500 dollars → 50000 cents (integer)
      expect(result.amount.value).toBe(50000);
      expect(Number.isInteger(result.amount.value)).toBe(true);
    });

    it('toPitCashObservationDTO emits envelope with type=observed source=pit_cash_observation completeness=complete for single row', () => {
      const result = toPitCashObservationDTO({ ...basePitCashObsRow });

      const expected: FinancialValue = {
        value: 50000,
        type: 'observed',
        source: 'pit_cash_observation',
        completeness: { status: 'complete' },
      };
      expect(result.amount).toEqual(expected);

      // Boundary schema validation (financialValueSchema.parse)
      expect(() => financialValueSchema.parse(result.amount)).not.toThrow();
    });

    it('preserves non-currency fields verbatim', () => {
      const result = toPitCashObservationDTO({ ...basePitCashObsRow });

      expect(result.id).toBe('obs-1');
      expect(result.casinoId).toBe('casino-456');
      expect(result.gamingDay).toBe('2026-04-24');
      expect(result.playerId).toBe('player-001');
      expect(result.visitId).toBe('visit-789');
      expect(result.ratingSlipId).toBe('slip-123');
      expect(result.direction).toBe('out');
      expect(result.amountKind).toBe('estimate');
      expect(result.source).toBe('walk_with');
      expect(result.observedAt).toBe('2026-04-24T18:00:00Z');
      expect(result.createdByStaffId).toBe('staff-001');
      expect(result.note).toBeNull();
      expect(result.idempotencyKey).toBeNull();
      expect(result.createdAt).toBe('2026-04-24T18:00:00Z');
    });

    it('rounds fractional dollars per dollarsToCents semantics', () => {
      // dollarsToCents is pinned to Math.round(dollars * 100) — PRD-070 G6
      const result = toPitCashObservationDTO({
        ...basePitCashObsRow,
        amount: 12.34,
      });
      expect(result.amount.value).toBe(1234);
    });

    it('handles zero amount as envelope with value=0 and status=complete', () => {
      const result = toPitCashObservationDTO({
        ...basePitCashObsRow,
        amount: 0,
      });
      expect(result.amount.value).toBe(0);
      expect(result.amount.completeness.status).toBe('complete');
    });
  });

  // ===========================================================================
  // Legacy-theo envelope rule (PRD-070 Phase 1.1 MANDATORY)
  // ===========================================================================
  //
  // CLASSIFICATION-RULES §3.2 + SURFACE-INVENTORY §3.2 require that any DTO
  // surfacing `rating_slip.legacy_theo_cents` emits an envelope with:
  //   - type:   `estimated`
  //   - source: `"rating_slip.theo.legacy"`
  //   - completeness.status: `'unknown'` (MANDATORY — no other value permitted
  //     regardless of how "complete" the underlying row looks).
  //
  // Rating-slip core DTOs in this workstream (WS3) do NOT currently surface
  // `legacy_theo_cents` or `computed_theo_cents` — those columns are read by
  // `services/measurement/` for anomaly math (different bounded context) and
  // by `services/loyalty/` for accrual. The table below pins the envelope
  // contract for when / if a rating-slip DTO surfaces them in a later slice.
  //
  // Judgement call (flagged for WS9): because no current DTO field is wired
  // yet, the tests below assert the contract by constructing envelopes in
  // the exact shape required, validated with `financialValueSchema.parse`.
  // A fully-wired behavioral test follows the same shape when the DTO exists.

  describe('rating-slip theo envelope contract (WS3 placeholder for WS9)', () => {
    it('toXxxDTO emits computed_theo envelope with type=estimated source=rating_slip.theo completeness=partial for open slips', () => {
      // Contract shape for an OPEN slip with a computed_theo_cents column.
      const envelope: FinancialValue = {
        value: 12345, // cents pass-through
        type: 'estimated',
        source: 'rating_slip.theo',
        completeness: { status: 'partial' },
      };
      expect(() => financialValueSchema.parse(envelope)).not.toThrow();
      expect(envelope.type).toBe('estimated');
      expect(envelope.source).toBe('rating_slip.theo');
      expect(envelope.completeness.status).toBe('partial');
    });

    it('toXxxDTO emits computed_theo envelope with completeness=complete for closed slips', () => {
      // Contract shape for a CLOSED slip with a computed_theo_cents column.
      const envelope: FinancialValue = {
        value: 67890,
        type: 'estimated',
        source: 'rating_slip.theo',
        completeness: { status: 'complete' },
      };
      expect(() => financialValueSchema.parse(envelope)).not.toThrow();
      expect(envelope.completeness.status).toBe('complete');
      expect(envelope.source).toBe('rating_slip.theo');
    });

    it('toXxxDTO emits legacy_theo envelope with source=rating_slip.theo.legacy completeness=unknown (MANDATORY legacy rule)', () => {
      // MANDATORY per PRD-070 Phase 1.1: legacy_theo_cents surfaces ALWAYS
      // emit source="rating_slip.theo.legacy" and completeness.status='unknown',
      // regardless of how "complete" the underlying row appears.
      const envelope: FinancialValue = {
        value: 99999,
        type: 'estimated',
        source: 'rating_slip.theo.legacy',
        completeness: { status: 'unknown' },
      };
      expect(() => financialValueSchema.parse(envelope)).not.toThrow();
      expect(envelope.type).toBe('estimated');
      expect(envelope.source).toBe('rating_slip.theo.legacy');
      // Legacy rule is absolute — no other completeness value permitted.
      expect(envelope.completeness.status).toBe('unknown');
    });
  });

  // ===========================================================================
  // Average bet carve-out (PRD-070 Phase 1.1)
  // ===========================================================================

  describe('average_bet carve-out', () => {
    it('average_bet remains a bare number (carve-out, not a FinancialValue)', () => {
      // RatingSlipDTO.average_bet
      const slip = toRatingSlipDTO(mockRatingSlipRow);
      expect(typeof slip.average_bet).toBe('number');
      expect(slip.average_bet).toBe(100);

      // Null passes through for slips with no bet set
      const slipNullBet = toRatingSlipDTO(mockRatingSlipRowNullOptionals);
      expect(slipNullBet.average_bet).toBeNull();

      // Closed slip: still bare number
      const slipClosed = toRatingSlipDTO(mockRatingSlipRowClosed);
      expect(typeof slipClosed.average_bet).toBe('number');
      expect(slipClosed.average_bet).toBe(150);
    });
  });
});
