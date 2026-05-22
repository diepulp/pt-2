/**
 * Unit tests for lib/errors/normalize-client-error.ts
 *
 * Verifies that:
 * - PostgREST error shapes are correctly classified into safe messages.
 * - Raw provider message content NEVER leaks into the returned Error.
 * - Non-PostgREST inputs (plain Error, null, string) receive the generic message.
 *
 * @see PRD-081 WS1 — Client-Side Error Handling Standardization
 */

import {
  isPostgrestErrorShape,
  normalizeClientError,
} from '../errors/normalize-client-error';

// ---------------------------------------------------------------------------
// Mock logError — we do not want dev console noise during tests, and we need
// to confirm it is called but do not test its internals here.
// ---------------------------------------------------------------------------
jest.mock('../errors/error-utils', () => ({
  ...jest.requireActual('../errors/error-utils'),
  logError: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePostgrestError(
  code: string,
  message = 'raw provider message',
): {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
} {
  return { code, message, details: null, hint: null };
}

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const ACCESS_DENIED_MESSAGE = 'You do not have access to this resource.';
const PERMISSION_MESSAGE = 'You do not have permission to perform this action.';
const UNAVAILABLE_MESSAGE =
  'The service is temporarily unavailable. Please try again.';

// ---------------------------------------------------------------------------
// isPostgrestErrorShape
// ---------------------------------------------------------------------------

describe('isPostgrestErrorShape', () => {
  it('returns true for a valid PostgREST error object', () => {
    expect(isPostgrestErrorShape(makePostgrestError('23505'))).toBe(true);
  });

  it('returns true when details and hint are non-null strings', () => {
    expect(
      isPostgrestErrorShape({
        code: '42P01',
        message: 'relation not found',
        details: 'some detail',
        hint: 'some hint',
      }),
    ).toBe(true);
  });

  it('returns false for null', () => {
    expect(isPostgrestErrorShape(null)).toBe(false);
  });

  it('returns false for a plain Error', () => {
    expect(isPostgrestErrorShape(new Error('oops'))).toBe(false);
  });

  it('returns false when code is missing', () => {
    expect(
      isPostgrestErrorShape({ message: 'x', details: null, hint: null }),
    ).toBe(false);
  });

  it('returns false when message is missing', () => {
    expect(
      isPostgrestErrorShape({ code: '500', details: null, hint: null }),
    ).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isPostgrestErrorShape('error string')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeClientError — PostgREST classification
// ---------------------------------------------------------------------------

describe('normalizeClientError — PostgREST errors', () => {
  describe.each([
    ['PGRST301', ACCESS_DENIED_MESSAGE],
    ['40001', ACCESS_DENIED_MESSAGE],
    ['40P01', ACCESS_DENIED_MESSAGE],
    ['42000', ACCESS_DENIED_MESSAGE],
    ['42501', PERMISSION_MESSAGE],
    ['23505', UNAVAILABLE_MESSAGE],
    ['53300', UNAVAILABLE_MESSAGE],
    ['P0001', UNAVAILABLE_MESSAGE],
  ])('code %s', (code, expectedMessage) => {
    it(`maps to "${expectedMessage}"`, () => {
      const result = normalizeClientError(makePostgrestError(code));
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe(expectedMessage);
    });

    it('does NOT include the raw provider message', () => {
      const raw = makePostgrestError(code, 'INTERNAL: secret db details');
      const result = normalizeClientError(raw);
      expect(result.message).not.toContain('INTERNAL');
      expect(result.message).not.toContain('secret db details');
    });
  });

  it('returns access-denied for code starting with "4" (generic 4xx)', () => {
    const result = normalizeClientError(makePostgrestError('4XYZ'));
    expect(result.message).toBe(ACCESS_DENIED_MESSAGE);
  });
});

// ---------------------------------------------------------------------------
// normalizeClientError — non-PostgREST inputs
// ---------------------------------------------------------------------------

describe('normalizeClientError — non-PostgREST inputs', () => {
  it('plain Error → generic message, NOT the original message', () => {
    const original = new Error('actual internal error detail');
    const result = normalizeClientError(original);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe(GENERIC_MESSAGE);
    expect(result.message).not.toContain('actual internal error detail');
  });

  it('null → generic message', () => {
    const result = normalizeClientError(null);
    expect(result.message).toBe(GENERIC_MESSAGE);
  });

  it('undefined → generic message', () => {
    const result = normalizeClientError(undefined);
    expect(result.message).toBe(GENERIC_MESSAGE);
  });

  it('string → generic message, NOT the string content', () => {
    const result = normalizeClientError('raw error string from provider');
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe(GENERIC_MESSAGE);
    expect(result.message).not.toContain('raw error string from provider');
  });

  it('arbitrary object without PostgREST shape → generic message', () => {
    const result = normalizeClientError({ status: 500, body: 'fail' });
    expect(result.message).toBe(GENERIC_MESSAGE);
  });

  it('never throws for any input', () => {
    // Ensures the function itself is safe to call unconditionally.
    expect(() => normalizeClientError(null)).not.toThrow();
    expect(() => normalizeClientError(undefined)).not.toThrow();
    expect(() => normalizeClientError(new Error('x'))).not.toThrow();
    expect(() =>
      normalizeClientError(makePostgrestError('42501')),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Raw provider message isolation — exhaustive cross-check
// ---------------------------------------------------------------------------

describe('raw provider message isolation', () => {
  const RAW_SENTINEL = 'SENSITIVE_PROVIDER_DETAIL_XYZ';

  const cases: Array<[string, unknown]> = [
    ['PostgREST access error', makePostgrestError('PGRST301', RAW_SENTINEL)],
    ['PostgREST 4xx error', makePostgrestError('40001', RAW_SENTINEL)],
    ['PostgREST 42501 error', makePostgrestError('42501', RAW_SENTINEL)],
    ['PostgREST generic error', makePostgrestError('23505', RAW_SENTINEL)],
    ['plain Error', new Error(RAW_SENTINEL)],
    ['string', RAW_SENTINEL],
  ];

  test.each(cases)('%s — sentinel never appears in result', (_label, input) => {
    const result = normalizeClientError(input);
    expect(result.message).not.toContain(RAW_SENTINEL);
  });
});
