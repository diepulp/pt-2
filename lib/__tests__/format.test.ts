/**
 * Unit tests for lib/format.ts
 *
 * ADR-031: Tests for the explicit formatting API.
 * PRD-036: Null values return em-dash "—" (not "$0").
 * Covers formatDollars, formatCents, formatDollarsDelta, formatCentsDelta,
 * and backward compatibility of deprecated formatCurrency/formatCurrencyDelta.
 */

import {
  formatDollars,
  formatCents,
  formatDollarsDelta,
  formatCentsDelta,
  formatCurrency,
  formatCurrencyDelta,
  formatNumber,
  formatPercentage,
} from '../format';

// ---------------------------------------------------------------------------
// formatDollars
// ---------------------------------------------------------------------------

describe('formatDollars', () => {
  it('formats positive dollar amounts', () => {
    expect(formatDollars(100)).toBe('$100');
    expect(formatDollars(1500)).toBe('$1,500');
    expect(formatDollars(1234567)).toBe('$1,234,567');
  });

  it('formats zero', () => {
    expect(formatDollars(0)).toBe('$0');
  });

  it('formats negative amounts', () => {
    expect(formatDollars(-50)).toBe('-$50');
    expect(formatDollars(-1500)).toBe('-$1,500');
  });

  it('returns "—" for null (PRD-036)', () => {
    expect(formatDollars(null)).toBe('\u2014');
  });

  it('returns "—" for undefined (PRD-036)', () => {
    expect(formatDollars(undefined)).toBe('\u2014');
  });

  it('formats small amounts without decimals', () => {
    expect(formatDollars(1)).toBe('$1');
    expect(formatDollars(99)).toBe('$99');
  });
});

// ---------------------------------------------------------------------------
// formatCents
// ---------------------------------------------------------------------------

describe('formatCents', () => {
  it('converts cents to dollars and formats', () => {
    expect(formatCents(10000)).toBe('$100');
    expect(formatCents(150000)).toBe('$1,500');
    expect(formatCents(123456700)).toBe('$1,234,567');
  });

  it('formats zero cents', () => {
    expect(formatCents(0)).toBe('$0');
  });

  it('formats negative cent amounts', () => {
    expect(formatCents(-5000)).toBe('-$50');
    expect(formatCents(-150000)).toBe('-$1,500');
  });

  it('returns "—" for null (PRD-036)', () => {
    expect(formatCents(null)).toBe('\u2014');
  });

  it('returns "—" for undefined (PRD-036)', () => {
    expect(formatCents(undefined)).toBe('\u2014');
  });

  it('zero is NOT null — still renders as $0', () => {
    expect(formatCents(0)).toBe('$0');
  });
});

// ---------------------------------------------------------------------------
// Equivalence: formatDollars(X) === formatCents(X * 100)
// ---------------------------------------------------------------------------

describe('formatDollars / formatCents equivalence', () => {
  it('formatDollars(100) equals formatCents(10000)', () => {
    expect(formatDollars(100)).toBe(formatCents(10000));
    expect(formatDollars(100)).toBe('$100');
  });

  it('formatDollars(1500) equals formatCents(150000)', () => {
    expect(formatDollars(1500)).toBe(formatCents(150000));
  });

  it('null equivalence — both return em-dash', () => {
    expect(formatDollars(null)).toBe(formatCents(null));
    expect(formatDollars(null)).toBe('\u2014');
  });
});

// ---------------------------------------------------------------------------
// formatDollarsDelta
// ---------------------------------------------------------------------------

