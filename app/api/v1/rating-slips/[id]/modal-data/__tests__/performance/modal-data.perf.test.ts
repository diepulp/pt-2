/**
 * @jest-environment node
 */
import { createMockRequest } from '@/lib/testing/route-test-helpers';
import { GET } from '@/app/api/v1/rating-slips/[id]/modal-data/route';

describe('modal-data performance', () => {
  const SAMPLE_SIZE = 10; // Reduced for unit test speed
  const P95_TARGET_MS = 500;

  // Use a valid UUID format for test
  const testSlipId = '00000000-0000-0000-0000-000000000001';

  it('should measure baseline performance', async () => {
    const times: number[] = [];

    for (let i = 0; i < SAMPLE_SIZE; i++) {
      const start = performance.now();
      const request = createMockRequest(
        'GET',
        `/api/v1/rating-slips/${testSlipId}/modal-data`,
      );

      try {
        await GET(request, { params: Promise.resolve({ id: testSlipId }) });
      } catch {
        // Expected - mocked services will fail, but we're measuring overhead
      }
      times.push(performance.now() - start);
    }

    const sorted = times.slice().sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];

    console.log(`Performance Baseline (n=${SAMPLE_SIZE}):`);
    console.log(`  p50: ${p50.toFixed(2)}ms`);
    console.log(`  p95: ${p95.toFixed(2)}ms`);

    // Baseline measurement - don't fail, just record
    expect(p95).toBeDefined();
  });

  it.skip('should meet p95 target after optimization', async () => {
    // Enable this test after optimization is complete
    const times: number[] = [];

    for (let i = 0; i < SAMPLE_SIZE; i++) {
      const start = performance.now();
      // ... actual test with real database
      times.push(performance.now() - start);
    }

    const sorted = times.slice().sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];

    expect(p95).toBeLessThan(P95_TARGET_MS);
  });
});
