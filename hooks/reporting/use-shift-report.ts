/**
 * Shift Report Hook
 *
 * Lightweight hook for client-side shift report state management.
 * The page is RSC-driven so this primarily manages toolbar actions
 * and selection state for future client-side enhancements.
 *
 * @see EXEC-065 WS2
 */

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import type { ShiftReportDTO } from '@/services/reporting/shift-report';

type ShiftBoundary = 'swing' | 'day' | 'grave';

interface UseShiftReportParams {
  report: ShiftReportDTO | null;
}

interface UseShiftReportReturn {
  /** Current gaming day from URL params */
  gamingDay: string | null;
  /** Current shift boundary from URL params */
  shiftBoundary: ShiftBoundary | null;
  /** Whether a report is currently loaded */
  hasReport: boolean;
  /** Number of available sections (non-null) */
  availableSectionCount: number;
  /** Total number of sections */
  totalSectionCount: number;
  /** Whether report has assembly errors */
  hasErrors: boolean;
}

const SECTION_KEYS = [
  'executiveSummary',
  'financialSummary',
  'ratingCoverage',
  'complianceSummary',
  'anomalies',
  'baselineQuality',
  'loyaltyLiability',
] as const;

export function useShiftReport({
  report,
}: UseShiftReportParams): UseShiftReportReturn {
  const searchParams = useSearchParams();
  const gamingDay = searchParams.get('gaming_day');
  const shiftBoundary = searchParams.get(
    'shift_boundary',
  ) as ShiftBoundary | null;

  const { availableSectionCount, totalSectionCount, hasErrors } =
    useMemo(() => {
      if (!report) {
        return {
          availableSectionCount: 0,
          totalSectionCount: SECTION_KEYS.length,
          hasErrors: false,
        };
      }

      const available = SECTION_KEYS.filter((key) => {
        if (key === 'executiveSummary') return true; // always present
        return report.availability[key];
      }).length;

      return {
        availableSectionCount: available,
        totalSectionCount: SECTION_KEYS.length,
        hasErrors: report.errors.length > 0,
      };
    }, [report]);

  return {
    gamingDay,
    shiftBoundary,
    hasReport: report != null,
    availableSectionCount,
    totalSectionCount,
    hasErrors,
  };
}
