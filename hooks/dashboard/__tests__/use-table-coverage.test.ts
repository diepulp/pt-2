/**
 * useTableCoverage Hook Tests
 *
 * Tests for getCoverageTier boundary values and hook behavior.
 *
 * @see PRD-048 WS3 — Coverage Data Wiring
 */

import { getCoverageTier } from '@/services/table-context/shift-metrics/snapshot-rules';

// === getCoverageTier boundary values ===

describe('getCoverageTier', () => {
  it('returns NONE for 0.0', () => {
    expect(getCoverageTier(0.0)).toBe('NONE');
  });

  it('returns LOW for 0.01', () => {
    expect(getCoverageTier(0.01)).toBe('LOW');
  });

  it('returns LOW for 0.49', () => {
    expect(getCoverageTier(0.49)).toBe('LOW');
  });

  it('returns MEDIUM for 0.5', () => {
    expect(getCoverageTier(0.5)).toBe('MEDIUM');
  });

  it('returns MEDIUM for 0.79', () => {
    expect(getCoverageTier(0.79)).toBe('MEDIUM');
  });

  it('returns HIGH for 0.8', () => {
    expect(getCoverageTier(0.8)).toBe('HIGH');
  });

  it('returns HIGH for 1.0', () => {
    expect(getCoverageTier(1.0)).toBe('HIGH');
  });
});
