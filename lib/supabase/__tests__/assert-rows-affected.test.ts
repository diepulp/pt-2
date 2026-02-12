import { RlsWriteDeniedError } from '@/lib/errors/rls-write-denied-error';
import { assertRowsAffected } from '@/lib/supabase/assert-rows-affected';

describe('assertRowsAffected', () => {
  const options = { table: 'staff', operation: 'insert' as const };

  it('throws RlsWriteDeniedError when data is null', () => {
    expect(() =>
      assertRowsAffected({ data: null, error: null }, options),
    ).toThrow(RlsWriteDeniedError);
  });

  it('throws RlsWriteDeniedError when data is empty array', () => {
    expect(() =>
      assertRowsAffected({ data: [], error: null }, options),
    ).toThrow(RlsWriteDeniedError);
  });

  it('returns array when data has items', () => {
    const items = [{ id: '1' }, { id: '2' }];
    const result = assertRowsAffected({ data: items, error: null }, options);
    expect(result).toEqual(items);
  });

  it('wraps single object in array', () => {
    const item = { id: '1' };
    const result = assertRowsAffected({ data: item, error: null }, options);
    expect(result).toEqual([item]);
  });

  it('error includes table name and operation', () => {
    try {
      assertRowsAffected({ data: null, error: null }, {
        table: 'player_casino',
        operation: 'upsert',
        context: 'enrollPlayer',
      });
      fail('Expected RlsWriteDeniedError');
    } catch (err) {
      expect(err).toBeInstanceOf(RlsWriteDeniedError);
      const rlsErr = err as RlsWriteDeniedError;
      expect(rlsErr.code).toBe('RLS_WRITE_DENIED');
      expect(rlsErr.message).toContain('upsert');
      expect(rlsErr.message).toContain('player_casino');
      expect(rlsErr.httpStatus).toBe(403);
      expect(rlsErr.details).toEqual({
        table: 'player_casino',
        operation: 'upsert',
        context: 'enrollPlayer',
      });
    }
  });

  it('rethrows original error when result.error is set', () => {
    const originalError = new Error('connection timeout');
    expect(() =>
      assertRowsAffected(
        { data: [{ id: '1' }], error: originalError },
        options,
      ),
    ).toThrow(originalError);
  });
});
