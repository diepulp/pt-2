/**
 * @jest-environment node
 *
 * PRD-038 Shift Checkpoint Schema Validation Tests
 *
 * Tests Zod schemas for shift checkpoint API operations.
 *
 * @see shift-checkpoint/schemas.ts
 * @see EXEC-038 WS6
 */

import {
  createCheckpointSchema,
  checkpointQuerySchema,
} from '../shift-checkpoint/schemas';

describe('PRD-038 Shift Checkpoint Schemas', () => {
  // === createCheckpointSchema ===

  describe('createCheckpointSchema', () => {
    it('accepts valid checkpoint_type', () => {
      const result = createCheckpointSchema.safeParse({
        checkpoint_type: 'shift_change',
      });
      expect(result.success).toBe(true);
    });

    it('accepts checkpoint_type with notes', () => {
      const result = createCheckpointSchema.safeParse({
        checkpoint_type: 'mid_shift',
        notes: 'Routine mid-shift checkpoint',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.checkpoint_type).toBe('mid_shift');
        expect(result.data.notes).toBe('Routine mid-shift checkpoint');
      }
    });

    it('accepts checkpoint_type without notes (optional)', () => {
      const result = createCheckpointSchema.safeParse({
        checkpoint_type: 'shift_change',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.notes).toBeUndefined();
      }
    });

    it('rejects missing checkpoint_type', () => {
      const result = createCheckpointSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects empty checkpoint_type', () => {
      const result = createCheckpointSchema.safeParse({
        checkpoint_type: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects checkpoint_type exceeding max length', () => {
      const result = createCheckpointSchema.safeParse({
        checkpoint_type: 'a'.repeat(51),
      });
      expect(result.success).toBe(false);
    });

    it('rejects notes exceeding max length', () => {
      const result = createCheckpointSchema.safeParse({
        checkpoint_type: 'shift_change',
        notes: 'a'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });

    it('accepts notes at max length boundary', () => {
      const result = createCheckpointSchema.safeParse({
        checkpoint_type: 'shift_change',
        notes: 'a'.repeat(2000),
      });
      expect(result.success).toBe(true);
    });

    it('accepts checkpoint_type at max length boundary', () => {
      const result = createCheckpointSchema.safeParse({
        checkpoint_type: 'a'.repeat(50),
      });
      expect(result.success).toBe(true);
    });
  });

  // === checkpointQuerySchema ===

  describe('checkpointQuerySchema', () => {
    it('accepts valid gaming_day', () => {
      const result = checkpointQuerySchema.safeParse({
        gaming_day: '2026-02-24',
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty object (all optional)', () => {
      const result = checkpointQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('rejects invalid gaming_day format (MM-DD-YYYY)', () => {
      const result = checkpointQuerySchema.safeParse({
        gaming_day: '02-24-2026',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid gaming_day format (no dashes)', () => {
      const result = checkpointQuerySchema.safeParse({
        gaming_day: '20260224',
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-date string', () => {
      const result = checkpointQuerySchema.safeParse({
        gaming_day: 'today',
      });
      expect(result.success).toBe(false);
    });
  });
});
