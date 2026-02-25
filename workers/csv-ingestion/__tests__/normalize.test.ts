/** @jest-environment node */

/**
 * Row Normalization Tests
 *
 * Tests the normalizeRow function which builds structured ImportPlayerV1
 * payloads from raw CSV rows using column mappings.
 *
 * @see workers/csv-ingestion/src/normalize.ts
 */

import { normalizeRow, normalizeHeaders } from '../src/normalize';

// ---------------------------------------------------------------------------
// normalizeRow — basic mapping
// ---------------------------------------------------------------------------
describe('normalizeRow', () => {
  const headers = ['Email', 'Phone', 'First Name', 'Last Name', 'DOB'];
  const columnMapping = {
    email: 'Email',
    phone: 'Phone',
    first_name: 'First Name',
    last_name: 'Last Name',
    dob: 'DOB',
  };

  it('builds ImportPlayerV1 payload with all fields mapped', () => {
    const rawRow: Record<string, string | null> = {
      Email: 'alice@example.com',
      Phone: '555-0101',
      'First Name': 'Alice',
      'Last Name': 'Johnson',
      DOB: '1985-03-15',
    };

    const result = normalizeRow(rawRow, headers, columnMapping, 1);

    expect(result.row_number).toBe(1);
    expect(result.raw_row).toBe(rawRow);
    expect(result.normalized_payload.contract_version).toBe('v1');
    expect(result.normalized_payload.identifiers.email).toBe(
      'alice@example.com',
    );
    expect(result.normalized_payload.identifiers.phone).toBe('555-0101');
    expect(result.normalized_payload.profile.first_name).toBe('Alice');
    expect(result.normalized_payload.profile.last_name).toBe('Johnson');
    expect(result.normalized_payload.profile.dob).toBe('1985-03-15');
  });

  it('sets row_ref.row_number in payload', () => {
    const rawRow: Record<string, string | null> = {
      Email: 'bob@example.com',
      Phone: '555-0102',
      'First Name': 'Bob',
      'Last Name': 'Smith',
      DOB: null,
    };

    const result = normalizeRow(rawRow, headers, columnMapping, 42);

    expect(result.normalized_payload.row_ref.row_number).toBe(42);
  });

  it('includes source metadata when provided', () => {
    const rawRow: Record<string, string | null> = {
      Email: 'test@test.com',
      Phone: null,
      'First Name': 'Test',
      'Last Name': 'User',
      DOB: null,
    };

    const result = normalizeRow(rawRow, headers, columnMapping, 1, {
      vendor: 'test-vendor',
      file_name: 'players.csv',
    });

    expect(result.normalized_payload.source.vendor).toBe('test-vendor');
    expect(result.normalized_payload.source.file_name).toBe('players.csv');
  });

  it('uses empty source when no metadata provided', () => {
    const rawRow: Record<string, string | null> = {
      Email: 'test@test.com',
      Phone: null,
      'First Name': 'Test',
      'Last Name': 'User',
      DOB: null,
    };

    const result = normalizeRow(rawRow, headers, columnMapping, 1);

    expect(result.normalized_payload.source).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// normalizeRow — missing and empty fields
// ---------------------------------------------------------------------------
describe('normalizeRow — missing and empty fields', () => {
  const headers = ['Email', 'Phone', 'First Name', 'Last Name'];
  const columnMapping = {
    email: 'Email',
    phone: 'Phone',
    first_name: 'First Name',
    last_name: 'Last Name',
  };

  it('omits identifier fields when null in raw row', () => {
    const rawRow: Record<string, string | null> = {
      Email: null,
      Phone: null,
      'First Name': 'Alice',
      'Last Name': 'Johnson',
    };

    const result = normalizeRow(rawRow, headers, columnMapping, 1);

    // null values should not produce undefined; they should be omitted from identifiers
    expect(result.normalized_payload.identifiers.email).toBeUndefined();
    expect(result.normalized_payload.identifiers.phone).toBeUndefined();
  });

  it('trims and normalizes field values', () => {
    const rawRow: Record<string, string | null> = {
      Email: '  alice@example.com  ',
      Phone: '  555-0101  ',
      'First Name': '  Alice  ',
      'Last Name': '  Johnson  ',
    };

    const result = normalizeRow(rawRow, headers, columnMapping, 1);

    expect(result.normalized_payload.identifiers.email).toBe(
      'alice@example.com',
    );
    expect(result.normalized_payload.identifiers.phone).toBe('555-0101');
    expect(result.normalized_payload.profile.first_name).toBe('Alice');
    expect(result.normalized_payload.profile.last_name).toBe('Johnson');
  });

  it('omits fields not present in column mapping', () => {
    const partialMapping = {
      email: 'Email',
      first_name: 'First Name',
      last_name: 'Last Name',
    };
    const rawRow: Record<string, string | null> = {
      Email: 'test@test.com',
      Phone: '555-0101', // not in mapping
      'First Name': 'Test',
      'Last Name': 'User',
    };

    const result = normalizeRow(rawRow, headers, partialMapping, 1);

    expect(result.normalized_payload.identifiers.email).toBe('test@test.com');
    expect(result.normalized_payload.identifiers.phone).toBeUndefined();
  });

  it('handles empty string values as omitted (normalized to null → omitted)', () => {
    const rawRow: Record<string, string | null> = {
      Email: '',
      Phone: '   ',
      'First Name': '',
      'Last Name': '',
    };

    const result = normalizeRow(rawRow, headers, columnMapping, 1);

    expect(result.normalized_payload.identifiers.email).toBeUndefined();
    expect(result.normalized_payload.identifiers.phone).toBeUndefined();
    expect(result.normalized_payload.profile.first_name).toBeUndefined();
    expect(result.normalized_payload.profile.last_name).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// normalizeRow — notes field
// ---------------------------------------------------------------------------
describe('normalizeRow — notes field', () => {
  it('includes notes when mapped and present', () => {
    const headers = ['Email', 'First Name', 'Last Name', 'Notes'];
    const mapping = {
      email: 'Email',
      first_name: 'First Name',
      last_name: 'Last Name',
      notes: 'Notes',
    };
    const rawRow: Record<string, string | null> = {
      Email: 'test@test.com',
      'First Name': 'Test',
      'Last Name': 'User',
      Notes: 'VIP player',
    };

    const result = normalizeRow(rawRow, headers, mapping, 1);

    expect(result.normalized_payload.notes).toBe('VIP player');
  });

  it('omits notes when not in mapping', () => {
    const headers = ['Email', 'First Name', 'Last Name'];
    const mapping = {
      email: 'Email',
      first_name: 'First Name',
      last_name: 'Last Name',
    };
    const rawRow: Record<string, string | null> = {
      Email: 'test@test.com',
      'First Name': 'Test',
      'Last Name': 'User',
    };

    const result = normalizeRow(rawRow, headers, mapping, 1);

    expect(result.normalized_payload.notes).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// normalizeRow — external_id field
// ---------------------------------------------------------------------------
describe('normalizeRow — external_id field', () => {
  it('includes external_id when mapped', () => {
    const headers = ['Email', 'First Name', 'Last Name', 'Player ID'];
    const mapping = {
      email: 'Email',
      first_name: 'First Name',
      last_name: 'Last Name',
      external_id: 'Player ID',
    };
    const rawRow: Record<string, string | null> = {
      Email: 'test@test.com',
      'First Name': 'Test',
      'Last Name': 'User',
      'Player ID': 'PLR-00123',
    };

    const result = normalizeRow(rawRow, headers, mapping, 1);

    expect(result.normalized_payload.identifiers.external_id).toBe('PLR-00123');
  });
});

// ---------------------------------------------------------------------------
// normalizeRow — dob nullable handling
// ---------------------------------------------------------------------------
describe('normalizeRow — dob nullable handling', () => {
  const headers = ['Email', 'First Name', 'Last Name', 'DOB'];
  const mapping = {
    email: 'Email',
    first_name: 'First Name',
    last_name: 'Last Name',
    dob: 'DOB',
  };

  it('sets dob to string when present', () => {
    const rawRow: Record<string, string | null> = {
      Email: 'test@test.com',
      'First Name': 'Test',
      'Last Name': 'User',
      DOB: '1990-01-15',
    };

    const result = normalizeRow(rawRow, headers, mapping, 1);
    expect(result.normalized_payload.profile.dob).toBe('1990-01-15');
  });

  it('sets dob to null when column exists but value is null', () => {
    const rawRow: Record<string, string | null> = {
      Email: 'test@test.com',
      'First Name': 'Test',
      'Last Name': 'User',
      DOB: null,
    };

    const result = normalizeRow(rawRow, headers, mapping, 1);
    expect(result.normalized_payload.profile.dob).toBeNull();
  });

  it('sets dob to null when column exists but value is empty', () => {
    const rawRow: Record<string, string | null> = {
      Email: 'test@test.com',
      'First Name': 'Test',
      'Last Name': 'User',
      DOB: '',
    };

    const result = normalizeRow(rawRow, headers, mapping, 1);
    expect(result.normalized_payload.profile.dob).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeHeaders re-export
// ---------------------------------------------------------------------------
describe('normalizeHeaders re-export', () => {
  it('re-exports normalizeHeaders from vendor module', () => {
    expect(typeof normalizeHeaders).toBe('function');
    // Verify it works the same as the canonical implementation
    expect(normalizeHeaders(['email', 'phone'])).toEqual(['email', 'phone']);
  });
});
