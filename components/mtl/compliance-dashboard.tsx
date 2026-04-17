/**
 * MTL Compliance Dashboard Component
 *
 * Main dashboard for AML/CTR compliance tracking.
 * Shows Gaming Day Summary with click-to-modal patron view.
 *
 * Layout:
 * - Header with date selector and stats
 * - Main: Gaming Day Summary table (COMPLIANCE AUTHORITY)
 * - Modal: MTL Entry View (read-only) for selected patron (click row to open)
 *
 * Financial-type MTL entries (buy_in, cash_out) are derived from
 * player_financial_transaction via the forward bridge. They cannot
 * be created directly from this dashboard.
 *
 * @see PRD-MTL-VIEW-MODAL-KILL-REVERSE-BRIDGE
 * @see PRD-005 MTL Service
 * @see ADR-025 MTL Authorization Model
 */

'use client';

import { format, subDays, addDays, parseISO } from 'date-fns';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Shield,
} from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';

import { AdjustmentModal } from '@/components/modals/rating-slip/adjustment-modal';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useGamingDay } from '@/hooks/casino/use-gaming-day';
import { useGamingDaySummary } from '@/hooks/mtl/use-gaming-day-summary';
import { useCreateFinancialAdjustment } from '@/hooks/player-financial/use-financial-mutations';
import { cn } from '@/lib/utils';
import type { MtlEntryDTO, MtlGamingDaySummaryDTO } from '@/services/mtl/dtos';

import { GamingDaySummary } from './gaming-day-summary';
import { MtlEntryViewModal } from './mtl-entry-view-modal';

export interface ComplianceDashboardProps {
  /** Casino ID */
  casinoId: string;
  /** Staff ID for audit note attribution */
  staffId?: string;
  /** Can add audit notes (pit_boss/admin) */
  canAddNotes?: boolean;
  className?: string;
}

/**
 * Compliance Dashboard
 *
 * @example
 * <ComplianceDashboard
 *   casinoId={casinoId}
 *   staffId={staffId}
 *   canAddNotes
 * />
 */
