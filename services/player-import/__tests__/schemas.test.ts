/**
 * PlayerImportService Zod Schema Tests
 *
 * Tests all schema variants: importPlayerV1Schema, createBatchSchema,
 * stageRowsSchema, batchListQuerySchema, rowListQuerySchema.
 *
 * @see services/player-import/schemas.ts
 * @see PRD-037 CSV Player Import
 */

import {
  importPlayerV1Schema,
  createBatchSchema,
  stageRowsSchema,
  batchIdParamSchema,
  batchListQuerySchema,
  rowListQuerySchema,
} from '../schemas';

describe('importPlayerV1Schema', () => {
  const basePayload = {
    contract_version: 'v1' as const,
    row_ref: { row_number: 1 },
    identifiers: { email: 'test@example.com' },
  };

  describe('valid inputs', () => {
    it('accepts email only', () => {
      const result = importPlayerV1Schema.safeParse(basePayload);
      expect(result.success).toBe(true);
    });

    it('accepts phone only', () => {
      const result = importPlayerV1Schema.safeParse({
        ...basePayload,
        identifiers: { phone: '5551234567' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts both email and phone', () => {
      const result = importPlayerV1Schema.safeParse({
        ...basePayload,
        identifiers: { email: 'test@example.com', phone: '5551234567' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts full payload with all fields', () => {
      const result = importPlayerV1Schema.safeParse({
        contract_version: 'v1',
        source: { vendor: 'Konami', file_name: 'export.csv' },
        row_ref: { row_number: 42 },
        identifiers: {
          email: 'player@casino.com',
          phone: '5551234567',
          external_id: 'EXT-001',
        },
        profile: {
          first_name: 'John',
          last_name: 'Doe',
          dob: '1990-01-15',
        },
        notes: 'VIP player',
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional source defaulting to empty object', () => {
      const result = importPlayerV1Schema.safeParse(basePayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.source).toEqual({});
      }
    });

    it('accepts optional profile defaulting to empty object', () => {
      const result = importPlayerV1Schema.safeParse(basePayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.profile).toEqual({});
      }
    });

    it('accepts null dob', () => {
      const result = importPlayerV1Schema.safeParse({
        ...basePayload,
        profile: { first_name: 'Jane', dob: null },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('rejects missing both email and phone', () => {
      const result = importPlayerV1Schema.safeParse({
        ...basePayload,
        identifiers: {},
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty email and no phone', () => {
      const result = importPlayerV1Schema.safeParse({
        ...basePayload,
        identifiers: { email: '' },
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid email format', () => {
      const result = importPlayerV1Schema.safeParse({
        ...basePayload,
        identifiers: { email: 'not-an-email' },
      });
      expect(result.success).toBe(false);
    });

    it('rejects phone shorter than 7 characters', () => {
      const result = importPlayerV1Schema.safeParse({
        ...basePayload,
        identifiers: { phone: '123' },
      });
      expect(result.success).toBe(false);
    });

    it('rejects wrong contract_version', () => {
      const result = importPlayerV1Schema.safeParse({
        ...basePayload,
        contract_version: 'v2',
      });
      expect(result.success).toBe(false);
    });

    it('rejects row_number less than 1', () => {
      const result = importPlayerV1Schema.safeParse({
        ...basePayload,
        row_ref: { row_number: 0 },
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid dob format', () => {
      const result = importPlayerV1Schema.safeParse({
        ...basePayload,
        profile: { dob: '01/15/1990' },
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('createBatchSchema', () => {
  describe('valid inputs', () => {
    it('accepts valid input with all fields', () => {
      const result = createBatchSchema.safeParse({
        idempotency_key: 'batch-123',
        file_name: 'export.csv',
        vendor_label: 'Konami',
        column_mapping: { email: 'Email', phone: 'Phone' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts without optional vendor_label', () => {
      const result = createBatchSchema.safeParse({
        idempotency_key: 'batch-123',
        file_name: 'export.csv',
      });
      expect(result.success).toBe(true);
    });

    it('defaults column_mapping to empty object', () => {
      const result = createBatchSchema.safeParse({
        idempotency_key: 'batch-123',
        file_name: 'export.csv',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.column_mapping).toEqual({});
      }
    });
  });

  describe('invalid inputs', () => {
    it('rejects missing idempotency_key', () => {
      const result = createBatchSchema.safeParse({
        file_name: 'export.csv',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty idempotency_key', () => {
      const result = createBatchSchema.safeParse({
        idempotency_key: '',
        file_name: 'export.csv',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing file_name', () => {
      const result = createBatchSchema.safeParse({
        idempotency_key: 'batch-123',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('stageRowsSchema', () => {
  const validRow = {
    row_number: 1,
    raw_row: { email: 'test@example.com', name: 'Test' },
    normalized_payload: {
      contract_version: 'v1',
      row_ref: { row_number: 1 },
      identifiers: { email: 'test@example.com' },
    },
  };

  it('accepts valid single row', () => {
    const result = stageRowsSchema.safeParse({ rows: [validRow] });
    expect(result.success).toBe(true);
  });

  it('accepts multiple valid rows', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      ...validRow,
      row_number: i + 1,
      normalized_payload: {
        ...validRow.normalized_payload,
        row_ref: { row_number: i + 1 },
      },
    }));
    const result = stageRowsSchema.safeParse({ rows });
    expect(result.success).toBe(true);
  });

  it('rejects empty rows array', () => {
    const result = stageRowsSchema.safeParse({ rows: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 2000 rows', () => {
    const rows = Array.from({ length: 2001 }, (_, i) => ({
      ...validRow,
      row_number: i + 1,
      normalized_payload: {
        ...validRow.normalized_payload,
        row_ref: { row_number: i + 1 },
      },
    }));
    const result = stageRowsSchema.safeParse({ rows });
    expect(result.success).toBe(false);
  });
});

describe('batchIdParamSchema', () => {
  it('accepts valid UUID', () => {
    const result = batchIdParamSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID string', () => {
    const result = batchIdParamSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});

describe('batchListQuerySchema', () => {
  it('uses default limit of 20', () => {
    const result = batchListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  it('accepts valid status filter', () => {
    const result = batchListQuerySchema.safeParse({ status: 'staging' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = batchListQuerySchema.safeParse({ status: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('coerces string limit to number', () => {
    const result = batchListQuerySchema.safeParse({ limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });
});

describe('rowListQuerySchema', () => {
  it('uses default limit of 50', () => {
    const result = rowListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('accepts valid status filter', () => {
    const result = rowListQuerySchema.safeParse({ status: 'created' });
    expect(result.success).toBe(true);
  });

  it('accepts all row status values', () => {
    const statuses = [
      'staged',
      'created',
      'linked',
      'skipped',
      'conflict',
      'error',
    ];
    for (const status of statuses) {
      const result = rowListQuerySchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });
});
