/** @jest-environment node */

/**
 * Row Validation Tests
 *
 * Tests the validateRow function against ImportPlayerV1 contract rules:
 * - At least one of email or phone required
 * - first_name required (max 100 chars)
 * - last_name required (max 100 chars)
 * - email format validation
 * - phone length 7–20
 * - dob YYYY-MM-DD format
 *
 * @see workers/csv-ingestion/src/validate.ts
 * @see services/player-import/schemas.ts (importPlayerV1Schema)
 */

import { validateRow } from '../src/validate';
import type { NormalizedRow, ImportPlayerV1Payload } from '../src/normalize';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(
  overrides: Partial<ImportPlayerV1Payload> = {},
  rowNumber = 1,
): NormalizedRow {
  const defaults: ImportPlayerV1Payload = {
    contract_version: 'v1',
    source: {},
    row_ref: { row_number: rowNumber },
    identifiers: {
      email: 'alice@example.com',
      phone: '555-0101',
    },
    profile: {
      first_name: 'Alice',
      last_name: 'Johnson',
    },
  };

  // When an override provides identifiers or profile, use it as-is
  // (replacing the default entirely) so tests can omit fields.
  const merged: ImportPlayerV1Payload = {
    ...defaults,
    ...overrides,
    identifiers:
      overrides.identifiers !== undefined
        ? overrides.identifiers
        : defaults.identifiers,
    profile:
      overrides.profile !== undefined ? overrides.profile : defaults.profile,
  };

  return {
    row_number: rowNumber,
    raw_row: { email: 'alice@example.com' },
    normalized_payload: merged,
  };
}