describe('formatDollarsDelta', () => {
  it('formats positive delta with + sign', () => {
    expect(formatDollarsDelta(100)).toBe('+$100');
    expect(formatDollarsDelta(1500)).toBe('+$1,500');
  });

  it('formats negative delta with - sign', () => {
    expect(formatDollarsDelta(-50)).toBe('-$50');
    expect(formatDollarsDelta(-1500)).toBe('-$1,500');
  });

  it('formats zero delta with sign', () => {
    expect(formatDollarsDelta(0)).toBe('+$0');
  });

  it('returns "—" for null (PRD-036)', () => {
    expect(formatDollarsDelta(null)).toBe('\u2014');
  });

  it('returns "—" for undefined (PRD-036)', () => {
    expect(formatDollarsDelta(undefined)).toBe('\u2014');
  });
});

// ---------------------------------------------------------------------------
// formatCentsDelta
// ---------------------------------------------------------------------------

describe('formatCentsDelta', () => {
  it('converts cents to dollars delta with + sign', () => {
    expect(formatCentsDelta(10000)).toBe('+$100');
    expect(formatCentsDelta(150000)).toBe('+$1,500');
  });

  it('converts cents to dollars delta with - sign', () => {
    expect(formatCentsDelta(-5000)).toBe('-$50');
    expect(formatCentsDelta(-150000)).toBe('-$1,500');
  });

  it('formats zero cents delta with sign', () => {
    expect(formatCentsDelta(0)).toBe('+$0');
  });

  it('returns "—" for null (PRD-036)', () => {
    expect(formatCentsDelta(null)).toBe('\u2014');
  });

  it('returns "—" for undefined (PRD-036)', () => {
    expect(formatCentsDelta(undefined)).toBe('\u2014');
  });
});

// ---------------------------------------------------------------------------
// Deprecated: formatCurrency (backward compatibility)
// ---------------------------------------------------------------------------

describe('formatCurrency (deprecated)', () => {
  it('delegates to formatCents', () => {
    expect(formatCurrency(10000)).toBe('$100');
    expect(formatCurrency(150000)).toBe('$1,500');
    expect(formatCurrency(0)).toBe('$0');
    expect(formatCurrency(null)).toBe('\u2014');
    expect(formatCurrency(undefined)).toBe('\u2014');
  });

  it('matches formatCents output exactly', () => {
    expect(formatCurrency(10000)).toBe(formatCents(10000));
    expect(formatCurrency(-5000)).toBe(formatCents(-5000));
    expect(formatCurrency(null)).toBe(formatCents(null));
  });
});

// ---------------------------------------------------------------------------
// Deprecated: formatCurrencyDelta (backward compatibility)
// ---------------------------------------------------------------------------

describe('formatCurrencyDelta (deprecated)', () => {
  it('delegates to formatCentsDelta', () => {
    expect(formatCurrencyDelta(10000)).toBe('+$100');
    expect(formatCurrencyDelta(-5000)).toBe('-$50');
    expect(formatCurrencyDelta(0)).toBe('+$0');
    expect(formatCurrencyDelta(null)).toBe('\u2014');
    expect(formatCurrencyDelta(undefined)).toBe('\u2014');
  });

  it('matches formatCentsDelta output exactly', () => {
    expect(formatCurrencyDelta(10000)).toBe(formatCentsDelta(10000));
    expect(formatCurrencyDelta(-5000)).toBe(formatCentsDelta(-5000));
    expect(formatCurrencyDelta(null)).toBe(formatCentsDelta(null));
  });
});

// ---------------------------------------------------------------------------
// General formatting (existing functions)
// ---------------------------------------------------------------------------

describe('formatNumber', () => {
  it('formats with thousand separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('returns "0" for null/undefined', () => {
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(undefined)).toBe('0');
  });
});

describe('formatPercentage', () => {
  it('formats with default 0 decimals', () => {
    expect(formatPercentage(75)).toBe('75%');
  });

  it('formats with specified decimals', () => {
    expect(formatPercentage(75.123, 2)).toBe('75.12%');
  });

  it('returns "0%" for null/undefined', () => {
    expect(formatPercentage(null)).toBe('0%');
    expect(formatPercentage(undefined)).toBe('0%');
  });
});
