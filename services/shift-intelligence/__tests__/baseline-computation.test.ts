/**
 * Baseline Computation Unit Tests (PRD-055)
 *
 * Tests median+MAD statistical computation logic.
 * These test the mathematical invariants; RPC integration is tested separately.
 */

/** Compute median of a numeric array (interpolated for even-length) */
function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[Math.floor(n / 2)];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/** Compute scaled MAD (x1.4826) */
function computeScaledMAD(values: number[]): number {
  const median = computeMedian(values);
  const absDeviations = values.map((v) => Math.abs(v - median));
  return computeMedian(absDeviations) * 1.4826;
}

/** Check if value is anomalous using MAD method */
function isMADAnomaly(
  observed: number,
  median: number,
  mad: number,
  multiplier: number,
  fallbackPercent: number,
): { isAnomaly: boolean; threshold: number } {
  if (mad > 0) {
    const threshold = multiplier * mad;
    return {
      isAnomaly: Math.abs(observed - median) > threshold,
      threshold,
    };
  }
  // MAD = 0 fallback
  if (median !== 0) {
    const threshold = Math.abs(median) * (fallbackPercent / 100);
    return {
      isAnomaly: Math.abs(observed - median) > threshold,
      threshold,
    };
  }
  return { isAnomaly: false, threshold: 0 };
}

/** Compute deviation severity */
function computeSeverity(
  deviationScore: number,
): 'info' | 'warn' | 'critical' | null {
  if (deviationScore > 4) return 'critical';
  if (deviationScore > 3) return 'warn';
  if (deviationScore > 2) return 'info';
  return null;
}

describe('Baseline Computation — Median+MAD', () => {
  describe('computeMedian', () => {
    it('computes median of odd-length array', () => {
      expect(computeMedian([1, 3, 5, 7, 9])).toBe(5);
    });

    it('computes median of even-length array (interpolated)', () => {
      expect(computeMedian([1, 3, 5, 7])).toBe(4);
    });

    it('handles single value', () => {
      expect(computeMedian([42])).toBe(42);
    });

    it('handles unsorted input', () => {
      expect(computeMedian([9, 1, 5, 3, 7])).toBe(5);
    });

    it('handles identical values', () => {
      expect(computeMedian([10, 10, 10, 10])).toBe(10);
    });

    it('handles negative values', () => {
      expect(computeMedian([-5, -3, -1, 1, 3])).toBe(-1);
    });
  });

  describe('computeScaledMAD', () => {
    it('computes scaled MAD correctly', () => {
      // values: [1, 2, 3, 4, 5], median=3
      // deviations: [2, 1, 0, 1, 2], median(deviations)=1
      // scaled MAD = 1 * 1.4826 = 1.4826
      const mad = computeScaledMAD([1, 2, 3, 4, 5]);
      expect(mad).toBeCloseTo(1.4826, 4);
    });

    it('returns 0 for constant series (MAD=0)', () => {
      const mad = computeScaledMAD([10, 10, 10, 10, 10]);
      expect(mad).toBe(0);
    });

    it('handles two values', () => {
      // values: [10, 20], median=15
      // deviations: [5, 5], median(deviations)=5
      // scaled MAD = 5 * 1.4826 = 7.413
      const mad = computeScaledMAD([10, 20]);
      expect(mad).toBeCloseTo(7.413, 3);
    });

    it('is robust to outliers (vs standard deviation)', () => {
      // MAD is more robust than SD to outliers
      const normal = [100, 102, 98, 101, 99];
      const withOutlier = [100, 102, 98, 101, 500];
      const madNormal = computeScaledMAD(normal);
      const madOutlier = computeScaledMAD(withOutlier);

      // MAD should not be drastically affected by the outlier
      // SD would be ~178 vs ~1.5 — MAD is far more stable
      expect(madOutlier).toBeLessThan(madNormal * 5);
    });
  });

  describe('isMADAnomaly', () => {
    it('detects anomaly above threshold', () => {
      // median=100, mad=10, multiplier=3, threshold=30
      const result = isMADAnomaly(135, 100, 10, 3, 50);
      expect(result.isAnomaly).toBe(true);
      expect(result.threshold).toBe(30);
    });

    it('does not flag within threshold', () => {
      const result = isMADAnomaly(125, 100, 10, 3, 50);
      expect(result.isAnomaly).toBe(false);
    });

    it('detects negative deviation (below baseline)', () => {
      const result = isMADAnomaly(60, 100, 10, 3, 50);
      expect(result.isAnomaly).toBe(true);
    });

    it('uses fallback_percent when MAD=0', () => {
      // median=1000, mad=0, fallback_percent=50
      // threshold = |1000| * 50/100 = 500
      const result = isMADAnomaly(1600, 1000, 0, 3, 50);
      expect(result.isAnomaly).toBe(true);
      expect(result.threshold).toBe(500);
    });

    it('does not flag within fallback threshold', () => {
      const result = isMADAnomaly(1400, 1000, 0, 3, 50);
      expect(result.isAnomaly).toBe(false);
    });

    it('handles zero median with zero MAD', () => {
      const result = isMADAnomaly(100, 0, 0, 3, 50);
      expect(result.isAnomaly).toBe(false);
    });
  });

  describe('computeSeverity', () => {
    it('returns critical for >4 MAD', () => {
      expect(computeSeverity(4.5)).toBe('critical');
    });

    it('returns warn for >3 MAD', () => {
      expect(computeSeverity(3.5)).toBe('warn');
    });

    it('returns info for >2 MAD', () => {
      expect(computeSeverity(2.5)).toBe('info');
    });

    it('returns null for <=2 MAD', () => {
      expect(computeSeverity(1.5)).toBeNull();
    });

    it('handles boundary values', () => {
      expect(computeSeverity(2.0)).toBeNull(); // exactly 2, not >2
      expect(computeSeverity(2.01)).toBe('info');
      expect(computeSeverity(3.0)).toBe('info'); // exactly 3, not >3
      expect(computeSeverity(3.01)).toBe('warn');
      expect(computeSeverity(4.0)).toBe('warn'); // exactly 4, not >4
      expect(computeSeverity(4.01)).toBe('critical');
    });
  });

  describe('hold_percent edge cases', () => {
    it('excludes zero-drop days from hold_percent computation', () => {
      // When estimated_drop_buyins_cents = 0, hold_percent would be division by zero
      // These days should be excluded from the baseline window
      const dropsPerDay = [10000, 0, 8000, 12000, 0, 9000, 11000];
      const winLossPerDay = [500, 0, 400, 600, 0, 450, 550];

      const holdValues = dropsPerDay
        .map((drop, i) => (drop > 0 ? (winLossPerDay[i] / drop) * 100 : null))
        .filter((v): v is number => v !== null);

      // Should have 5 values (2 zero-drop days excluded)
      expect(holdValues).toHaveLength(5);

      const median = computeMedian(holdValues);
      expect(median).toBeGreaterThan(0);
    });
  });

  describe('sparse data / insufficient_data', () => {
    it('flags insufficient_data when sample_count < min_history_days', () => {
      const sampleCount = 2;
      const minHistoryDays = 3;
      const readinessState =
        sampleCount < minHistoryDays ? 'insufficient_data' : 'ready';
      expect(readinessState).toBe('insufficient_data');
    });

    it('returns ready when sample_count >= min_history_days', () => {
      const sampleCount = 3;
      const minHistoryDays = 3;
      const readinessState =
        sampleCount < minHistoryDays ? 'insufficient_data' : 'ready';
      expect(readinessState).toBe('ready');
    });
  });
});
