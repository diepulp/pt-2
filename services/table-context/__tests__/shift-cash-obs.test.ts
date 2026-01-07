/**
 * Shift Cash Observation Rollup Tests
 *
 * Tests for TELEMETRY-ONLY cash observation rollups.
 * These rollups are observational, NOT authoritative Drop/Win/Hold metrics.
 *
 * @see PRD-SHIFT-DASHBOARDS-v0.2 PATCH
 * @see SHIFT_METRICS_CATALOG §3.7
 */

import type {
  CashObsCasinoRollupDTO,
  CashObsPitRollupDTO,
  CashObsSpikeAlertDTO,
  CashObsTableRollupDTO,
} from '../dtos';
import { tableContextKeys } from '../keys';

// === Mock Data ===

const mockTableRollupRow = {
  table_id: 'table-123',
  table_label: 'BJ-01',
  pit: 'Main Floor',
  cash_out_observed_estimate_total: 15000,
  cash_out_observed_confirmed_total: 5000,
  cash_out_observation_count: 10,
  cash_out_last_observed_at: '2026-01-07T12:00:00Z',
};

const mockTableRollupRowNullPit = {
  table_id: 'table-456',
  table_label: 'PKR-03',
  pit: null,
  cash_out_observed_estimate_total: 8000,
  cash_out_observed_confirmed_total: 0,
  cash_out_observation_count: 5,
  cash_out_last_observed_at: '2026-01-07T11:30:00Z',
};

const mockPitRollupRow = {
  pit: 'Main Floor',
  cash_out_observed_estimate_total: 50000,
  cash_out_observed_confirmed_total: 20000,
  cash_out_observation_count: 35,
  cash_out_last_observed_at: '2026-01-07T12:30:00Z',
};

const mockCasinoRollupRow = {
  cash_out_observed_estimate_total: 150000,
  cash_out_observed_confirmed_total: 75000,
  cash_out_observation_count: 120,
  cash_out_last_observed_at: '2026-01-07T12:45:00Z',
};

const mockSpikeAlertRow = {
  alert_type: 'cash_out_observed_spike_telemetry',
  severity: 'warn',
  entity_type: 'table',
  entity_id: 'table-123',
  entity_label: 'BJ-01',
  observed_value: 15000,
  threshold: 5000,
  message:
    'TELEMETRY: Table BJ-01 observed cash-out $15,000.00 exceeds threshold $5,000.00',
  is_telemetry: true,
};

// === DTO Structure Tests ===