// ---------------------------------------------------------------------------
// Valid rows
// ---------------------------------------------------------------------------
describe('validateRow — valid inputs', () => {
  it('accepts a row with email and phone', () => {
    const result = validateRow(makeRow());
    expect(result.valid).toBe(true);
    expect(result.status).toBe('staged');
    expect(result.reason_code).toBeNull();
    expect(result.reason_detail).toBeNull();
  });

  it('accepts a row with email only (no phone)', () => {
    const result = validateRow(
      makeRow({ identifiers: { email: 'bob@example.com' } }),
    );
    expect(result.valid).toBe(true);
    expect(result.status).toBe('staged');
  });

  it('accepts a row with phone only (no email)', () => {
    const result = validateRow(makeRow({ identifiers: { phone: '555-0102' } }));
    expect(result.valid).toBe(true);
    expect(result.status).toBe('staged');
  });

  it('accepts a row with optional dob in YYYY-MM-DD format', () => {
    const result = validateRow(
      makeRow({
        profile: {
          first_name: 'Alice',
          last_name: 'Johnson',
          dob: '1985-03-15',
        },
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('accepts a row with null dob', () => {
    const result = validateRow(
      makeRow({
        profile: { first_name: 'Alice', last_name: 'Johnson', dob: null },
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('accepts a row with undefined dob', () => {
    const result = validateRow(makeRow());
    expect(result.valid).toBe(true);
  });

  it('preserves row_number in result', () => {
    const result = validateRow(makeRow({}, 42));
    expect(result.row_number).toBe(42);
  });

  it('preserves raw_row and normalized_payload in result', () => {
    const row = makeRow();
    const result = validateRow(row);
    expect(result.raw_row).toBe(row.raw_row);
    expect(result.normalized_payload).toBe(row.normalized_payload);
  });
});

// ---------------------------------------------------------------------------
// Missing required fields
// ---------------------------------------------------------------------------
describe('validateRow — missing required fields', () => {
  it('rejects row missing first_name', () => {
    const result = validateRow(makeRow({ profile: { last_name: 'Johnson' } }));
    expect(result.valid).toBe(false);
    expect(result.status).toBe('error');
    expect(result.reason_code).toBe('VALIDATION_FAILED');
    expect(result.reason_detail).toContain('missing first_name');
  });

  it('rejects row with empty first_name', () => {
    const result = validateRow(
      makeRow({ profile: { first_name: '', last_name: 'Johnson' } }),
    );
    expect(result.valid).toBe(false);
    expect(result.reason_detail).toContain('missing first_name');
  });

  it('rejects row with whitespace-only first_name', () => {
    const result = validateRow(
      makeRow({ profile: { first_name: '   ', last_name: 'Johnson' } }),
    );
    expect(result.valid).toBe(false);
    expect(result.reason_detail).toContain('missing first_name');
  });

  it('rejects row missing last_name', () => {
    const result = validateRow(makeRow({ profile: { first_name: 'Alice' } }));
    expect(result.valid).toBe(false);
    expect(result.reason_detail).toContain('missing last_name');
  });

  it('rejects row with empty last_name', () => {
    const result = validateRow(
      makeRow({ profile: { first_name: 'Alice', last_name: '' } }),
    );
    expect(result.valid).toBe(false);
    expect(result.reason_detail).toContain('missing last_name');
  });

  it('rejects row with neither email nor phone', () => {
    const result = validateRow(makeRow({ identifiers: {} }));
    expect(result.valid).toBe(false);
    expect(result.reason_detail).toContain(
      'at least one of email or phone is required',
    );
  });

  it('rejects row with empty email and empty phone', () => {
    const result = validateRow(
      makeRow({ identifiers: { email: '', phone: '' } }),
    );
    expect(result.valid).toBe(false);
    expect(result.reason_detail).toContain(
      'at least one of email or phone is required',
    );
  });
});

// ---------------------------------------------------------------------------
// Field length limits
// ---------------------------------------------------------------------------
describe('validateRow — field length limits', () => {
  it('rejects first_name exceeding 100 characters', () => {
    const result = validateRow(
      makeRow({
        profile: { first_name: 'A'.repeat(101), last_name: 'Johnson' },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.reason_detail).toContain('first_name exceeds 100 characters');
  });

  it('accepts first_name at exactly 100 characters', () => {
    const result = validateRow(
      makeRow({
        profile: { first_name: 'A'.repeat(100), last_name: 'Johnson' },
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects last_name exceeding 100 characters', () => {
    const result = validateRow(
      makeRow({
        profile: { first_name: 'Alice', last_name: 'J'.repeat(101) },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.reason_detail).toContain('last_name exceeds 100 characters');
  });

  it('accepts last_name at exactly 100 characters', () => {
    const result = validateRow(
      makeRow({
        profile: { first_name: 'Alice', last_name: 'J'.repeat(100) },
      }),
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Email format validation
// ---------------------------------------------------------------------------
describe('validateRow — email format', () => {
  it('rejects invalid email format', () => {
    const result = validateRow(
      makeRow({ identifiers: { email: 'not-an-email' } }),
    );
    expect(result.valid).toBe(false);
    expect(result.reason_detail).toContain('invalid email format');
  });

  it('rejects email without domain', () => {
    const result = validateRow(makeRow({ identifiers: { email: 'alice@' } }));
    expect(result.valid).toBe(false);
    expect(result.reason_detail).toContain('invalid email format');
  });

  it('rejects email without TLD', () => {
    const result = validateRow(
      makeRow({ identifiers: { email: 'alice@example' } }),
    );
    expect(result.valid).toBe(false);
    expect(result.reason_detail).toContain('invalid email format');
  });

  it('accepts valid email formats', () => {
    const validEmails = [
      'alice@example.com',
      'bob.smith@company.co.uk',
      'user+tag@gmail.com',
    ];
    for (const email of validEmails) {
      const result = validateRow(makeRow({ identifiers: { email } }));
      expect(result.valid).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Phone length validation
// ---------------------------------------------------------------------------
describe('validateRow — phone length', () => {
  it('rejects phone shorter than 7 characters', () => {
    const result = validateRow(makeRow({ identifiers: { phone: '12345' } }));
    expect(result.valid).toBe(false);
    expect(result.reason_detail).toContain('phone must be 7–20 characters');
  });

  it('rejects phone longer than 20 characters', () => {
    const result = validateRow(
      makeRow({ identifiers: { phone: '1'.repeat(21) } }),
    );
    expect(result.valid).toBe(false);
    expect(result.reason_detail).toContain('phone must be 7–20 characters');
  });

  it('accepts phone at exactly 7 characters', () => {
    const result = validateRow(makeRow({ identifiers: { phone: '1234567' } }));
    expect(result.valid).toBe(true);
  });

  it('accepts phone at exactly 20 characters', () => {
    const result = validateRow(
      makeRow({ identifiers: { phone: '1'.repeat(20) } }),
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DOB format validation
// ---------------------------------------------------------------------------
describe('validateRow — dob format', () => {
  it('rejects dob not in YYYY-MM-DD format', () => {
    const invalidDates = ['03/15/1985', '1985/03/15', '15-03-1985', 'March 15'];
    for (const dob of invalidDates) {
      const result = validateRow(
        makeRow({
          profile: { first_name: 'Alice', last_name: 'Johnson', dob },
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.reason_detail).toContain('dob must be YYYY-MM-DD format');
    }
  });

  it('accepts valid YYYY-MM-DD dates', () => {
    const result = validateRow(
      makeRow({
        profile: {
          first_name: 'Alice',
          last_name: 'Johnson',
          dob: '1985-03-15',
        },
      }),
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multiple errors
// ---------------------------------------------------------------------------
describe('validateRow — multiple errors joined', () => {
  it('collects multiple errors into reason_detail', () => {
    const result = validateRow(
      makeRow({
        identifiers: {},
        profile: {},
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.reason_code).toBe('VALIDATION_FAILED');
    // Should contain multiple error messages joined by "; "
    const errors = result.reason_detail!.split('; ');
    expect(errors.length).toBeGreaterThanOrEqual(3);
    expect(result.reason_detail).toContain('missing first_name');
    expect(result.reason_detail).toContain('missing last_name');
    expect(result.reason_detail).toContain(
      'at least one of email or phone is required',
    );
  });
});
