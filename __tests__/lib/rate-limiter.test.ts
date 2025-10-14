/**
 * Rate Limiter Tests
 * Tests in-memory rate limiting for manual rewards
 */

import {
  checkRateLimit,
  getRateLimitStatus,
  resetRateLimit,
} from '@/lib/rate-limiter';

describe('Rate Limiter', () => {
  beforeEach(() => {
    // Reset rate limits between tests
    resetRateLimit('test-staff-1');
    resetRateLimit('test-staff-2');
  });

  describe('checkRateLimit', () => {
    it('allows requests within limit', () => {
      const isLimited1 = checkRateLimit('test-staff-1', {
        max: 3,
        window: 60000,
      });
      const isLimited2 = checkRateLimit('test-staff-1', {
        max: 3,
        window: 60000,
      });
      const isLimited3 = checkRateLimit('test-staff-1', {
        max: 3,
        window: 60000,
      });

      expect(isLimited1).toBe(false);
      expect(isLimited2).toBe(false);
      expect(isLimited3).toBe(false);
    });

    it('blocks requests exceeding limit', () => {
      const options = { max: 2, window: 60000 };

      checkRateLimit('test-staff-1', options);
      checkRateLimit('test-staff-1', options);
      const isLimited = checkRateLimit('test-staff-1', options);

      expect(isLimited).toBe(true);
    });

    it('isolates limits per key', () => {
      const options = { max: 2, window: 60000 };

      checkRateLimit('test-staff-1', options);
      checkRateLimit('test-staff-1', options);
      const isLimitedStaff1 = checkRateLimit('test-staff-1', options);

      const isLimitedStaff2 = checkRateLimit('test-staff-2', options);

      expect(isLimitedStaff1).toBe(true); // Staff 1 exceeded
      expect(isLimitedStaff2).toBe(false); // Staff 2 within limit
    });

    it('resets limit after window expires', async () => {
      const options = { max: 2, window: 100 }; // 100ms window

      checkRateLimit('test-staff-1', options);
      checkRateLimit('test-staff-1', options);
      const isLimitedBefore = checkRateLimit('test-staff-1', options);

      expect(isLimitedBefore).toBe(true);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const isLimitedAfter = checkRateLimit('test-staff-1', options);
      expect(isLimitedAfter).toBe(false); // Window expired, limit reset
    });

    it('allows first request for new key', () => {
      const isLimited = checkRateLimit('new-staff', {
        max: 1,
        window: 60000,
      });

      expect(isLimited).toBe(false);
    });
  });

  describe('getRateLimitStatus', () => {
    it('returns full quota for new key', () => {
      const status = getRateLimitStatus('test-staff-1', {
        max: 10,
        window: 60000,
      });

      expect(status.remaining).toBe(10);
      expect(status.resetAt).toBeNull();
      expect(status.isLimited).toBe(false);
    });

    it('returns decreasing remaining count', () => {
      const options = { max: 5, window: 60000 };

      checkRateLimit('test-staff-1', options);
      const status1 = getRateLimitStatus('test-staff-1', options);
      expect(status1.remaining).toBe(4);

      checkRateLimit('test-staff-1', options);
      const status2 = getRateLimitStatus('test-staff-1', options);
      expect(status2.remaining).toBe(3);
    });

    it('returns reset time', () => {
      checkRateLimit('test-staff-1', { max: 5, window: 60000 });

      const status = getRateLimitStatus('test-staff-1', {
        max: 5,
        window: 60000,
      });

      expect(status.resetAt).toBeInstanceOf(Date);
      expect(status.resetAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('indicates limited status when quota exhausted', () => {
      const options = { max: 2, window: 60000 };

      checkRateLimit('test-staff-1', options);
      checkRateLimit('test-staff-1', options);

      const status = getRateLimitStatus('test-staff-1', options);

      expect(status.remaining).toBe(0);
      expect(status.isLimited).toBe(true);
    });

    it('resets status after window expires', async () => {
      const options = { max: 2, window: 100 }; // 100ms window

      checkRateLimit('test-staff-1', options);
      checkRateLimit('test-staff-1', options);

      const statusBefore = getRateLimitStatus('test-staff-1', options);
      expect(statusBefore.remaining).toBe(0);
      expect(statusBefore.isLimited).toBe(true);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const statusAfter = getRateLimitStatus('test-staff-1', options);
      expect(statusAfter.remaining).toBe(2);
      expect(statusAfter.isLimited).toBe(false);
      expect(statusAfter.resetAt).toBeNull();
    });
  });

  describe('resetRateLimit', () => {
    it('clears rate limit for key', () => {
      const options = { max: 2, window: 60000 };

      checkRateLimit('test-staff-1', options);
      checkRateLimit('test-staff-1', options);

      const statusBefore = getRateLimitStatus('test-staff-1', options);
      expect(statusBefore.remaining).toBe(0);

      resetRateLimit('test-staff-1');

      const statusAfter = getRateLimitStatus('test-staff-1', options);
      expect(statusAfter.remaining).toBe(2);
      expect(statusAfter.isLimited).toBe(false);
    });

    it('does not affect other keys', () => {
      const options = { max: 2, window: 60000 };

      checkRateLimit('test-staff-1', options);
      checkRateLimit('test-staff-2', options);

      resetRateLimit('test-staff-1');

      const status1 = getRateLimitStatus('test-staff-1', options);
      const status2 = getRateLimitStatus('test-staff-2', options);

      expect(status1.remaining).toBe(2); // Reset
      expect(status2.remaining).toBe(1); // Unchanged
    });
  });
});