describe('Shift Cash Observation DTOs', () => {
  describe('CashObsTableRollupDTO', () => {
    it('has correct structure with all fields', () => {
      const dto: CashObsTableRollupDTO = {
        table_id: mockTableRollupRow.table_id,
        table_label: mockTableRollupRow.table_label,
        pit: mockTableRollupRow.pit,
        cash_out_observed_estimate_total:
          mockTableRollupRow.cash_out_observed_estimate_total,
        cash_out_observed_confirmed_total:
          mockTableRollupRow.cash_out_observed_confirmed_total,
        cash_out_observation_count:
          mockTableRollupRow.cash_out_observation_count,
        cash_out_last_observed_at: mockTableRollupRow.cash_out_last_observed_at,
      };

      expect(dto.table_id).toBe('table-123');
      expect(dto.table_label).toBe('BJ-01');
      expect(dto.pit).toBe('Main Floor');
      expect(dto.cash_out_observed_estimate_total).toBe(15000);
      expect(dto.cash_out_observed_confirmed_total).toBe(5000);
      expect(dto.cash_out_observation_count).toBe(10);
      expect(dto.cash_out_last_observed_at).toBe('2026-01-07T12:00:00Z');
    });

    it('allows null pit', () => {
      const dto: CashObsTableRollupDTO = {
        table_id: mockTableRollupRowNullPit.table_id,
        table_label: mockTableRollupRowNullPit.table_label,
        pit: mockTableRollupRowNullPit.pit,
        cash_out_observed_estimate_total:
          mockTableRollupRowNullPit.cash_out_observed_estimate_total,
        cash_out_observed_confirmed_total:
          mockTableRollupRowNullPit.cash_out_observed_confirmed_total,
        cash_out_observation_count:
          mockTableRollupRowNullPit.cash_out_observation_count,
        cash_out_last_observed_at:
          mockTableRollupRowNullPit.cash_out_last_observed_at,
      };

      expect(dto.pit).toBeNull();
    });

    it('allows null cash_out_last_observed_at when no observations', () => {
      const dto: CashObsTableRollupDTO = {
        table_id: 'table-999',
        table_label: 'Empty Table',
        pit: 'Test',
        cash_out_observed_estimate_total: 0,
        cash_out_observed_confirmed_total: 0,
        cash_out_observation_count: 0,
        cash_out_last_observed_at: null,
      };

      expect(dto.cash_out_last_observed_at).toBeNull();
      expect(dto.cash_out_observation_count).toBe(0);
    });
  });

  describe('CashObsPitRollupDTO', () => {
    it('has correct structure with all fields', () => {
      const dto: CashObsPitRollupDTO = {
        pit: mockPitRollupRow.pit,
        cash_out_observed_estimate_total:
          mockPitRollupRow.cash_out_observed_estimate_total,
        cash_out_observed_confirmed_total:
          mockPitRollupRow.cash_out_observed_confirmed_total,
        cash_out_observation_count: mockPitRollupRow.cash_out_observation_count,
        cash_out_last_observed_at: mockPitRollupRow.cash_out_last_observed_at,
      };

      expect(dto.pit).toBe('Main Floor');
      expect(dto.cash_out_observed_estimate_total).toBe(50000);
      expect(dto.cash_out_observed_confirmed_total).toBe(20000);
      expect(dto.cash_out_observation_count).toBe(35);
    });
  });

  describe('CashObsCasinoRollupDTO', () => {
    it('has correct structure with all fields', () => {
      const dto: CashObsCasinoRollupDTO = {
        cash_out_observed_estimate_total:
          mockCasinoRollupRow.cash_out_observed_estimate_total,
        cash_out_observed_confirmed_total:
          mockCasinoRollupRow.cash_out_observed_confirmed_total,
        cash_out_observation_count:
          mockCasinoRollupRow.cash_out_observation_count,
        cash_out_last_observed_at:
          mockCasinoRollupRow.cash_out_last_observed_at,
      };

      expect(dto.cash_out_observed_estimate_total).toBe(150000);
      expect(dto.cash_out_observed_confirmed_total).toBe(75000);
      expect(dto.cash_out_observation_count).toBe(120);
    });

    it('handles zero values when no observations', () => {
      const dto: CashObsCasinoRollupDTO = {
        cash_out_observed_estimate_total: 0,
        cash_out_observed_confirmed_total: 0,
        cash_out_observation_count: 0,
        cash_out_last_observed_at: null,
      };

      expect(dto.cash_out_observed_estimate_total).toBe(0);
      expect(dto.cash_out_observation_count).toBe(0);
      expect(dto.cash_out_last_observed_at).toBeNull();
    });
  });

  describe('CashObsSpikeAlertDTO', () => {
    it('has correct structure with all fields', () => {
      const dto: CashObsSpikeAlertDTO = {
        alert_type: 'cash_out_observed_spike_telemetry',
        severity: 'warn',
        entity_type: 'table',
        entity_id: mockSpikeAlertRow.entity_id,
        entity_label: mockSpikeAlertRow.entity_label,
        observed_value: mockSpikeAlertRow.observed_value,
        threshold: mockSpikeAlertRow.threshold,
        message: mockSpikeAlertRow.message,
        is_telemetry: true,
      };

      expect(dto.alert_type).toBe('cash_out_observed_spike_telemetry');
      expect(dto.severity).toBe('warn');
      expect(dto.entity_type).toBe('table');
      expect(dto.is_telemetry).toBe(true);
    });

    it('message includes TELEMETRY prefix', () => {
      const dto: CashObsSpikeAlertDTO = {
        alert_type: 'cash_out_observed_spike_telemetry',
        severity: 'warn',
        entity_type: 'pit',
        entity_id: 'Main Floor',
        entity_label: 'Pit Main Floor',
        observed_value: 30000,
        threshold: 25000,
        message:
          'TELEMETRY: Pit Main Floor observed cash-out $30,000.00 exceeds threshold $25,000.00',
        is_telemetry: true,
      };

      expect(dto.message).toContain('TELEMETRY:');
    });

    it('supports pit entity type', () => {
      const dto: CashObsSpikeAlertDTO = {
        alert_type: 'cash_out_observed_spike_telemetry',
        severity: 'warn',
        entity_type: 'pit',
        entity_id: 'Main Floor',
        entity_label: 'Pit Main Floor',
        observed_value: 30000,
        threshold: 25000,
        message:
          'TELEMETRY: Pit Main Floor observed cash-out exceeds threshold',
        is_telemetry: true,
      };

      expect(dto.entity_type).toBe('pit');
    });

    it('supports different severity levels', () => {
      const severities: Array<'info' | 'warn' | 'critical'> = [
        'info',
        'warn',
        'critical',
      ];

      severities.forEach((severity) => {
        const dto: CashObsSpikeAlertDTO = {
          alert_type: 'cash_out_observed_spike_telemetry',
          severity,
          entity_type: 'table',
          entity_id: 'table-123',
          entity_label: 'BJ-01',
          observed_value: 15000,
          threshold: 5000,
          message: 'Test alert',
          is_telemetry: true,
        };

        expect(dto.severity).toBe(severity);
      });
    });
  });
});

