'use client';

/**
 * RundownSummaryPanel (ADR-027)
 *
 * Displays computed win/loss summary from RPC-based rundown.
 * Shows all formula components with correct sign semantics.
 *
 * Formula: win = closing + credits + drop - opening - fills
 *
 * IMPORTANT: table_win_cents is NULL when drop is not posted.
 * Dashboard shows "Count Pending" vs "Count Posted" based on drop_posted_at.
 *
 * @see ADR-027 Table Bank Mode (Visibility Slice, MVP)
 * @see services/table-context/rundown.ts
 */

import {
  TrendingDown,
  TrendingUp,
  Minus,
  Loader2,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import * as React from 'react';

import { FinancialValue } from '@/components/financial';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTableRundown } from '@/hooks/table-context/use-table-rundown';
import { formatCents } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TableBankMode } from '@/services/table-context/dtos';
import { TABLE_BANK_MODE_LABELS } from '@/services/table-context/labels';

// === Types ===

interface RundownSummaryPanelProps {
  /** Table session UUID - required to fetch rundown */
  sessionId: string;
  /** Optional table bank mode for display badge */
  tableBankMode?: TableBankMode | null;
  /** Optional className for container styling */
  className?: string;
}

interface MetricRowProps {
  label: string;
  value: number | null;
  isLoading?: boolean;
  prefix?: string;
  highlight?: boolean;
  variant?: 'positive' | 'negative' | 'neutral';
  muted?: boolean;
  valueNode?: React.ReactNode;
}

// === Helper Functions ===

// === Sub-Components ===

