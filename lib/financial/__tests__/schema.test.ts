import { dollarsToCents } from '../rounding';
import {
  completenessStatusSchema,
  financialAuthoritySchema,
  financialValueSchema,
} from '../schema';

// ---------------------------------------------------------------------------
// financialAuthoritySchema / completenessStatusSchema
// ---------------------------------------------------------------------------

describe('financialAuthoritySchema', () => {
  it.each(['actual', 'estimated', 'observed', 'compliance'] as const)(
    'accepts authority "%s"',
    (authority) => {
      expect(financialAuthoritySchema.parse(authority)).toBe(authority);
    },
  );

  it('rejects unknown authority values', () => {
    expect(() => financialAuthoritySchema.parse('guess')).toThrow();
  });
});

describe('completenessStatusSchema', () => {
  it.each(['complete', 'partial', 'unknown'] as const)(
    'accepts completeness status "%s"',
    (status) => {
      expect(completenessStatusSchema.parse(status)).toBe(status);
    },
  );

  it('rejects unknown completeness status values', () => {
    expect(() => completenessStatusSchema.parse('missing')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// financialValueSchema — authority × completeness coverage
// ---------------------------------------------------------------------------

describe('financialValueSchema', () => {
  const authorities = [
    'actual',
    'estimated',
    'observed',
    'compliance',
  ] as const;
  const statuses = ['complete', 'partial', 'unknown'] as const;

  describe.each(authorities)('authority "%s"', (type) => {
    it.each(statuses)('accepts completeness "%s"', (status) => {
      const value = {
        value: 12345,
        type,
        source: `${type}-source`,
        completeness: { status },
      };
      expect(financialValueSchema.parse(value)).toEqual(value);
    });
  });

  it('accepts coverage within [0, 1]', () => {
    const value = {
      value: 100,
      type: 'estimated' as const,
      source: 'table_session.drop',
      completeness: { status: 'partial' as const, coverage: 0.75 },
    };
    expect(financialValueSchema.parse(value)).toEqual(value);
  });

  it('accepts negative cents (e.g. credits)', () => {
    const value = {
      value: -2500,
      type: 'actual' as const,
      source: 'pft.ledger',
      completeness: { status: 'complete' as const },
    };
    expect(financialValueSchema.parse(value)).toEqual(value);
  });

  it('accepts zero cents', () => {
    const value = {
      value: 0,
      type: 'observed' as const,
      source: 'pit_cash_observation.extrapolated',
      completeness: { status: 'unknown' as const },
    };
    expect(financialValueSchema.parse(value)).toEqual(value);
  });

  it('rejects non-integer value (dollars must be converted to cents)', () => {
    expect(() =>
      financialValueSchema.parse({
        value: 12.34,
        type: 'actual',
        source: 'pft.ledger',
        completeness: { status: 'complete' },
      }),
    ).toThrow();
  });

  it('rejects NaN value', () => {
    expect(() =>
      financialValueSchema.parse({
        value: Number.NaN,
        type: 'estimated',
        source: 'table_session.drop',
        completeness: { status: 'unknown' },
      }),
    ).toThrow();
  });

  it('rejects empty source', () => {
    expect(() =>
      financialValueSchema.parse({
        value: 100,
        type: 'actual',
        source: '',
        completeness: { status: 'complete' },
      }),
    ).toThrow();
  });

  it('rejects omitted completeness.status (must be explicit)', () => {
    expect(() =>
      financialValueSchema.parse({
        value: 100,
        type: 'actual',
        source: 'pft.ledger',
        completeness: {},
      }),
    ).toThrow();
  });

  it('rejects coverage outside [0, 1]', () => {
    expect(() =>
      financialValueSchema.parse({
        value: 100,
        type: 'estimated',
        source: 'table_session.drop',
        completeness: { status: 'partial', coverage: 1.5 },
      }),
    ).toThrow();
    expect(() =>
      financialValueSchema.parse({
        value: 100,
        type: 'estimated',
        source: 'table_session.drop',
        completeness: { status: 'partial', coverage: -0.1 },
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// dollarsToCents — pinned Math.round(dollars * 100) boundary cases
// ---------------------------------------------------------------------------
//
// These assertions pin the exact observable behavior of the canonical rounding
// helper (PRD-070 G6). They are cited in the Phase 1.2 handoff package as the
// Wave-2 replication spec; downstream systems that migrate to cents storage
// must reproduce these outputs byte-for-byte.

describe('dollarsToCents — pinned Wave-2 replication spec (PRD-070 G6)', () => {
  it('rounds whole dollars exactly', () => {
    expect(dollarsToCents(0)).toBe(0);
    expect(dollarsToCents(1)).toBe(100);
    expect(dollarsToCents(100)).toBe(10000);
    expect(dollarsToCents(-1)).toBe(-100);
  });

  it('rounds clean fractional cents exactly', () => {
    expect(dollarsToCents(0.1)).toBe(10);
    expect(dollarsToCents(0.25)).toBe(25);
    expect(dollarsToCents(1.23)).toBe(123);
  });

  // Pinned positive-half boundaries.
  it('pins 0.005 dollars to 1 cent (Math.round half-away from zero for positive)', () => {
    expect(dollarsToCents(0.005)).toBe(1);
  });

  it('pins 0.015 dollars to 2 cents', () => {
    expect(dollarsToCents(0.015)).toBe(2);
  });

  it('pins 0.025 dollars to 3 cents', () => {
    expect(dollarsToCents(0.025)).toBe(3);
  });

  // Pinned negative-half boundaries.
  // Math.round rounds half toward +Infinity, so -0.5 → -0 and -1.5 → -1.
  it('pins -0.005 dollars to negative zero (IEEE-754 -0, numerically equal to 0)', () => {
    const result = dollarsToCents(-0.005);
    expect(Object.is(result, -0)).toBe(true);
    expect(result === 0).toBe(true);
  });

  it('pins -0.015 dollars to -1 cent', () => {
    expect(dollarsToCents(-0.015)).toBe(-1);
  });

  it('pins -0.025 dollars to -2 cents', () => {
    expect(dollarsToCents(-0.025)).toBe(-2);
  });

  // Float-imprecision boundaries — these look like half-cases but the float
  // multiplication lands just below .5, so Math.round goes the "wrong" way.
  // This is exactly the behavior Wave 2 must replicate.
  it('pins 1.005 dollars to 100 cents (NOT 101 — float imprecision lands at 100.49999…)', () => {
    expect(dollarsToCents(1.005)).toBe(100);
  });

  it('pins 1.015 dollars to 101 cents (NOT 102 — float imprecision lands at 101.49999…)', () => {
    expect(dollarsToCents(1.015)).toBe(101);
  });
});
