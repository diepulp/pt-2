/**
 * Table Settings (Betting Limits) Schema Validation Tests
 *
 * Tests the Zod validation schema for table betting limits.
 *
 * @see PRD-012 Table Betting Limits Management
 * @see services/table-context/schemas.ts
 */

import { updateTableLimitsSchema } from '../schemas';

describe('updateTableLimitsSchema', () => {
  describe('valid inputs', () => {
    it('accepts valid limits where min < max', () => {
      const input = { min_bet: 10, max_bet: 500 };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.min_bet).toBe(10);
        expect(result.data.max_bet).toBe(500);
      }
    });

    it('accepts valid limits where min equals max', () => {
      const input = { min_bet: 100, max_bet: 100 };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.min_bet).toBe(100);
        expect(result.data.max_bet).toBe(100);
      }
    });

    it('accepts zero min_bet with positive max_bet', () => {
      const input = { min_bet: 0, max_bet: 500 };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.min_bet).toBe(0);
        expect(result.data.max_bet).toBe(500);
      }
    });

    it('accepts both limits as zero', () => {
      const input = { min_bet: 0, max_bet: 0 };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('accepts large limit values', () => {
      const input = { min_bet: 1000, max_bet: 100000 };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.min_bet).toBe(1000);
        expect(result.data.max_bet).toBe(100000);
      }
    });

    it('accepts decimal values', () => {
      const input = { min_bet: 10.5, max_bet: 500.99 };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.min_bet).toBe(10.5);
        expect(result.data.max_bet).toBe(500.99);
      }
    });
  });

  describe('invalid inputs - min > max constraint', () => {
    it('rejects when min_bet > max_bet', () => {
      const input = { min_bet: 500, max_bet: 100 };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('min_bet');
        expect(result.error.issues[0].message).toContain(
          'min_bet must be less than or equal to max_bet',
        );
      }
    });

    it('rejects when min_bet is slightly greater than max_bet', () => {
      const input = { min_bet: 101, max_bet: 100 };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('min_bet');
      }
    });
  });

  describe('invalid inputs - negative values', () => {
    it('rejects negative min_bet', () => {
      const input = { min_bet: -10, max_bet: 500 };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('min_bet');
        expect(result.error.issues[0].message).toContain('non-negative');
      }
    });

    it('rejects negative max_bet', () => {
      const input = { min_bet: 10, max_bet: -500 };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('max_bet');
        expect(result.error.issues[0].message).toContain('non-negative');
      }
    });

    it('rejects both values negative', () => {
      const input = { min_bet: -10, max_bet: -5 };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(false);
      // Should have errors for both fields
      expect(result.error.issues.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('invalid inputs - missing fields', () => {
    it('rejects missing min_bet', () => {
      const input = { max_bet: 500 };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('min_bet');
      }
    });

    it('rejects missing max_bet', () => {
      const input = { min_bet: 10 };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('max_bet');
      }
    });

    it('rejects empty object', () => {
      const input = {};

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe('invalid inputs - wrong types', () => {
    it('rejects string min_bet', () => {
      const input = { min_bet: '10', max_bet: 500 };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('rejects string max_bet', () => {
      const input = { min_bet: 10, max_bet: '500' };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('rejects null min_bet', () => {
      const input = { min_bet: null, max_bet: 500 };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('rejects null max_bet', () => {
      const input = { min_bet: 10, max_bet: null };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('rejects undefined values', () => {
      const input = { min_bet: undefined, max_bet: undefined };

      const result = updateTableLimitsSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });
});