function MetricRow({
  label,
  value,
  isLoading = false,
  prefix = '',
  highlight = false,
  variant = 'neutral',
  muted = false,
  valueNode,
}: MetricRowProps) {
  const Icon =
    variant === 'positive'
      ? TrendingUp
      : variant === 'negative'
        ? TrendingDown
        : Minus;
  const colorClass =
    variant === 'positive'
      ? 'text-emerald-500'
      : variant === 'negative'
        ? 'text-red-500'
        : 'text-muted-foreground';

  return (
    <div
      className={cn(
        'flex items-center justify-between py-1.5',
        highlight && 'border-t pt-3 mt-2 font-semibold',
      )}
    >
      <span
        className={cn(
          'text-sm',
          highlight && 'font-medium',
          muted && 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : valueNode !== undefined ? (
        <div className={cn('flex items-center gap-1', highlight && colorClass)}>
          {highlight && variant !== 'neutral' && <Icon className="h-4 w-4" />}
          {valueNode}
        </div>
      ) : value !== null ? (
        <div className={cn('flex items-center gap-1', highlight && colorClass)}>
          {highlight && variant !== 'neutral' && <Icon className="h-4 w-4" />}
          <span
            className={cn(
              'font-mono',
              highlight && 'text-lg',
              muted && 'text-muted-foreground',
            )}
          >
            {prefix}
            {formatCents(value)}
          </span>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}

// === Main Component ===

/**
 * RundownSummaryPanel
 *
 * Displays computed win/loss summary from RPC-based rundown.
 * Uses the regulatory identity formula for table win calculation.
 */
export function RundownSummaryPanel({
  sessionId,
  tableBankMode,
  className,
}: RundownSummaryPanelProps) {
  const { data: rundown, isLoading, error } = useTableRundown(sessionId);

  // Determine win/loss variant
  const winLossVariant: 'positive' | 'negative' | 'neutral' =
    React.useMemo(() => {
      if (!rundown || rundown.table_win_cents === null) return 'neutral';
      if (rundown.table_win_cents > 0) return 'positive';
      if (rundown.table_win_cents < 0) return 'negative';
      return 'neutral';
    }, [rundown]);

  // Loading state
  if (isLoading) {
    return (
      <Card className={cn('animate-pulse', className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Session Rundown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  // Error state - render nothing
  if (error || !rundown) {
    return null;
  }

  // Compute drop posted status
  const isDropPosted = rundown.drop_posted_at !== null;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Session Rundown</CardTitle>
        <div className="flex gap-2">
          {tableBankMode && (
            <Badge variant="outline" className="text-xs">
              {TABLE_BANK_MODE_LABELS[tableBankMode]}
            </Badge>
          )}
          <Badge
            variant={isDropPosted ? 'default' : 'secondary'}
            className={cn('text-xs gap-1', !isDropPosted && 'text-amber-600')}
          >
            {isDropPosted ? (
              <>
                <CheckCircle2 className="h-3 w-3" />
                Count Posted
              </>
            ) : (
              <>
                <Clock className="h-3 w-3" />
                Count Pending
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="space-y-0">
          {/* Opening Bankroll */}
          <MetricRow
            label="Opening"
            value={rundown.opening_total_cents}
            valueNode={
              <FinancialValue
                variant="compact"
                label="Opening"
                value={{
                  value: rundown.opening_total_cents ?? 0,
                  type: 'actual',
                  source: 'table_rundown',
                  completeness: {
                    status:
                      rundown.opening_total_cents == null
                        ? 'unknown'
                        : 'complete',
                  },
                }}
              />
            }
          />

          {/* Fills (subtractive — shown as negative, reduces win) */}
          <MetricRow
            label="Fills"
            value={
              rundown.fills_total_cents > 0 ? -rundown.fills_total_cents : null
            }
            muted={rundown.fills_total_cents === 0}
            valueNode={
              rundown.fills_total_cents > 0 ? (
                <FinancialValue
                  variant="compact"
                  label="Fills"
                  value={{
                    value: -rundown.fills_total_cents,
                    type: 'actual',
                    source: 'table_rundown',
                    completeness: { status: 'complete' },
                  }}
                />
              ) : undefined
            }
          />

          {/* Closing Bankroll */}
          <MetricRow
            label="Closing"
            value={rundown.closing_total_cents}
            valueNode={
              <FinancialValue
                variant="compact"
                label="Closing"
                value={{
                  value: rundown.closing_total_cents ?? 0,
                  type: 'actual',
                  source: 'table_rundown',
                  completeness: {
                    status:
                      rundown.closing_total_cents == null
                        ? 'unknown'
                        : 'complete',
                  },
                }}
              />
            }
          />

          {/* Credits (additive — increases win) */}
          <MetricRow
            label="Credits"
            value={
              rundown.credits_total_cents > 0
                ? rundown.credits_total_cents
                : null
            }
            muted={rundown.credits_total_cents === 0}
            valueNode={
              rundown.credits_total_cents > 0 ? (
                <FinancialValue
                  variant="compact"
                  label="Credits"
                  value={{
                    value: rundown.credits_total_cents,
                    type: 'actual',
                    source: 'table_rundown',
                    completeness: { status: 'complete' },
                  }}
                />
              ) : undefined
            }
          />

          {/* Drop */}
          <MetricRow
            label="Drop"
            value={rundown.drop_total_cents}
            muted={!isDropPosted}
            valueNode={
              <FinancialValue
                variant="compact"
                label="Drop"
                value={{
                  value: rundown.drop_total_cents ?? 0,
                  type: 'actual',
                  source: 'table_rundown',
                  completeness: {
                    status:
                      rundown.drop_total_cents == null ? 'unknown' : 'complete',
                  },
                }}
              />
            }
          />

          {/* Table Win/Loss - highlighted, Pattern B (derived from formula components) */}
          <MetricRow
            label={
              winLossVariant === 'positive'
                ? 'Table Win'
                : winLossVariant === 'negative'
                  ? 'Table Loss'
                  : 'Win/Loss'
            }
            value={rundown.table_win_cents}
            highlight
            variant={winLossVariant}
            valueNode={
              <FinancialValue
                variant="compact"
                label="Table Win/Loss"
                derivedFrom={[
                  'opening_total_cents',
                  'fills_total_cents',
                  'credits_total_cents',
                  'drop_total_cents',
                ]}
                value={{
                  value: rundown.table_win_cents ?? 0,
                  type: 'actual',
                  source: 'table_rundown',
                  completeness: {
                    status:
                      rundown.table_win_cents === null ? 'unknown' : 'complete',
                  },
                }}
              />
            }
          />

          {/* Variance from Par (if configured and par is set) */}
          {rundown.need_total_cents !== null && (
            <div className="pt-2 border-t mt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Par Target</span>
                <span className="font-mono text-muted-foreground">
                  {formatCents(rundown.need_total_cents)}
                </span>
              </div>
              {rundown.closing_total_cents !== null &&
                rundown.need_total_cents !== null && (
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-muted-foreground">
                      Variance from Par
                    </span>
                    <span
                      className={cn(
                        'font-mono',
                        rundown.closing_total_cents !==
                          rundown.need_total_cents && 'text-amber-600',
                      )}
                    >
                      {rundown.closing_total_cents >= rundown.need_total_cents
                        ? '+'
                        : ''}
                      {formatCents(
                        rundown.closing_total_cents - rundown.need_total_cents,
                      )}
                    </span>
                  </div>
                )}
            </div>
          )}
        </dl>

        {/* Formula reference */}
        <p className="mt-4 text-xs text-muted-foreground text-center">
          Win = Closing + Credits + Drop − Opening − Fills
        </p>
      </CardContent>
    </Card>
  );
}
