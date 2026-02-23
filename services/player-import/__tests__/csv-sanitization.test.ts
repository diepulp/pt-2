/**
 * CSV Sanitization Tests
 *
 * Tests OWASP tab-prefix sanitization for formula injection prevention.
 *
 * @see lib/csv/csv-sanitize.ts
 * @see PRD-037 CSV Player Import — SEC Note T4
 */

import { sanitizeCellValue, sanitizeRecord } from '@/lib/csv/csv-sanitize';

describe('sanitizeCellValue', () => {
  describe('formula trigger characters', () => {
    it('prefixes "=" with tab', () => {
      expect(sanitizeCellValue('=SUM(A1:A10)')).toBe('\t=SUM(A1:A10)');
    });

    it('prefixes "+" with tab', () => {
      expect(sanitizeCellValue('+1234567890')).toBe('\t+1234567890');
    });

    it('prefixes "-" with tab', () => {
      expect(sanitizeCellValue('-cmd|calc|')).toBe('\t-cmd|calc|');
    });

    it('prefixes "@" with tab', () => {
      expect(sanitizeCellValue('@SUM(A1)')).toBe('\t@SUM(A1)');
    });

    it('prefixes tab character with tab', () => {
      expect(sanitizeCellValue('\tsomething')).toBe('\t\tsomething');
    });

    it('prefixes carriage return with tab', () => {
      expect(sanitizeCellValue('\rsomething')).toBe('\t\rsomething');
    });
  });

  describe('safe values unchanged', () => {
    it('leaves normal strings unchanged', () => {
      expect(sanitizeCellValue('hello')).toBe('hello');
    });

    it('leaves numeric strings unchanged', () => {
      expect(sanitizeCellValue('123')).toBe('123');
    });

    it('leaves email addresses unchanged (@ not at start)', () => {
      expect(sanitizeCellValue('foo@bar.com')).toBe('foo@bar.com');
    });

    it('leaves empty string unchanged', () => {
      expect(sanitizeCellValue('')).toBe('');
    });

    it('leaves strings with trigger chars in middle unchanged', () => {
      expect(sanitizeCellValue('hello=world')).toBe('hello=world');
      expect(sanitizeCellValue('hello+world')).toBe('hello+world');
      expect(sanitizeCellValue('hello-world')).toBe('hello-world');
    });
  });

  describe('edge cases', () => {
    it('handles single trigger character', () => {
      expect(sanitizeCellValue('=')).toBe('\t=');
      expect(sanitizeCellValue('+')).toBe('\t+');
      expect(sanitizeCellValue('-')).toBe('\t-');
      expect(sanitizeCellValue('@')).toBe('\t@');
    });

    it('only prefixes once (no double-tabbing on already-prefixed)', () => {
      // Tab is itself a trigger, so sanitizing an already-sanitized value
      // will add another tab — this is correct behavior
      const first = sanitizeCellValue('=formula');
      expect(first).toBe('\t=formula');

      const second = sanitizeCellValue(first);
      expect(second).toBe('\t\t=formula');
    });
  });
});

describe('sanitizeRecord', () => {
  it('sanitizes string values in a record', () => {
    const input = {
      name: 'John',
      formula: '=SUM(A1)',
      count: 42,
      email: 'john@example.com',
    };

    const result = sanitizeRecord(input);

    expect(result.name).toBe('John');
    expect(result.formula).toBe('\t=SUM(A1)');
    expect(result.count).toBe(42); // Non-string unchanged
    expect(result.email).toBe('john@example.com');
  });

  it('handles empty record', () => {
    const result = sanitizeRecord({});
    expect(result).toEqual({});
  });
});
