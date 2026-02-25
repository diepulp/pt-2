/**
 * @jest-environment node
 *
 * PRD-038 Rundown Report Schema Validation Tests
 *
 * Tests Zod schemas for rundown report API operations.
 *
 * @see rundown-report/schemas.ts
 * @see EXEC-038 WS6
 */

import {
  persistRundownSchema,
  finalizeRundownSchema,
  rundownQuerySchema,
  rundownRouteParamsSchema,
  rundownSessionRouteParamsSchema,
} from '../rundown-report/schemas';

describe('PRD-038 Rundown Report Schemas', () => {
  // === persistRundownSchema ===

  describe('persistRundownSchema', () => {
    it('accepts valid table_session_id', () => {
      const result = persistRundownSchema.safeParse({
        table_session_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing table_session_id', () => {
      const result = persistRundownSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects invalid UUID format', () => {
      const result = persistRundownSchema.safeParse({
        table_session_id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty string', () => {
      const result = persistRundownSchema.safeParse({
        table_session_id: '',
      });
      expect(result.success).toBe(false);
    });

    it('accepts lowercase UUID', () => {
      const result = persistRundownSchema.safeParse({
        table_session_id: 'abcdef01-2345-6789-abcd-ef0123456789',
      });
      expect(result.success).toBe(true);
    });

    it('accepts uppercase UUID', () => {
      const result = persistRundownSchema.safeParse({
        table_session_id: 'ABCDEF01-2345-6789-ABCD-EF0123456789',
      });
      expect(result.success).toBe(true);
    });

    it('strips unknown fields', () => {
      const result = persistRundownSchema.safeParse({
        table_session_id: '123e4567-e89b-12d3-a456-426614174000',
        extra_field: 'should be ignored',
      });
      expect(result.success).toBe(true);
    });
  });

  // === finalizeRundownSchema ===

  describe('finalizeRundownSchema', () => {
    it('accepts empty object', () => {
      const result = finalizeRundownSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts object with unknown fields (strips them)', () => {
      const result = finalizeRundownSchema.safeParse({ notes: 'ignored' });
      expect(result.success).toBe(true);
    });
  });

  // === rundownQuerySchema ===

  describe('rundownQuerySchema', () => {
    it('accepts valid gaming_day', () => {
      const result = rundownQuerySchema.safeParse({
        gaming_day: '2026-02-24',
      });
      expect(result.success).toBe(true);
    });

    it('accepts gaming_day with gaming_table_id', () => {
      const result = rundownQuerySchema.safeParse({
        gaming_day: '2026-02-24',
        gaming_table_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty object (all optional)', () => {
      const result = rundownQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('rejects invalid gaming_day format', () => {
      const result = rundownQuerySchema.safeParse({
        gaming_day: '02-24-2026',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid gaming_table_id format', () => {
      const result = rundownQuerySchema.safeParse({
        gaming_table_id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  // === rundownRouteParamsSchema ===

  describe('rundownRouteParamsSchema', () => {
    it('accepts valid report ID', () => {
      const result = rundownRouteParamsSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing id', () => {
      const result = rundownRouteParamsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects invalid UUID', () => {
      const result = rundownRouteParamsSchema.safeParse({
        id: 'bad-id',
      });
      expect(result.success).toBe(false);
    });
  });

  // === rundownSessionRouteParamsSchema ===

  describe('rundownSessionRouteParamsSchema', () => {
    it('accepts valid session ID', () => {
      const result = rundownSessionRouteParamsSchema.safeParse({
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing sessionId', () => {
      const result = rundownSessionRouteParamsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects invalid UUID', () => {
      const result = rundownSessionRouteParamsSchema.safeParse({
        sessionId: 'xyz',
      });
      expect(result.success).toBe(false);
    });
  });
});
