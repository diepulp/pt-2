/**
 * Close Reason Schema Validation Tests (PRD-038A Gap B)
 *
 * Tests Zod schema validation for close_reason on both
 * closeTableSessionSchema and forceCloseTableSessionSchema.
 *
 * @see services/table-context/schemas.ts
 * @see PRD-038A §Gap B — Close Reason
 */

import {
  closeTableSessionSchema,
  forceCloseTableSessionSchema,
} from '../schemas';

// === Test 7: close_reason required — reject missing ===

describe('closeTableSessionSchema', () => {
  const validBase = {
    drop_event_id: '00000000-0000-0000-0000-000000000001',
    close_reason: 'end_of_shift' as const,
  };

  it('rejects when close_reason is missing', () => {
    const result = closeTableSessionSchema.safeParse({
      drop_event_id: validBase.drop_event_id,
      // close_reason omitted
    });
    expect(result.success).toBe(false);
  });

  // === Test 8: 'other' requires close_note ===

  it("rejects close_reason='other' without close_note", () => {
    const result = closeTableSessionSchema.safeParse({
      ...validBase,
      close_reason: 'other',
      // close_note omitted
    });
    expect(result.success).toBe(false);
  });

  // === Test 9: 'other' with note passes ===

  it("accepts close_reason='other' with close_note", () => {
    const result = closeTableSessionSchema.safeParse({
      ...validBase,
      close_reason: 'other',
      close_note: 'Manager requested early close',
    });
    expect(result.success).toBe(true);
  });

  // === Test 10: All 8 enum values accepted ===

  it.each([
    'end_of_shift',
    'maintenance',
    'game_change',
    'dealer_unavailable',
    'low_demand',
    'security_hold',
    'emergency',
    'other',
  ] as const)('accepts close_reason=%s', (reason) => {
    const input = {
      ...validBase,
      close_reason: reason,
      // 'other' needs close_note
      ...(reason === 'other' ? { close_note: 'Reason provided' } : {}),
    };
    const result = closeTableSessionSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects invalid close_reason value', () => {
    const result = closeTableSessionSchema.safeParse({
      ...validBase,
      close_reason: 'invalid_reason',
    });
    expect(result.success).toBe(false);
  });
});

// === Test 11: forceCloseSchema validates correctly ===

describe('forceCloseTableSessionSchema', () => {
  it('accepts valid force close input', () => {
    const result = forceCloseTableSessionSchema.safeParse({
      close_reason: 'emergency',
    });
    expect(result.success).toBe(true);
  });

  it("rejects close_reason='other' without close_note", () => {
    const result = forceCloseTableSessionSchema.safeParse({
      close_reason: 'other',
    });
    expect(result.success).toBe(false);
  });

  it("accepts close_reason='other' with close_note", () => {
    const result = forceCloseTableSessionSchema.safeParse({
      close_reason: 'other',
      close_note: 'Force close for shift change',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing close_reason', () => {
    const result = forceCloseTableSessionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
