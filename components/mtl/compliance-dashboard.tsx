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

import { format, subDays, addDays } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { useState, useMemo } from 'react';

import { AdjustmentModal } from '@/components/modals/rating-slip/adjustment-modal';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  // Date state - default to today
  const [gamingDay, setGamingDay] = useState(() =>
    format(new Date(), 'yyyy-MM-dd'),
  );

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

  // Fetch summary data for stats
  const { data: summaryData } = useGamingDaySummary({
    casinoId,
    gamingDay,
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

  // Navigation handlers
  const goToPreviousDay = () => {
    setGamingDay((d) => format(subDays(new Date(d), 1), 'yyyy-MM-dd'));
    setSelectedPatron(null);
  };

  const goToNextDay = () => {
    setGamingDay((d) => format(addDays(new Date(d), 1), 'yyyy-MM-dd'));
    setSelectedPatron(null);
  };

  const goToToday = () => {
    setGamingDay(format(new Date(), 'yyyy-MM-dd'));
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

  const isToday = gamingDay === format(new Date(), 'yyyy-MM-dd');

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" />
            Compliance Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            AML/CTR Transaction Monitoring (31 CFR § 1021.311)
          </p>
        </div>

        {/* Date Navigation */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goToPreviousDay}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-background">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-sm">{gamingDay}</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={goToNextDay}
              disabled={isToday}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isToday && (
              <Button variant="outline" size="sm" onClick={goToToday}>
                Today
              </Button>
            )}
          </div>
        </div>
      </div>

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
          value={format(new Date(gamingDay), 'EEE')}
          description={format(new Date(gamingDay), 'MMM d, yyyy')}
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
