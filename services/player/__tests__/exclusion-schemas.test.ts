/**
 * Player Exclusion Schema Tests
 *
 * Zod validation tests for exclusion create/lift inputs.
 *
 * @see ADR-042 Player Exclusion Architecture
 * @see EXEC-050 WS7
 */

import {
  createExclusionSchema,
  liftExclusionSchema,
  exclusionRouteParamsSchema,
  exclusionDetailParamsSchema,
} from '../exclusion-schemas';

// === createExclusionSchema ===

describe('createExclusionSchema', () => {
  const validInput = {
    player_id: '11111111-1111-1111-1111-111111111111',
    exclusion_type: 'internal_ban',
    enforcement: 'hard_block',
    reason: 'Disruptive behavior at tables',
  };

  it('accepts valid minimal input', () => {
    const result = createExclusionSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts valid input with all optional fields', () => {
    const result = createExclusionSchema.safeParse({
      ...validInput,
      effective_from: '2026-03-01T00:00:00Z',
      effective_until: '2026-12-31T23:59:59Z',
      review_date: '2026-06-01T00:00:00Z',
      external_ref: 'STATE-2026-001',
      jurisdiction: 'Nevada',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null for nullable optional fields', () => {
    const result = createExclusionSchema.safeParse({
      ...validInput,
      effective_until: null,
      review_date: null,
      external_ref: null,
      jurisdiction: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing player_id', () => {
    const { player_id: _, ...input } = validInput;
    const result = createExclusionSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid player_id', () => {
    const result = createExclusionSchema.safeParse({
      ...validInput,
      player_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing exclusion_type', () => {
    const { exclusion_type: _, ...input } = validInput;
    const result = createExclusionSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid exclusion_type', () => {
    const result = createExclusionSchema.safeParse({
      ...validInput,
      exclusion_type: 'invalid_type',
    });
    expect(result.success).toBe(false);
  });

  it.each([
    'self_exclusion',
    'trespass',
    'regulatory',
    'internal_ban',
    'watchlist',
  ])('accepts exclusion_type "%s"', (type) => {
    const result = createExclusionSchema.safeParse({
      ...validInput,
      exclusion_type: type,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing enforcement', () => {
    const { enforcement: _, ...input } = validInput;
    const result = createExclusionSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid enforcement', () => {
    const result = createExclusionSchema.safeParse({
      ...validInput,
      enforcement: 'invalid_enforcement',
    });
    expect(result.success).toBe(false);
  });

  it.each(['hard_block', 'soft_alert', 'monitor'])(
    'accepts enforcement "%s"',
    (enforcement) => {
      const result = createExclusionSchema.safeParse({
        ...validInput,
        enforcement,
      });
      expect(result.success).toBe(true);
    },
  );

  it('rejects missing reason', () => {
    const { reason: _, ...input } = validInput;
    const result = createExclusionSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects empty reason', () => {
    const result = createExclusionSchema.safeParse({
      ...validInput,
      reason: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects reason exceeding 1000 chars', () => {
    const result = createExclusionSchema.safeParse({
      ...validInput,
      reason: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid effective_from format', () => {
    const result = createExclusionSchema.safeParse({
      ...validInput,
      effective_from: '2026-03-01', // not ISO 8601 datetime
    });
    expect(result.success).toBe(false);
  });
});

// === liftExclusionSchema ===

describe('liftExclusionSchema', () => {
  it('accepts valid lift input', () => {
    const result = liftExclusionSchema.safeParse({
      lift_reason: 'Ban period expired, reviewed by management',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing lift_reason', () => {
    const result = liftExclusionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty lift_reason', () => {
    const result = liftExclusionSchema.safeParse({ lift_reason: '' });
    expect(result.success).toBe(false);
  });

  it('rejects lift_reason exceeding 1000 chars', () => {
    const result = liftExclusionSchema.safeParse({
      lift_reason: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

// === Route Param Schemas ===

describe('exclusionRouteParamsSchema', () => {
  it('accepts valid playerId', () => {
    const result = exclusionRouteParamsSchema.safeParse({
      playerId: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid playerId', () => {
    const result = exclusionRouteParamsSchema.safeParse({
      playerId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('exclusionDetailParamsSchema', () => {
  it('accepts valid playerId and exclusionId', () => {
    const result = exclusionDetailParamsSchema.safeParse({
      playerId: '11111111-1111-1111-1111-111111111111',
      exclusionId: '22222222-2222-2222-2222-222222222222',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing exclusionId', () => {
    const result = exclusionDetailParamsSchema.safeParse({
      playerId: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.success).toBe(false);
  });
});
