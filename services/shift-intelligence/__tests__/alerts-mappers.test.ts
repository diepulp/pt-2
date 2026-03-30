/**
 * PRD-056 Alert Maturity Mapper Tests
 * Tests for mapPersistResult, mapAcknowledgeResult, mapAlertQualityResult.
 *
 * @jest-environment node
 */

import {
  mapAcknowledgeResult,
  mapAlertQualityResult,
  mapPersistResult,
} from '../mappers';

describe('Alert Maturity Mappers', () => {
  describe('mapPersistResult', () => {
    it('maps RPC jsonb to PersistAlertsResultDTO', () => {
      const data = {
        persisted_count: 5,
        suppressed_count: 2,
        gaming_day: '2026-03-25',
      };

      const result = mapPersistResult(data);

      expect(result).toEqual({
        persistedCount: 5,
        suppressedCount: 2,
        gamingDay: '2026-03-25',
      });
    });

    it('handles zero counts', () => {
      const data = {
        persisted_count: 0,
        suppressed_count: 0,
        gaming_day: '2026-03-25',
      };

      const result = mapPersistResult(data);

      expect(result.persistedCount).toBe(0);
      expect(result.suppressedCount).toBe(0);
    });

    it('defaults missing fields to zero/empty', () => {
      const data = {};

      const result = mapPersistResult(data);

      expect(result.persistedCount).toBe(0);
      expect(result.suppressedCount).toBe(0);
      expect(result.gamingDay).toBe('');
    });
  });

  describe('mapAcknowledgeResult', () => {
    it('maps RPC jsonb to AcknowledgeAlertResultDTO', () => {
      const data = {
        alert_id: 'abc-123',
        status: 'acknowledged',
        acknowledged_by: 'staff-456',
        already_acknowledged: false,
      };

      const result = mapAcknowledgeResult(data);

      expect(result).toEqual({
        alertId: 'abc-123',
        status: 'acknowledged',
        acknowledgedBy: 'staff-456',
        alreadyAcknowledged: false,
      });
    });

    it('maps idempotent re-ack result', () => {
      const data = {
        alert_id: 'abc-123',
        status: 'acknowledged',
        acknowledged_by: 'staff-456',
        already_acknowledged: true,
      };

      const result = mapAcknowledgeResult(data);

      expect(result.alreadyAcknowledged).toBe(true);
    });
  });

  describe('mapAlertQualityResult', () => {
    it('maps RPC jsonb to AlertQualityDTO with period', () => {
      const data = {
        total_alerts: 42,
        acknowledged_count: 30,
        false_positive_count: 5,
        median_acknowledge_latency_ms: 12500,
      };
      const period = { start: '2026-03-01', end: '2026-03-25' };

      const result = mapAlertQualityResult(data, period);

      expect(result).toEqual({
        totalAlerts: 42,
        acknowledgedCount: 30,
        falsePositiveCount: 5,
        medianAcknowledgeLatencyMs: 12500,
        period: { start: '2026-03-01', end: '2026-03-25' },
      });
    });

    it('handles null median latency', () => {
      const data = {
        total_alerts: 0,
        acknowledged_count: 0,
        false_positive_count: 0,
        median_acknowledge_latency_ms: null,
      };
      const period = { start: '2026-03-01', end: '2026-03-25' };

      const result = mapAlertQualityResult(data, period);

      expect(result.medianAcknowledgeLatencyMs).toBeNull();
    });
  });
});
