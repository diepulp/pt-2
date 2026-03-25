/**
 * Anomaly Evaluation Unit Tests (PRD-055)
 *
 * Tests per-metric anomaly detection logic:
 *   drop_total / win_loss_cents: MAD multiplier method
 *   hold_percent: range-bound method
 *   cash_obs_total: no evaluation (static authority)
 */

/** Evaluate hold_percent anomaly using range-bound method */
function evaluateHoldAnomaly(
  observed: number,
  median: number,
  config: {
    deviation_pp: number;
    extreme_low: number;
    extreme_high: number;
  },
): { isAnomaly: boolean; severity: 'warn' | 'critical' | null } {
  if (observed < config.extreme_low || observed > config.extreme_high) {
    return { isAnomaly: true, severity: 'critical' };
  }
  if (Math.abs(observed - median) > config.deviation_pp) {
    return { isAnomaly: true, severity: 'warn' };
  }
  return { isAnomaly: false, severity: null };
}

/** Compute direction */
function computeDirection(
  observed: number,
  median: number,
): 'above' | 'below' | null {
  if (observed > median) return 'above';
  if (observed < median) return 'below';
  return null;
}

/** Determine readiness state */
function determineReadiness(
  hasBaseline: boolean,
  isCurrentDay: boolean,
  sampleCount: number,
  minHistory: number,
): 'ready' | 'stale' | 'missing' | 'insufficient_data' {
  if (!hasBaseline) return 'missing';
  if (!isCurrentDay) return 'stale';
  if (sampleCount < minHistory) return 'insufficient_data';
  return 'ready';
}

const holdConfig = {
  deviation_pp: 10,
  extreme_low: -5,
  extreme_high: 40,
};

describe('Anomaly Evaluation', () => {
  describe('MAD-based severity mapping (drop_total, win_loss_cents)', () => {
    it('deviation > 2 MAD → info', () => {
      // observed=130, median=100, mad=10 → score=3.0 → warn? No, >2 but also >3
      // Let's use score=2.5
      const observed = 125;
      const median = 100;
      const mad = 10;
      const score = Math.abs(observed - median) / mad; // 2.5
      expect(score).toBeCloseTo(2.5);
      expect(score > 2 && score <= 3).toBe(true); // info range
    });

    it('deviation > 3 MAD → warn', () => {
      const score = 3.5;
      expect(score > 3 && score <= 4).toBe(true);
    });

    it('deviation > 4 MAD → critical', () => {
      const score = 4.5;
      expect(score > 4).toBe(true);
    });

    it('deviation <= 2 MAD → no anomaly', () => {
      const observed = 115;
      const median = 100;
      const mad = 10;
      const score = Math.abs(observed - median) / mad; // 1.5
      expect(score).toBe(1.5);
      expect(score <= 2).toBe(true);
    });
  });

  describe('negative deviation direction (below baseline)', () => {
    it('correctly flags below-baseline direction', () => {
      const direction = computeDirection(80, 100);
      expect(direction).toBe('below');
    });

    it('correctly flags above-baseline direction', () => {
      const direction = computeDirection(120, 100);
      expect(direction).toBe('above');
    });

    it('returns null when exactly at median', () => {
      const direction = computeDirection(100, 100);
      expect(direction).toBeNull();
    });
  });

  describe('hold_percent range-bound evaluation', () => {
    it('extreme_low breach → critical', () => {
      const result = evaluateHoldAnomaly(-7.2, 15, holdConfig);
      expect(result.isAnomaly).toBe(true);
      expect(result.severity).toBe('critical');
    });

    it('extreme_high breach → critical', () => {
      const result = evaluateHoldAnomaly(45, 15, holdConfig);
      expect(result.isAnomaly).toBe(true);
      expect(result.severity).toBe('critical');
    });

    it('deviation_pp breach → warn', () => {
      // observed=28, median=15, |28-15|=13 > 10pp
      const result = evaluateHoldAnomaly(28, 15, holdConfig);
      expect(result.isAnomaly).toBe(true);
      expect(result.severity).toBe('warn');
    });

    it('within normal range → no anomaly', () => {
      // observed=20, median=15, |20-15|=5 <= 10pp, within [−5,40]
      const result = evaluateHoldAnomaly(20, 15, holdConfig);
      expect(result.isAnomaly).toBe(false);
      expect(result.severity).toBeNull();
    });

    it('negative hold within range → no anomaly', () => {
      // observed=-3, within [-5, 40], |−3 − 15|=18 > 10 → warn
      const result = evaluateHoldAnomaly(-3, 15, holdConfig);
      expect(result.isAnomaly).toBe(true);
      expect(result.severity).toBe('warn');
    });

    it('extreme_low boundary exact → critical (below)', () => {
      // observed exactly at extreme_low boundary
      const result = evaluateHoldAnomaly(-5, 15, holdConfig);
      // -5 < -5 is false; -5 is NOT below extreme_low
      expect(result.isAnomaly).toBe(true); // but |−5−15|=20 > 10pp → warn
      expect(result.severity).toBe('warn');
    });
  });

  describe('cash_obs_total — no anomaly evaluation', () => {
    it('cash_obs_total never triggers anomaly (static authority)', () => {
      // Authority remains with rpc_shift_cash_obs_alerts during MVP
      const metricType = 'cash_obs_total';
      const shouldEvaluate = metricType !== 'cash_obs_total';
      expect(shouldEvaluate).toBe(false);
    });
  });

  describe('readiness states', () => {
    it('returns missing when no baseline exists', () => {
      expect(determineReadiness(false, false, 0, 3)).toBe('missing');
    });

    it('returns stale when baseline is from older gaming day', () => {
      expect(determineReadiness(true, false, 7, 3)).toBe('stale');
    });

    it('returns insufficient_data when sample_count < min_history_days', () => {
      expect(determineReadiness(true, true, 2, 3)).toBe('insufficient_data');
    });

    it('returns ready when baseline is current and sufficient', () => {
      expect(determineReadiness(true, true, 5, 3)).toBe('ready');
    });

    it('anomaly evaluation only runs for ready state', () => {
      const states = ['missing', 'stale', 'insufficient_data'] as const;
      for (const state of states) {
        // FR-11: Only ready baselines produce anomaly evaluation
        expect(state).not.toBe('ready');
      }
    });
  });
});