// === React Query Keys Tests ===

describe('Shift Cash Observation Keys', () => {
  describe('shiftCashObs.table', () => {
    it('generates correct key with all parameters', () => {
      const key = tableContextKeys.shiftCashObs.table(
        'casino-123',
        '2026-01-07T00:00:00Z',
        '2026-01-07T08:00:00Z',
        'table-456',
      );

      expect(key).toEqual([
        'table-context',
        'shift-cash-obs',
        'table',
        'casino-123',
        '2026-01-07T00:00:00Z',
        '2026-01-07T08:00:00Z',
        'table-456',
      ]);
    });

    it("uses 'all' when tableId is undefined", () => {
      const key = tableContextKeys.shiftCashObs.table(
        'casino-123',
        '2026-01-07T00:00:00Z',
        '2026-01-07T08:00:00Z',
      );

      expect(key[6]).toBe('all');
    });
  });

  describe('shiftCashObs.pit', () => {
    it('generates correct key with pit filter', () => {
      const key = tableContextKeys.shiftCashObs.pit(
        'casino-123',
        '2026-01-07T00:00:00Z',
        '2026-01-07T08:00:00Z',
        'Main Floor',
      );

      expect(key).toEqual([
        'table-context',
        'shift-cash-obs',
        'pit',
        'casino-123',
        '2026-01-07T00:00:00Z',
        '2026-01-07T08:00:00Z',
        'Main Floor',
      ]);
    });

    it("uses 'all' when pit is undefined", () => {
      const key = tableContextKeys.shiftCashObs.pit(
        'casino-123',
        '2026-01-07T00:00:00Z',
        '2026-01-07T08:00:00Z',
      );

      expect(key[6]).toBe('all');
    });
  });

  describe('shiftCashObs.casino', () => {
    it('generates correct key', () => {
      const key = tableContextKeys.shiftCashObs.casino(
        'casino-123',
        '2026-01-07T00:00:00Z',
        '2026-01-07T08:00:00Z',
      );

      expect(key).toEqual([
        'table-context',
        'shift-cash-obs',
        'casino',
        'casino-123',
        '2026-01-07T00:00:00Z',
        '2026-01-07T08:00:00Z',
      ]);
    });
  });

  describe('shiftCashObs.alerts', () => {
    it('generates correct key', () => {
      const key = tableContextKeys.shiftCashObs.alerts(
        'casino-123',
        '2026-01-07T00:00:00Z',
        '2026-01-07T08:00:00Z',
      );

      expect(key).toEqual([
        'table-context',
        'shift-cash-obs',
        'alerts',
        'casino-123',
        '2026-01-07T00:00:00Z',
        '2026-01-07T08:00:00Z',
      ]);
    });
  });
});

