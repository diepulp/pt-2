import {
  normalizeHeaders,
  normalizeFieldValue,
  applyColumnMapping,
} from '@/lib/csv/header-normalization';

// ---------------------------------------------------------------------------
// normalizeHeaders
// ---------------------------------------------------------------------------
describe('normalizeHeaders', () => {
  describe('trimming', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalizeHeaders(['  email ', ' phone\t'])).toEqual([
        'email',
        'phone',
      ]);
    });
  });

  describe('BOM stripping', () => {
    it('strips BOM (U+FEFF) from the first header', () => {
      const bom = '\uFEFF';
      const result = normalizeHeaders([`${bom}email`, 'phone']);
      expect(result[0]).toBe('email');
      expect(result[1]).toBe('phone');
    });

    it('strips BOM even with surrounding whitespace', () => {
      const bom = '\uFEFF';
      const result = normalizeHeaders([` ${bom} email `]);
      expect(result[0]).toBe('email');
    });

    it('trim() also removes BOM from non-first headers', () => {
      // Modern JS trim() removes U+FEFF (zero-width no-break space)
      const bom = '\uFEFF';
      const result = normalizeHeaders([`${bom}email`, `${bom}phone`]);
      expect(result[0]).toBe('email');
      expect(result[1]).toBe('phone');
    });
  });

  describe('blank headers → _col_N', () => {
    it('replaces empty string with _col_N (1-indexed)', () => {
      expect(normalizeHeaders(['', 'email', ''])).toEqual([
        '_col_1',
        'email',
        '_col_3',
      ]);
    });

    it('replaces whitespace-only with _col_N', () => {
      expect(normalizeHeaders(['   ', 'email'])).toEqual(['_col_1', 'email']);
    });
  });

  describe('newline replacement', () => {
    it('replaces \\n with space', () => {
      expect(normalizeHeaders(['first\nname'])).toEqual(['first name']);
    });

    it('replaces \\r\\n with space', () => {
      expect(normalizeHeaders(['first\r\nname'])).toEqual(['first name']);
    });

    it('replaces \\r with space', () => {
      expect(normalizeHeaders(['first\rname'])).toEqual(['first name']);
    });

    it('replaces multiple newlines', () => {
      expect(normalizeHeaders(['a\nb\nc'])).toEqual(['a b c']);
    });
  });

  describe('deduplication', () => {
    it('appends _2, _3 to duplicate headers', () => {
      expect(normalizeHeaders(['name', 'name', 'name'])).toEqual([
        'name',
        'name_2',
        'name_3',
      ]);
    });

    it('handles duplicates after normalization', () => {
      // Both trim to "email" → second gets _2
      expect(normalizeHeaders(['email', ' email '])).toEqual([
        'email',
        'email_2',
      ]);
    });
  });

  describe('mixed scenarios', () => {
    it('handles all transformations together', () => {
      const bom = '\uFEFF';
      const result = normalizeHeaders([
        `${bom}  Email `,
        '',
        'Email',
        '  Phone\n#  ',
      ]);
      expect(result).toEqual(['Email', '_col_2', 'Email_2', 'Phone #']);
    });

    it('returns empty array for empty input', () => {
      expect(normalizeHeaders([])).toEqual([]);
    });

    it('preserves non-problematic headers unchanged', () => {
      expect(normalizeHeaders(['email', 'phone', 'first_name'])).toEqual([
        'email',
        'phone',
        'first_name',
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeFieldValue
// ---------------------------------------------------------------------------
describe('normalizeFieldValue', () => {
  it('returns null for null input', () => {
    expect(normalizeFieldValue(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizeFieldValue(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeFieldValue('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normalizeFieldValue('   ')).toBeNull();
  });

  it('trims and returns non-empty string', () => {
    expect(normalizeFieldValue('  alice@example.com  ')).toBe(
      'alice@example.com',
    );
  });

  it('returns already-trimmed string unchanged', () => {
    expect(normalizeFieldValue('hello')).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// applyColumnMapping
// ---------------------------------------------------------------------------
describe('applyColumnMapping', () => {
  const headers = ['Email', 'Phone', 'First Name', 'Last Name'];

  it('maps canonical field names to CSV header values', () => {
    const rawRow: Record<string, string | null> = {
      Email: 'alice@example.com',
      Phone: '555-0101',
      'First Name': 'Alice',
      'Last Name': 'Johnson',
    };
    const mapping = {
      email: 'Email',
      phone: 'Phone',
      first_name: 'First Name',
      last_name: 'Last Name',
    };

    const result = applyColumnMapping(rawRow, headers, mapping);

    expect(result).toEqual({
      email: 'alice@example.com',
      phone: '555-0101',
      first_name: 'Alice',
      last_name: 'Johnson',
    });
  });

  it('skips mappings for headers not in normalizedHeaders', () => {
    const rawRow: Record<string, string | null> = {
      Email: 'alice@example.com',
    };
    const mapping = {
      email: 'Email',
      phone: 'Missing Header', // not in headers
    };

    const result = applyColumnMapping(rawRow, headers, mapping);

    expect(result).toEqual({
      email: 'alice@example.com',
      // phone is not present (header not found)
    });
    expect(result).not.toHaveProperty('phone');
  });

  it('normalizes field values (trim, empty → null)', () => {
    const rawRow: Record<string, string | null> = {
      Email: '  bob@example.com  ',
      Phone: '   ',
    };
    const mapping = { email: 'Email', phone: 'Phone' };

    const result = applyColumnMapping(rawRow, headers, mapping);

    expect(result.email).toBe('bob@example.com');
    expect(result.phone).toBeNull();
  });

  it('handles null raw values', () => {
    const rawRow: Record<string, string | null> = {
      Email: null,
    };
    const mapping = { email: 'Email' };

    const result = applyColumnMapping(rawRow, headers, mapping);

    expect(result.email).toBeNull();
  });

  it('returns empty object when no mappings match', () => {
    const rawRow: Record<string, string | null> = {
      Email: 'test@test.com',
    };
    const mapping = { external_id: 'NonExistent' };

    const result = applyColumnMapping(rawRow, headers, mapping);

    expect(result).toEqual({});
  });
});
