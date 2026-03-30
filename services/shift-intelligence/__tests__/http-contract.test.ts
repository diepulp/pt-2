/**
 * @jest-environment node
 *
 * HTTP Client ↔ Route Handler Contract Tests
 *
 * Validates that every function in http.ts has a corresponding route export.
 * Prevents the bug where an HTTP client calls a non-existent route.
 *
 * @see PRD-055 WS4 (Tests)
 */

import * as computeBaselinesRoute from '@/app/api/v1/shift-intelligence/compute-baselines/route';
import * as anomalyAlertsRoute from '@/app/api/v1/shift-intelligence/anomaly-alerts/route';
import * as http from '../http';

describe('ShiftIntelligence http.ts ↔ route.ts contract', () => {
  describe('Compute baselines endpoint', () => {
    it('fetchComputeBaselines → POST /shift-intelligence/compute-baselines', () => {
      expect(typeof http.fetchComputeBaselines).toBe('function');
      expect(typeof computeBaselinesRoute.POST).toBe('function');
    });
  });

  describe('Anomaly alerts endpoint', () => {
    it('fetchAnomalyAlerts → GET /shift-intelligence/anomaly-alerts', () => {
      expect(typeof http.fetchAnomalyAlerts).toBe('function');
      expect(typeof anomalyAlertsRoute.GET).toBe('function');
    });
  });

  describe('Role gate verification', () => {
    it('compute-baselines route exports POST only (no GET)', () => {
      expect(typeof computeBaselinesRoute.POST).toBe('function');
      expect(
        (computeBaselinesRoute as Record<string, unknown>).GET,
      ).toBeUndefined();
    });

    it('anomaly-alerts route exports GET only (no POST)', () => {
      expect(typeof anomalyAlertsRoute.GET).toBe('function');
      expect(
        (anomalyAlertsRoute as Record<string, unknown>).POST,
      ).toBeUndefined();
    });
  });
});
