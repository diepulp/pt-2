import { RlsWriteDeniedError } from '@/lib/errors/rls-write-denied-error';

interface AssertRowsAffectedOptions {
  table: string;
  operation: 'insert' | 'update' | 'upsert' | 'delete';
  context?: string;
}

/**
 * Validates that a Supabase write operation affected at least one row.
 * Returns the normalized data as T[] (never null, never empty).
 *
 * Callers MUST use `.select('id')` (or similar) on PostgREST writes
 * so `data` is a populated array when RLS allows the write.
 */
export function assertRowsAffected<T>(
  result: { data: T[] | T | null; error: unknown },
  options: AssertRowsAffectedOptions,
): T[] {
  if (result.error) throw result.error;
  const rows: T[] = Array.isArray(result.data)
    ? result.data
    : result.data != null
      ? [result.data]
      : [];
  if (rows.length === 0) {
    throw new RlsWriteDeniedError(
      options.table,
      options.operation,
      options.context,
    );
  }
  return rows;
}