// === Integration Tests (Stubbed - require database) ===

describe('Shift Cash Observation Rollups - Integration', () => {
  describe('rpc_shift_cash_obs_table', () => {
    it.todo(
      'returns rollups grouped by table with correct aggregates',
      // GIVEN: 3 observations on table A (2 estimate @ $100, 1 confirmed @ $50)
      // WHEN: Query shift window containing all 3
      // THEN: estimate_total = 200, confirmed_total = 50, count = 3
    );

    it.todo(
      'excludes observations outside time window',
      // GIVEN: observation at 2pm, query window 3pm-5pm
      // THEN: observation not included
    );

    it.todo(
      'excludes observations without rating_slip_id',
      // GIVEN: observation with rating_slip_id = NULL
      // THEN: not included in table rollups
    );

    it.todo(
      'filters to single table when p_table_id provided',
      // GIVEN: observations on table A and table B
      // WHEN: p_table_id = table_A
      // THEN: only table A rollup returned
    );

    it.todo(
      'orders results by estimate_total DESC',
      // GIVEN: table A with $1000, table B with $500
      // THEN: table A appears first
    );
  });

  describe('rpc_shift_cash_obs_pit', () => {
    it.todo(
      'returns rollups grouped by pit',
      // GIVEN: observations across tables in pit "Main Floor"
      // THEN: single pit rollup with aggregated totals
    );

    it.todo(
      'filters to single pit when p_pit provided',
      // GIVEN: observations in pit A and pit B
      // WHEN: p_pit = pit_A
      // THEN: only pit A rollup returned
    );
  });

  describe('rpc_shift_cash_obs_casino', () => {
    it.todo(
      'includes observations without rating_slip_id',
      // GIVEN: observation with rating_slip_id = NULL
      // THEN: included in casino-level rollup
    );

    it.todo(
      'returns zero totals when no observations in window',
      // GIVEN: no observations in query window
      // THEN: all totals = 0, count = 0, last_observed_at = null
    );
  });

  describe('rpc_shift_cash_obs_alerts', () => {
    it.todo(
      'returns alert when table exceeds threshold',
      // GIVEN: casino_settings.alert_thresholds = { cash_out_spike_table_threshold: 1000 }
      // GIVEN: table with cash_out_observed_estimate_total = 1500
      // THEN: alert returned with is_telemetry = true
    );

    it.todo(
      'returns no alert when below threshold',
      // GIVEN: all tables below threshold
      // THEN: empty result set
    );

    it.todo(
      'uses default threshold when not configured',
      // GIVEN: casino_settings.alert_thresholds = NULL
      // THEN: uses default $5000 for tables
    );

    it.todo(
      'alert message includes TELEMETRY label',
      // THEN: message starts with "TELEMETRY:"
    );
  });

  describe('RLS: Casino scoping', () => {
    it.todo(
      'only returns observations for authenticated casino',
      // GIVEN: observations for casino A and casino B
      // GIVEN: RLS context set for casino A
      // THEN: only casino A observations in rollups
    );

    it.todo(
      'returns empty when no RLS context',
      // GIVEN: no app.casino_id set
      // THEN: query returns empty (RLS blocks access)
    );
  });
});