export function ComplianceDashboard({
  casinoId,
  staffId,
  canAddNotes = false,
  className,
}: ComplianceDashboardProps) {
  // Canonical current gaming day per TEMP-002 — DB-derived from casino TZ + cutoff.
  const { data: gamingDayData } = useGamingDay();
  const currentGamingDay = gamingDayData?.gaming_day ?? null;

  // Operator-scrubbed view date, seeded from the canonical current day on first resolve.
  const [gamingDay, setGamingDay] = useState<string | null>(null);

  useEffect(() => {
    if (gamingDay === null && currentGamingDay !== null) {
      setGamingDay(currentGamingDay);
    }
  }, [gamingDay, currentGamingDay]);

  // Selected patron state - track patron info for view modal
  const [selectedPatron, setSelectedPatron] = useState<{
    uuid: string;
    name: string;
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
  } | null>(null);

  // View modal state
  const [viewModalOpen, setViewModalOpen] = useState(false);

  // Adjustment modal state
  const [adjustmentTarget, setAdjustmentTarget] = useState<MtlEntryDTO | null>(
    null,
  );
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);

  // Adjustment mutation
  const createAdjustment = useCreateFinancialAdjustment();

  // Fetch summary data for stats (query is gated on gamingDay being non-null
  // via the hook's `enabled` guard: both casinoId and gamingDay must be set).
  const { data: summaryData } = useGamingDaySummary({
    casinoId,
    gamingDay: gamingDay ?? '',
  });

  // Calculate stats from summary data
  const stats = useMemo(() => {
    const items = summaryData?.items ?? [];
    // MTL threshold met = row exists (any transaction >= $3k)
    const mtlThresholdMetCount = items.length;
    // CTR threshold met = aggregate > $10k (federal requirement)
    const ctrInCount = items.filter(
      (s) => s.agg_badge_in === 'agg_ctr_met',
    ).length;
    const ctrOutCount = items.filter(
      (s) => s.agg_badge_out === 'agg_ctr_met',
    ).length;
    const totalPatrons = items.length;
    const totalVolume = items.reduce((sum, s) => sum + s.total_volume, 0);

    return {
      mtlThresholdMetCount,
      ctrInCount,
      ctrOutCount,
      totalCtr: ctrInCount + ctrOutCount,
      totalPatrons,
      totalVolume,
    };
  }, [summaryData]);

  // Navigation handlers (safe no-op until canonical gaming day has resolved —
  // the date navigation UI isn't rendered until then).
  const goToPreviousDay = () => {
    setGamingDay((d) =>
      d ? format(subDays(parseISO(d), 1), 'yyyy-MM-dd') : d,
    );
    setSelectedPatron(null);
  };

  const goToNextDay = () => {
    setGamingDay((d) =>
      d ? format(addDays(parseISO(d), 1), 'yyyy-MM-dd') : d,
    );
    setSelectedPatron(null);
  };

  const goToToday = () => {
    if (currentGamingDay === null) return;
    setGamingDay(currentGamingDay);
    setSelectedPatron(null);
  };

  // Patron click handler - opens view modal with patron info
  const handlePatronClick = (summary: MtlGamingDaySummaryDTO) => {
    const patronName =
      summary.patron_first_name && summary.patron_last_name
        ? `${summary.patron_first_name} ${summary.patron_last_name}`
        : 'Unknown Player';
    setSelectedPatron({
      uuid: summary.patron_uuid,
      name: patronName,
      firstName: summary.patron_first_name ?? undefined,
      lastName: summary.patron_last_name ?? undefined,
      dateOfBirth: summary.patron_date_of_birth ?? undefined,
    });
    setViewModalOpen(true);
  };

  // Adjust button handler - opens adjustment modal for entries with visit_id
  const handleAdjust = (entry: MtlEntryDTO) => {
    if (!entry.visit_id) {
      // Can't adjust entries without visit context
      setAdjustmentError(
        'This entry cannot be adjusted because it has no associated visit. ' +
          'Adjustments must be made from the Rating Slip Modal.',
      );
      return;
    }
    setAdjustmentError(null);
    setAdjustmentTarget(entry);
  };

  // Adjustment submission handler
  const handleAdjustmentSubmit = async (data: {
    deltaAmount: number;
    reasonCode:
      | 'data_entry_error'
      | 'wrong_amount'
      | 'duplicate'
      | 'wrong_player'
      | 'system_bug'
      | 'other';
    note: string;
  }) => {
    if (!adjustmentTarget?.visit_id || !selectedPatron) return;

    try {
      await createAdjustment.mutateAsync({
        casino_id: casinoId,
        player_id: selectedPatron.uuid,
        visit_id: adjustmentTarget.visit_id,
        delta_amount: data.deltaAmount * 100, // Convert to cents
        reason_code: data.reasonCode,
        note: data.note,
      });
      setAdjustmentTarget(null);
      setAdjustmentError(null);
    } catch (err) {
      setAdjustmentError(
        err instanceof Error ? err.message : 'Failed to create adjustment',
      );
    }
  };

  const isToday = gamingDay !== null && gamingDay === currentGamingDay;

  // Suspense-style gate: wait for the canonical gaming day before rendering
  // nav / summary. Prevents operator clicks against a null selector and
  // eliminates a browser-local-TZ flash default.
  if (gamingDay === null) {
    return (
      <div
        className={cn(
          'flex flex-1 items-center justify-center py-12',
          className,
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-1 flex-col', className)}>
      {/* Header — matches SettingsContentSection exemplar */}
      <div className="flex-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="h-6 w-6 text-accent" />
            <h3
              className="text-xl font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              MTL Tracking
            </h3>
          </div>

          {/* Date Navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={goToPreviousDay}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <div className="flex items-center gap-1.5 rounded-md border-2 border-border/50 bg-background px-2.5 py-1">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span
                className="text-xs font-bold tabular-nums"
                style={{ fontFamily: 'monospace' }}
              >
                {gamingDay}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={goToNextDay}
              disabled={isToday}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            {!isToday && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs font-semibold uppercase tracking-wider"
                onClick={goToToday}
              >
                Today
              </Button>
            )}
          </div>
        </div>
        <p className="mt-1 pl-[34px] text-base text-muted-foreground">
          AML/CTR Transaction Monitoring (31 CFR § 1021.311)
        </p>
      </div>
      <Separator className="my-4 flex-none" />

      <div className="w-full max-w-4xl space-y-4 overflow-y-auto pe-4 pb-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            title="MTL Thresholds Met"
            value={stats.mtlThresholdMetCount}
            description={
              stats.totalCtr > 0
                ? `${stats.totalCtr} CTR trigger${stats.totalCtr !== 1 ? 's' : ''}`
                : 'No CTR triggers'
            }
            variant={stats.totalCtr > 0 ? 'danger' : 'default'}
          />
          <StatCard
            title="Patrons Tracked"
            value={stats.totalPatrons}
            description="With transactions today"
          />
          <StatCard
            title="Total Volume"
            value={`$${(stats.totalVolume / 100 / 1000).toFixed(0)}K`}
            description="Combined in/out (dollars)"
          />
          <StatCard
            title="Gaming Day"
            value={format(parseISO(gamingDay), 'EEE')}
            description={format(parseISO(gamingDay), 'MMM d, yyyy')}
          />
        </div>

        {/* Main Content - Gaming Day Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Gaming Day Summary</CardTitle>
            <CardDescription>
              COMPLIANCE AUTHORITY - Per-patron daily aggregates (click row to
              view transactions)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GamingDaySummary
              casinoId={casinoId}
              gamingDay={gamingDay}
              onPatronClick={
                staffId && canAddNotes ? handlePatronClick : undefined
              }
            />
          </CardContent>
        </Card>

        {/* MTL Entry View Modal (read-only) */}
        {selectedPatron && (
          <MtlEntryViewModal
            isOpen={viewModalOpen}
            onClose={() => {
              setViewModalOpen(false);
              setSelectedPatron(null);
            }}
            patron={{
              id: selectedPatron.uuid,
              firstName: selectedPatron.firstName,
              lastName: selectedPatron.lastName,
              dateOfBirth: selectedPatron.dateOfBirth,
            }}
            casinoId={casinoId}
            gamingDay={gamingDay}
            onAdjust={canAddNotes ? handleAdjust : undefined}
          />
        )}

        {/* Adjustment Modal */}
        <AdjustmentModal
          isOpen={adjustmentTarget !== null}
          onClose={() => {
            setAdjustmentTarget(null);
            setAdjustmentError(null);
          }}
          onSubmit={handleAdjustmentSubmit}
          currentTotal={
            adjustmentTarget?.amount ? adjustmentTarget.amount / 100 : 0
          }
          isPending={createAdjustment.isPending}
          error={adjustmentError}
        />
      </div>
    </div>
  );
}

/**
 * Stats card component
 */
function StatCard({
  title,
  value,
  description,
  variant = 'default',
}: {
  title: string;
  value: string | number;
  description: string;
  variant?: 'default' | 'danger';
}) {
  return (
    <Card
      className={cn(
        variant === 'danger' &&
          Number(value) > 0 &&
          'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20',
      )}
    >
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle
          className={cn(
            'text-2xl font-mono',
            variant === 'danger' &&
              Number(value) > 0 &&
              'text-red-600 dark:text-red-400',
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
