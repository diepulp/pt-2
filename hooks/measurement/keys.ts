/**
 * Measurement React Query Key Factory
 *
 * Query keys for measurement dashboard data fetching.
 * Uses .scope pattern for surgical cache invalidation.
 *
 * @see PRD-046 ADR-039 Measurement UI
 * @see EXEC-046 WS3 — React Query Integration
 */

import {
  serializeKeyFilters,
  type KeyFilter,
} from '@/services/shared/key-utils';

const ROOT = ['measurement'] as const;

const serializeFilters = (filters: object = {}): string =>
  serializeKeyFilters(filters as unknown as KeyFilter);

/**
 * Filter scope for measurement summary queries.
 */
export interface MeasurementScope {
  pitId?: string;
  tableId?: string;
}

export const measurementKeys = {
  /** Root key for all measurement queries */
  root: ROOT,

  /**
   * Measurement summary (all 4 metrics in single BFF call).
   * Includes .scope for surgical invalidation.
   */
  summary: Object.assign(
    (scope?: MeasurementScope) =>
      [...ROOT, 'summary', serializeFilters(scope ?? {})] as const,
    { scope: [...ROOT, 'summary'] as const },
  ),

  /**
   * Rating coverage per-table rows for coverage widget.
   * @see PRD-049 WS1 — Coverage Widget
   */
  coverage: (casinoId: string, gamingDay?: string) =>
    [...ROOT, 'coverage', casinoId, gamingDay ?? 'current'] as const,

  /**
   * Audit event correlation for a single rating slip.
   * @see PRD-049 WS2 — Audit Trace Panel
   */
  auditTrace: (slipId: string | null) =>
    [...ROOT, 'auditTrace', slipId ?? 'none'] as const,

  /**
   * Invalidate all measurement queries.
   */
  all: () => ROOT,
};
