/**
 * Shift Summary Report Page
 *
 * RSC page that calls the assembly service directly (no fetch()).
 * Two states:
 * - No params: shows selection UI (date/shift picker)
 * - Params present: fetches report server-side and renders it
 *
 * Casino context is derived from staff table lookup (same pattern
 * as admin layout role guard).
 *
 * @see EXEC-065 WS2
 */

import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ShiftReportShell } from '@/components/reports/shift-report/shift-report-shell';
import { getServerGamingDay } from '@/lib/gaming-day/server';
import { createClient } from '@/lib/supabase/server';
import { createShiftReportService } from '@/services/reporting/shift-report';
import type { ShiftReportParams } from '@/services/reporting/shift-report';

import ShiftSummaryLoading from './loading';

export const metadata: Metadata = {
  title: 'Shift Summary Report | PT-2',
  description: 'End-of-shift summary report for operational review',
};

export const dynamic = 'force-dynamic';

/**
 * Standard 8-hour shift model.
 * Offsets are hours from gaming_day_start_time.
 * day=0h, swing=8h, grave=16h (matching PT-2 casino 3-shift convention).
 */
const SHIFT_OFFSETS_HOURS: Record<
  string,
  { startOffset: number; endOffset: number }
> = {
  day: { startOffset: 0, endOffset: 8 },
  swing: { startOffset: 8, endOffset: 16 },
  grave: { startOffset: 16, endOffset: 24 },
};

/**
 * Compute shift start/end ISO timestamps from gaming day + shift boundary.
 */
function computeShiftWindow(
  gamingDay: string,
  shiftBoundary: string,
  gamingDayStartTime: string,
): { startTs: string; endTs: string } {
  const offsets = SHIFT_OFFSETS_HOURS[shiftBoundary];
  if (!offsets) {
    return { startTs: '', endTs: '' };
  }

  const [startHour, startMinute] = gamingDayStartTime.split(':').map(Number);
  const anchor = new Date(
    `${gamingDay}T${String(startHour).padStart(2, '0')}:${String(startMinute ?? 0).padStart(2, '0')}:00`,
  );

  const startDate = new Date(anchor.getTime() + offsets.startOffset * 3600_000);
  const endDate = new Date(anchor.getTime() + offsets.endOffset * 3600_000);

  return {
    startTs: startDate.toISOString(),
    endTs: endDate.toISOString(),
  };
}

type ShiftBoundary = 'swing' | 'day' | 'grave';
const VALID_BOUNDARIES = new Set<string>(['swing', 'day', 'grave']);

export default async function ShiftSummaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // ── Derive casino context ───────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Admin layout already guards this, but be defensive
    return (
      <ShiftReportShell
        report={null}
        currentGamingDay={null}
        error="Not authenticated"
      />
    );
  }

  const { data: staff } = await supabase
    .from('staff')
    .select('id, casino_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  if (!staff) {
    return (
      <ShiftReportShell
        report={null}
        currentGamingDay={null}
        error="Staff record not found"
      />
    );
  }

  // Get casino name and settings
  const [casinoResult, settingsResult] = await Promise.all([
    supabase.from('casino').select('name').eq('id', staff.casino_id).single(),
    supabase
      .from('casino_settings')
      .select('gaming_day_start_time, timezone')
      .eq('casino_id', staff.casino_id)
      .single(),
  ]);

  const casinoName = casinoResult.data?.name ?? 'Casino';
  const gamingDayStart = settingsResult.data?.gaming_day_start_time ?? '06:00';

  // Get current gaming day for default selection
  let currentGamingDay: string | null = null;
  try {
    currentGamingDay = await getServerGamingDay(supabase);
  } catch {
    // Non-critical — just means default date won't be pre-filled
  }

  // ── Extract URL params ──────────────────────────────────────────────────
  const rawGamingDay =
    typeof params.gaming_day === 'string' ? params.gaming_day : null;
  const rawShiftBoundary =
    typeof params.shift_boundary === 'string' ? params.shift_boundary : null;

  // Validate params
  const hasValidParams =
    rawGamingDay &&
    /^\d{4}-\d{2}-\d{2}$/.test(rawGamingDay) &&
    rawShiftBoundary &&
    VALID_BOUNDARIES.has(rawShiftBoundary);

  if (!hasValidParams) {
    // Selection mode — no report to show yet
    return (
      <Suspense fallback={<ShiftSummaryLoading />}>
        <ShiftReportShell
          report={null}
          currentGamingDay={currentGamingDay}
          error={null}
        />
      </Suspense>
    );
  }

  // ── Assemble report ─────────────────────────────────────────────────────
  const shiftBoundary = rawShiftBoundary as ShiftBoundary;
  const { startTs, endTs } = computeShiftWindow(
    rawGamingDay,
    shiftBoundary,
    gamingDayStart,
  );

  if (!startTs || !endTs) {
    return (
      <Suspense fallback={<ShiftSummaryLoading />}>
        <ShiftReportShell
          report={null}
          currentGamingDay={currentGamingDay}
          error={`Invalid shift window computation for ${rawGamingDay} / ${shiftBoundary}`}
        />
      </Suspense>
    );
  }

  try {
    const reportParams: ShiftReportParams = {
      casinoId: staff.casino_id,
      casinoName,
      startTs,
      endTs,
      gamingDay: rawGamingDay,
      shiftBoundary,
    };

    const service = createShiftReportService(supabase);
    const report = await service.assembleShiftReport(reportParams);

    return (
      <Suspense fallback={<ShiftSummaryLoading />}>
        <ShiftReportShell
          report={report}
          currentGamingDay={currentGamingDay}
          error={null}
        />
      </Suspense>
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to assemble report';
    return (
      <Suspense fallback={<ShiftSummaryLoading />}>
        <ShiftReportShell
          report={null}
          currentGamingDay={currentGamingDay}
          error={message}
        />
      </Suspense>
    );
  }
}
