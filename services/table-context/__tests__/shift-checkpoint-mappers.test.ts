/**
 * @jest-environment node
 *
 * PRD-038 Shift Checkpoint Mapper Unit Tests
 *
 * Tests type-safe transformations for shift checkpoint operations:
 * - toCheckpointDTO (from table row)
 * - toCheckpointDTOFromRpc
 * - toCheckpointDTOList
 * - toCheckpointDeltaDTO (delta computation with NULL propagation)
 *
 * @see shift-checkpoint/mappers.ts
 * @see EXEC-038 WS6
 */

import {
  toCheckpointDTO,
  toCheckpointDTOFromRpc,
  toCheckpointDTOList,
  toCheckpointDeltaDTO,
} from '../shift-checkpoint/mappers';

// === Mock Data: Checkpoint Row ===

const mockCheckpointRow = {
  id: 'chkpt-001',
  casino_id: 'casino-abc',
  gaming_day: '2026-02-24',
  checkpoint_type: 'shift_change',
  checkpoint_scope: 'casino',
  gaming_table_id: null,
  pit_id: null,
  window_start: '2026-02-24T06:00:00Z',
  window_end: '2026-02-24T14:00:00Z',
  win_loss_cents: 150000,
  fills_total_cents: 2000000,
  credits_total_cents: 800000,
  drop_total_cents: 3500000,
  tables_active: 12,
  tables_with_coverage: 10,
  rated_buyin_cents: 500000,
  grind_buyin_cents: 200000,
  cash_out_observed_cents: 300000,
  notes: 'Shift change checkpoint',
  created_by: 'staff-pit-001',
  created_at: '2026-02-24T14:00:00Z',
};

const mockCheckpointRowNulls = {
  ...mockCheckpointRow,
  id: 'chkpt-002',
  win_loss_cents: null,
  drop_total_cents: null,
  notes: null,
  created_by: null,
  gaming_table_id: null,
  pit_id: null,
};

const mockCheckpointRowMidShift = {
  ...mockCheckpointRow,
  id: 'chkpt-003',
  checkpoint_type: 'mid_shift',
  window_end: '2026-02-24T10:00:00Z',
  tables_active: 8,
  tables_with_coverage: 6,
  created_at: '2026-02-24T10:00:00Z',
};

// === Tests ===

