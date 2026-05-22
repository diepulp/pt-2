/**
 * ShiftReportService React Query Key Factory
 *
 * @see EXEC-065 WS1
 */

import { serializeKeyFilters } from '@/services/shared/key-utils';

export type ShiftReportFilters = {
  casinoId?: string;
  gamingDay?: string;
  shiftBoundary?: 'swing' | 'day' | 'grave';
};

const ROOT = ['shift-report'] as const;
const serialize = (filters: ShiftReportFilters = {}) =>
  serializeKeyFilters(filters);

export const shiftReportKeys = {
  root: ROOT,
  report: Object.assign(
    (filters: ShiftReportFilters = {}) =>
      [...ROOT, 'report', serialize(filters)] as const,
    { scope: [...ROOT, 'report'] as const },
  ),
  pdf: (filters: ShiftReportFilters = {}) =>
    [...ROOT, 'pdf', serialize(filters)] as const,
};
