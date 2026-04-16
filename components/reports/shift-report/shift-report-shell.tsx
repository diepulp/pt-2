'use client';

/**
 * Shift Report Shell
 *
 * Two modes:
 * - Selection mode: Date picker (gaming day), shift selector, "Generate Report" button
 * - Report mode: Shows ReportActionToolbar + ShiftReportDocument
 *
 * State managed via URL params (useRouter, useSearchParams).
 * When user selects date+shift and clicks Generate, update URL params
 * which triggers server re-render.
 *
 * @see EXEC-065 WS2
 */

import { CalendarIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ShiftReportDTO } from '@/services/reporting/shift-report';

import { ReportActionToolbar } from './report-action-toolbar';
import { ShiftReportDocument } from './shift-report-document';

interface ShiftReportShellProps {
  /** Pre-fetched report data (null if no params provided) */
  report: ShiftReportDTO | null;
  /** Current gaming day for default selection */
  currentGamingDay: string | null;
  /** Error message if report assembly failed */
  error: string | null;
}

type ShiftBoundary = 'swing' | 'day' | 'grave';

export function ShiftReportShell({
  report,
  currentGamingDay,
  error,
}: ShiftReportShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read current selection from URL params or defaults
  const paramGamingDay = searchParams.get('gaming_day');
  const paramShift = searchParams.get('shift_boundary') as ShiftBoundary | null;

  const [gamingDay, setGamingDay] = useState<string>(
    paramGamingDay ?? currentGamingDay ?? '',
  );
  const [shiftBoundary, setShiftBoundary] = useState<ShiftBoundary>(
    paramShift ?? 'swing',
  );

  const handleGenerate = useCallback(() => {
    if (!gamingDay || !shiftBoundary) return;
    const params = new URLSearchParams({
      gaming_day: gamingDay,
      shift_boundary: shiftBoundary,
    });
    router.push(`/admin/reports/shift-summary?${params.toString()}`);
  }, [gamingDay, shiftBoundary, router]);

  const isReportMode = report != null;

  return (
    <div className="space-y-6">
      {/* Selection controls — always visible */}
      <div className="border-2 border-border bg-card p-4 print:hidden">
        <div
          className="text-sm font-bold uppercase tracking-widest mb-4"
          style={{ fontFamily: 'monospace' }}
        >
          Report Parameters
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[180px]">
            <Label
              htmlFor="gaming-day"
              className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
              style={{ fontFamily: 'monospace' }}
            >
              Gaming Day
            </Label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                id="gaming-day"
                type="date"
                value={gamingDay}
                onChange={(e) => setGamingDay(e.target.value)}
                className="pl-10 font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="w-[160px]">
            <Label
              htmlFor="shift-boundary"
              className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
              style={{ fontFamily: 'monospace' }}
            >
              Shift
            </Label>
            <Select
              value={shiftBoundary}
              onValueChange={(v) => setShiftBoundary(v as ShiftBoundary)}
            >
              <SelectTrigger id="shift-boundary" className="font-mono">
                <SelectValue placeholder="Select shift" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="swing">Swing</SelectItem>
                <SelectItem value="grave">Grave</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!gamingDay}
            className="text-xs font-semibold uppercase tracking-wider"
          >
            Generate Report
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="border-2 border-destructive/50 bg-destructive/5 rounded p-4">
          <div
            className="text-xs font-bold uppercase tracking-widest text-destructive mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            Report Error
          </div>
          <p className="text-sm text-destructive/80">{error}</p>
        </div>
      )}

      {/* Report mode */}
      {isReportMode && (
        <>
          <ReportActionToolbar report={report} />
          <ShiftReportDocument report={report} />
        </>
      )}

      {/* Empty state — no params yet */}
      {!isReportMode && !error && (
        <div className="border-2 border-dashed border-muted-foreground/20 rounded p-12 text-center">
          <div
            className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2"
            style={{ fontFamily: 'monospace' }}
          >
            No Report Generated
          </div>
          <p className="text-sm text-muted-foreground">
            Select a gaming day and shift boundary above, then click Generate
            Report.
          </p>
        </div>
      )}
    </div>
  );
}
