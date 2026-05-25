/** @jest-environment node */

import { aggregateLagSamples } from '../outbox-consumer';

describe('aggregateLagSamples (PRD-089 WS1_LOG)', () => {
  it('returns null for an empty array (distinguishes "no rows processed" from "zero lag")', () => {
    expect(aggregateLagSamples([])).toBeNull();
  });

  it('returns identical min/p50/p95/max for a single sample', () => {
    expect(aggregateLagSamples([42])).toEqual({
      min: 42,
      p50: 42,
      p95: 42,
      max: 42,
    });
  });

  it('computes min/p50/p95/max on an odd-length sorted distribution', () => {
    // ceil(0.5 * 5) - 1 = 2 → sorted[2] = 30 (p50)
    // ceil(0.95 * 5) - 1 = 4 → sorted[4] = 50 (p95)
    expect(aggregateLagSamples([10, 20, 30, 40, 50])).toEqual({
      min: 10,
      p50: 30,
      p95: 50,
      max: 50,
    });
  });

  it('computes min/p50/p95/max on an even-length distribution (lower-midpoint p50)', () => {
    // ceil(0.5 * 4) - 1 = 1 → sorted[1] = 20 (lower midpoint, deterministic)
    // ceil(0.95 * 4) - 1 = 3 → sorted[3] = 40
    expect(aggregateLagSamples([10, 20, 30, 40])).toEqual({
      min: 10,
      p50: 20,
      p95: 40,
      max: 40,
    });
  });

  it('does not mutate the input array', () => {
    const samples = [50, 10, 30, 20, 40];
    const snapshot = [...samples];
    aggregateLagSamples(samples);
    expect(samples).toEqual(snapshot);
  });

  it('handles unsorted input by sorting internally', () => {
    expect(aggregateLagSamples([50, 10, 30, 40, 20])).toEqual({
      min: 10,
      p50: 30,
      p95: 50,
      max: 50,
    });
  });

  it('handles a large sample set (p95 lands deep in the upper tail)', () => {
    // 100 samples: 1..100. ceil(0.95 * 100) - 1 = 94 → sorted[94] = 95.
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    const result = aggregateLagSamples(samples);
    expect(result).toEqual({ min: 1, p50: 50, p95: 95, max: 100 });
  });

  it('handles zero-lag samples without collapsing to null', () => {
    // P1-LAG-SAMPLE-CLOCK-CONTRACT: a row processed in the same Postgres
    // statement as the producing trigger can legitimately yield 0ms lag.
    // The aggregator must distinguish [0,0,0] from [] (which returns null).
    expect(aggregateLagSamples([0, 0, 0])).toEqual({
      min: 0,
      p50: 0,
      p95: 0,
      max: 0,
    });
  });

  it('treats samples as ms (no scaling — caller owns units)', () => {
    // Sanity: aggregator is unit-agnostic; values flow through unchanged.
    expect(aggregateLagSamples([1500, 250, 12000])).toEqual({
      min: 250,
      p50: 1500,
      p95: 12000,
      max: 12000,
    });
  });
});

/**
 * Lag-sample exclusion rule (P1-LAG-SAMPLE-CLOCK-CONTRACT)
 *
 * The aggregator itself does not enforce the exclusion rule (it operates on
 * the array it receives). Exclusion is enforced upstream — at the call site
 * — by only passing event_ids whose processed_at was newly stamped this
 * cycle. These tests document the invariant via array shape:
 *   - 'processed' outcomes  → event_id passes to collectLagSamplesMs → sample included
 *   - 'duplicate' outcomes  → event_id NOT passed → no sample
 *   - 'skipped' outcomes    → event_id NOT passed → no sample
 *   - 'failed' (consumer)   → event_id NOT passed → no sample
 *   - claim-error           → no event_ids exist this cycle
 *   - auth-fail             → cycle short-circuits before any consumer runs
 *
 * The route-level test (outbox-relay-log-emission.test.ts) verifies the
 * exclusion-by-construction at the integration seam.
 */
describe('lag-sample exclusion rule (call-site invariant)', () => {
  it('only event_ids with successful "processed" outcome should be passed to the aggregator', () => {
    // Hypothetical cycle: 5 rows in batch — 2 processed, 1 duplicate,
    // 1 skipped, 1 failed. Only the 2 processed event_ids contribute to
    // lag samples. After collectLagSamplesMs fetches DB lag for those 2,
    // the aggregator sees exactly 2 samples.
    const samplesFromTwoProcessedRows = [120, 340];
    expect(aggregateLagSamples(samplesFromTwoProcessedRows)).toEqual({
      min: 120,
      p50: 120, // ceil(0.5 * 2) - 1 = 0 → lower midpoint
      p95: 340,
      max: 340,
    });
  });

  it('an entire cycle with no "processed" outcomes produces null aggregate (not zero)', () => {
    // All duplicate / skipped / failed → collectLagSamplesMs receives [] →
    // returns [] → aggregator returns null. The log line's lag_ms field is
    // null this cycle, not { min: 0, ... }.
    expect(aggregateLagSamples([])).toBeNull();
  });
});
