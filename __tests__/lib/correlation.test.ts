/**
 * Correlation ID Tests
 * Tests AsyncLocalStorage-based correlation tracking
 */

import {
  generateCorrelationId,
  getCorrelationId,
  setCorrelationId,
  runWithCorrelation,
  getCorrelationContext,
} from '@/lib/correlation';

describe('Correlation ID Management', () => {
  describe('generateCorrelationId', () => {
    it('generates valid UUID v4', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('generates unique IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('getCorrelationId', () => {
    it('returns null when no context exists', () => {
      const id = getCorrelationId();
      expect(id).toBeNull();
    });
  });

  describe('setCorrelationId and getCorrelationId', () => {
    it('stores and retrieves correlation ID', () => {
      const testId = 'test-correlation-id';
      setCorrelationId(testId);
      expect(getCorrelationId()).toBe(testId);
    });
  });

  describe('runWithCorrelation', () => {
    it('provides correlation context to callback', async () => {
      const testId = 'test-correlation-id';
      const result = await runWithCorrelation(testId, async () => {
        expect(getCorrelationId()).toBe(testId);
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('auto-generates correlation ID if not provided', async () => {
      await runWithCorrelation(undefined, async () => {
        const id = getCorrelationId();
        expect(id).not.toBeNull();
        expect(id).toMatch(/^[0-9a-f-]{36}$/i);
      });
    });

    it('isolates correlation context between calls', async () => {
      const id1 = 'correlation-1';
      const id2 = 'correlation-2';

      const promise1 = runWithCorrelation(id1, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getCorrelationId();
      });

      const promise2 = runWithCorrelation(id2, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getCorrelationId();
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe(id1);
      expect(result2).toBe(id2);
    });
  });

  describe('getCorrelationContext', () => {
    it('returns null when no context exists', () => {
      const context = getCorrelationContext();
      expect(context).toBeNull();
    });

    it('returns full context with metadata', async () => {
      const testId = 'test-correlation-id';
      await runWithCorrelation(testId, async () => {
        const context = getCorrelationContext();
        expect(context).not.toBeNull();
        expect(context?.correlationId).toBe(testId);
        expect(context?.createdAt).toBeInstanceOf(Date);
      });
    });
  });
});
