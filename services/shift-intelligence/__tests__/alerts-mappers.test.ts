/**
 * PRD-056 Alert Maturity Mapper Tests
 * Tests for mapPersistResult, mapAcknowledgeResult, mapAlertQualityResult,
 * and getAlerts delegation output preservation.
 *
 * @jest-environment node
 */

import {
  mapAcknowledgeResult,
  mapAlertQualityResult,
  mapPersistResult,
} from '../mappers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { getAlerts } from '../alerts';

// ── Minimal row fixture matching the getAlerts Supabase join shape ───────────

const SHIFT_ALERT_BASE = {
  id: 'alert-001',
  table_id: 'tbl-001',
  casino_id: 'casino-abc',
  metric_type: 'drop_total',
  gaming_day: '2026-04-24',
  status: 'open',
  severity: 'low',
  observed_value: 15000,
  baseline_median: 12000,
  baseline_mad: 1500,
  deviation_score: 2.0,
  direction: 'above',
  message: 'test alert',
  created_at: '2026-04-24T00:00:00Z',
  updated_at: '2026-04-24T00:00:00Z',
};

function makeMockSupabase(rows: unknown[]): SupabaseClient<Database> {
  const mockOrder = jest.fn().mockResolvedValue({ data: rows, error: null });
  const mockEq = jest.fn().mockReturnValue({ order: mockOrder });
  const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
  return {
    from: jest.fn().mockReturnValue({ select: mockSelect }),
  } as unknown as SupabaseClient<Database>;
}

describe('getAlerts → mapShiftAlertRow delegation', () => {
  it('preserves tableLabel from gaming_table.label join result', async () => {
    const row = {
      ...SHIFT_ALERT_BASE,
      gaming_table: { label: 'BJ-01' },
      alert_acknowledgment: null,
    };

    const result = await getAlerts(makeMockSupabase([row]), {
      gaming_day: '2026-04-24',
    });

    expect(result[0].tableLabel).toBe('BJ-01');
  });

  it('preserves acknowledgedByName from staff.first_name + staff.last_name join', async () => {
    const row = {
      ...SHIFT_ALERT_BASE,
      gaming_table: { label: 'BJ-02' },
      alert_acknowledgment: [
        {
          id: 'ack-001',
          alert_id: 'alert-001',
          casino_id: 'casino-abc',
          acknowledged_by: 'staff-uuid',
          notes: null,
          is_false_positive: false,
          created_at: '2026-04-24T01:00:00Z',
          staff: { first_name: 'Jane', last_name: 'Smith' },
        },
      ],
    };

    const result = await getAlerts(makeMockSupabase([row]), {
      gaming_day: '2026-04-24',
    });

    expect(result[0].acknowledgment?.acknowledgedByName).toBe('Jane Smith');
  });

  it('sets acknowledgedByName to null when staff join is absent', async () => {
    const row = {
      ...SHIFT_ALERT_BASE,
      gaming_table: { label: 'BJ-03' },
      alert_acknowledgment: [
        {
          id: 'ack-002',
          alert_id: 'alert-001',
          casino_id: 'casino-abc',
          acknowledged_by: 'staff-uuid',
          notes: null,
          is_false_positive: false,
          created_at: '2026-04-24T01:00:00Z',
          staff: null,
        },
      ],
    };

    const result = await getAlerts(makeMockSupabase([row]), {
      gaming_day: '2026-04-24',
    });

    expect(result[0].acknowledgment?.acknowledgedByName).toBeNull();
  });
});

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