describe('PRD-038 Shift Checkpoint Mappers', () => {
  // === toCheckpointDTO ===

  describe('toCheckpointDTO', () => {
    it('maps all 21 fields correctly', () => {
      const dto = toCheckpointDTO(mockCheckpointRow);

      expect(dto).toEqual({
        id: 'chkpt-001',
        casino_id: 'casino-abc',
        gaming_day: '2026-02-24',
        checkpoint_type: 'shift_change',
        checkpoint_scope: 'casino',
        gaming_table_id: null,
        pit_id: null,
        window_start: '2026-02-24T06:00:00Z',
        window_end: '2026-02-24T14:00:00Z',
        win_loss_cents: 150000,
        fills_total_cents: 2000000,
        credits_total_cents: 800000,
        drop_total_cents: 3500000,
        tables_active: 12,
        tables_with_coverage: 10,
        rated_buyin_cents: 500000,
        grind_buyin_cents: 200000,
        cash_out_observed_cents: 300000,
        notes: 'Shift change checkpoint',
        created_by: 'staff-pit-001',
        created_at: '2026-02-24T14:00:00Z',
      });
    });

    it('preserves null fields correctly', () => {
      const dto = toCheckpointDTO(mockCheckpointRowNulls);

      expect(dto.win_loss_cents).toBeNull();
      expect(dto.drop_total_cents).toBeNull();
      expect(dto.notes).toBeNull();
      expect(dto.created_by).toBeNull();
      expect(dto.gaming_table_id).toBeNull();
      expect(dto.pit_id).toBeNull();
    });

    it('returns a new object (immutability)', () => {
      const dto = toCheckpointDTO(mockCheckpointRow);
      expect(dto).not.toBe(mockCheckpointRow);
    });
  });

  // === toCheckpointDTOFromRpc ===

  describe('toCheckpointDTOFromRpc', () => {
    it('maps RPC result to DTO with all fields', () => {
      const dto = toCheckpointDTOFromRpc(mockCheckpointRow);

      expect(dto.id).toBe('chkpt-001');
      expect(dto.checkpoint_type).toBe('shift_change');
      expect(dto.checkpoint_scope).toBe('casino');
      expect(dto.fills_total_cents).toBe(2000000);
    });

    it('preserves null fields from RPC result', () => {
      const dto = toCheckpointDTOFromRpc(mockCheckpointRowNulls);

      expect(dto.win_loss_cents).toBeNull();
      expect(dto.drop_total_cents).toBeNull();
    });

    it('returns a new object (immutability)', () => {
      const dto = toCheckpointDTOFromRpc(mockCheckpointRow);
      expect(dto).not.toBe(mockCheckpointRow);
    });
  });

  // === toCheckpointDTOList ===

  describe('toCheckpointDTOList', () => {
    it('maps empty array', () => {
      const result = toCheckpointDTOList([]);
      expect(result).toEqual([]);
    });

    it('maps multiple rows preserving order', () => {
      const result = toCheckpointDTOList([
        mockCheckpointRow,
        mockCheckpointRowNulls,
        mockCheckpointRowMidShift,
      ]);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('chkpt-001');
      expect(result[1].id).toBe('chkpt-002');
      expect(result[2].id).toBe('chkpt-003');
    });

    it('each item has all 21 fields', () => {
      const result = toCheckpointDTOList([mockCheckpointRow]);
      expect(Object.keys(result[0])).toHaveLength(21);
    });
  });

  // === toCheckpointDeltaDTO ===

  describe('toCheckpointDeltaDTO', () => {
    const checkpointBase = toCheckpointDTO(mockCheckpointRow);

    it('computes correct deltas when both sides have values', () => {
      const currentMetrics = {
        win_loss_cents: 200000,
        fills_total_cents: 2500000,
        credits_total_cents: 900000,
        drop_total_cents: 4000000,
        tables_active: 14,
        tables_with_coverage: 12,
      };

      const dto = toCheckpointDeltaDTO(checkpointBase, currentMetrics);

      expect(dto.delta.win_loss_cents).toBe(50000); // 200000 - 150000
      expect(dto.delta.fills_total_cents).toBe(500000); // 2500000 - 2000000
      expect(dto.delta.credits_total_cents).toBe(100000); // 900000 - 800000
      expect(dto.delta.drop_total_cents).toBe(500000); // 4000000 - 3500000
      expect(dto.delta.tables_active).toBe(2); // 14 - 12
      expect(dto.delta.tables_with_coverage).toBe(2); // 12 - 10
    });

    it('returns NULL delta when current win_loss is NULL', () => {
      const currentMetrics = {
        win_loss_cents: null,
        fills_total_cents: 2500000,
        credits_total_cents: 900000,
        drop_total_cents: 4000000,
        tables_active: 14,
        tables_with_coverage: 12,
      };

      const dto = toCheckpointDeltaDTO(checkpointBase, currentMetrics);

      expect(dto.delta.win_loss_cents).toBeNull();
      expect(dto.delta.fills_total_cents).toBe(500000); // non-null fields still compute
    });

    it('returns NULL delta when checkpoint win_loss is NULL', () => {
      const checkpointWithNulls = toCheckpointDTO(mockCheckpointRowNulls);
      const currentMetrics = {
        win_loss_cents: 200000,
        fills_total_cents: 2500000,
        credits_total_cents: 900000,
        drop_total_cents: 4000000,
        tables_active: 14,
        tables_with_coverage: 12,
      };

      const dto = toCheckpointDeltaDTO(checkpointWithNulls, currentMetrics);

      expect(dto.delta.win_loss_cents).toBeNull();
      expect(dto.delta.drop_total_cents).toBeNull(); // checkpoint drop is also null
    });

    it('returns NULL delta when both sides have NULL values', () => {
      const checkpointWithNulls = toCheckpointDTO(mockCheckpointRowNulls);
      const currentMetrics = {
        win_loss_cents: null,
        fills_total_cents: 2500000,
        credits_total_cents: 900000,
        drop_total_cents: null,
        tables_active: 14,
        tables_with_coverage: 12,
      };

      const dto = toCheckpointDeltaDTO(checkpointWithNulls, currentMetrics);

      expect(dto.delta.win_loss_cents).toBeNull();
      expect(dto.delta.drop_total_cents).toBeNull();
    });

    it('includes checkpoint reference in result', () => {
      const currentMetrics = {
        win_loss_cents: 200000,
        fills_total_cents: 2500000,
        credits_total_cents: 900000,
        drop_total_cents: 4000000,
        tables_active: 14,
        tables_with_coverage: 12,
      };

      const dto = toCheckpointDeltaDTO(checkpointBase, currentMetrics);

      expect(dto.checkpoint).toEqual(checkpointBase);
      expect(dto.current).toEqual(currentMetrics);
    });

    it('sets checkpoint_time from checkpoint created_at', () => {
      const currentMetrics = {
        win_loss_cents: 200000,
        fills_total_cents: 2500000,
        credits_total_cents: 900000,
        drop_total_cents: 4000000,
        tables_active: 14,
        tables_with_coverage: 12,
      };

      const dto = toCheckpointDeltaDTO(checkpointBase, currentMetrics);

      expect(dto.checkpoint_time).toBe('2026-02-24T14:00:00Z');
    });

    it('handles zero deltas correctly', () => {
      const currentMetrics = {
        win_loss_cents: 150000,
        fills_total_cents: 2000000,
        credits_total_cents: 800000,
        drop_total_cents: 3500000,
        tables_active: 12,
        tables_with_coverage: 10,
      };

      const dto = toCheckpointDeltaDTO(checkpointBase, currentMetrics);

      expect(dto.delta.win_loss_cents).toBe(0);
      expect(dto.delta.fills_total_cents).toBe(0);
      expect(dto.delta.credits_total_cents).toBe(0);
      expect(dto.delta.drop_total_cents).toBe(0);
      expect(dto.delta.tables_active).toBe(0);
      expect(dto.delta.tables_with_coverage).toBe(0);
    });

    it('handles negative deltas (metrics decreased)', () => {
      const currentMetrics = {
        win_loss_cents: 100000,
        fills_total_cents: 1500000,
        credits_total_cents: 700000,
        drop_total_cents: 3000000,
        tables_active: 10,
        tables_with_coverage: 8,
      };

      const dto = toCheckpointDeltaDTO(checkpointBase, currentMetrics);

      expect(dto.delta.win_loss_cents).toBe(-50000);
      expect(dto.delta.fills_total_cents).toBe(-500000);
      expect(dto.delta.tables_active).toBe(-2);
    });
  });
});
