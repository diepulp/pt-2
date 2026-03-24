/**
 * ShiftIntelligenceService Mappers Unit Tests
 * Tests RPC row → DTO transformations.
 */

import { mapComputeResult, mapAnomalyAlertRow } from '../mappers';

describe('ShiftIntelligence Mappers', () => {
  describe('mapComputeResult', () => {
    it('maps snake_case compute result to camelCase DTO', () => {
      const row = {
        tables_processed: 12,
        metrics_computed: 48,
        gaming_day: '2026-03-22',
      };

      const result = mapComputeResult(row);

      expect(result).toEqual({
        tablesProcessed: 12,
        metricsComputed: 48,
        gamingDay: '2026-03-22',
      });
    });

    it('handles zero counts', () => {
      const row = {
        tables_processed: 0,
        metrics_computed: 0,
        gaming_day: '2026-03-22',
      };

      const result = mapComputeResult(row);

      expect(result.tablesProcessed).toBe(0);
      expect(result.metricsComputed).toBe(0);
    });
  });

  describe('mapAnomalyAlertRow', () => {
    const baseRow = {
      table_id: 'table-abc',
      table_label: 'BJ-01',
      metric_type: 'drop_total',
      readiness_state: 'ready',
      observed_value: 15000,
      baseline_median: 12000,
      baseline_mad: 1500,
      deviation_score: 2.0,
      is_anomaly: false,
      severity: null as string | null,
      direction: 'above',
      threshold_value: 4500,
      baseline_gaming_day: '2026-03-22',
      baseline_sample_count: 7,
      message: 'Within normal range',
    };

    it('maps snake_case alert row to camelCase DTO', () => {
      const result = mapAnomalyAlertRow(baseRow);

      expect(result).toEqual({
        tableId: 'table-abc',
        tableLabel: 'BJ-01',
        metricType: 'drop_total',
        readinessState: 'ready',
        observedValue: 15000,
        baselineMedian: 12000,
        baselineMad: 1500,
        deviationScore: 2.0,
        isAnomaly: false,
        severity: null,
        direction: 'above',
        thresholdValue: 4500,
        baselineGamingDay: '2026-03-22',
        baselineSampleCount: 7,
        message: 'Within normal range',
      });
    });

    it('maps anomaly alert with severity', () => {
      const row = {
        ...baseRow,
        deviation_score: 3.5,
        is_anomaly: true,
        severity: 'warn',
        message: 'drop total above baseline',
      };

      const result = mapAnomalyAlertRow(row);

      expect(result.isAnomaly).toBe(true);
      expect(result.severity).toBe('warn');
      expect(result.deviationScore).toBe(3.5);
    });

    it('maps missing readiness state with null baseline fields', () => {
      const row = {
        ...baseRow,
        readiness_state: 'missing',
        baseline_median: null as number | null,
        baseline_mad: null as number | null,
        deviation_score: null as number | null,
        is_anomaly: false,
        severity: null as string | null,
        direction: null as string | null,
        threshold_value: null as number | null,
        baseline_gaming_day: null as string | null,
        baseline_sample_count: null as number | null,
        message: 'No baseline available',
      };

      const result = mapAnomalyAlertRow(row);

      expect(result.readinessState).toBe('missing');
      expect(result.baselineMedian).toBeNull();
      expect(result.baselineMad).toBeNull();
      expect(result.isAnomaly).toBe(false);
    });

    it('preserves metric type enum values', () => {
      for (const mt of [
        'drop_total',
        'hold_percent',
        'cash_obs_total',
        'win_loss_cents',
      ]) {
        const row = { ...baseRow, metric_type: mt };
        expect(mapAnomalyAlertRow(row).metricType).toBe(mt);
      }
    });

    it('preserves direction values', () => {
      expect(
        mapAnomalyAlertRow({ ...baseRow, direction: 'above' }).direction,
      ).toBe('above');
      expect(
        mapAnomalyAlertRow({ ...baseRow, direction: 'below' }).direction,
      ).toBe('below');
    });
  });
});
