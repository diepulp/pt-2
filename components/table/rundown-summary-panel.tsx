'use client';

/**
 * RundownSummaryPanel (PRD-090)
 *
 * Renders TableInventoryAccountingProjection via three canonical states:
 *   - telemetry_drop_formula → "Projected Win/Loss"
 *   - inventory_only         → "Partial Table Result"
 *   - integrity_failure      → integrity disclosure (no result label)
 *
 * Consumers render only — no re-derivation from raw inputs (SRL-TIA-001 law 5).
 *
 * @see services/table-context/table-inventory-accounting.ts
 * @see PRD-090 DEC-2 — rpc_compute_table_rundown quarantined
 * @see SRL-TIA-001 — canonical surface labels
 */

import { AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTableAccountingProjection } from '@/hooks/table-context/use-table-rundown';
import { cn } from '@/lib/utils';
import type { TableBankMode } from '@/services/table-context/dtos';
import { TABLE_BANK_MODE_LABELS } from '@/services/table-context/labels';

// === Types ===

interface RundownSummaryPanelProps {
  sessionId: string;
  tableBankMode?: TableBankMode | null;
  className?: string;
}

// === Sub-Components ===

interface ResultRowProps {
  label: string;
  valueCents: string | null;
  qualifier: string;
}

type ResultSign = 'positive' | 'negative' | 'neutral';

/**
 * Parse a canonical cent value (string from the projection DTO) into a bigint.
 *
 * NFR-1: the canonical `*_cents` values are 64-bit-safe strings. They MUST NOT be
 * round-tripped through Number() — values beyond 2^53 (up to the signed-64-bit
 * sentinel 9223372036854775807) would silently lose precision. Returns null for
 * absent or non-numeric input.
 */
function parseCentsBigInt(valueCents: string | null): bigint | null {
  if (valueCents == null) return null;
  try {
    return BigInt(valueCents);
  } catch {
    return null;
  }
}

function centsSign(value: bigint | null): ResultSign {
  if (value == null) return 'neutral';
  const zero = BigInt(0);
  if (value > zero) return 'positive';
  if (value < zero) return 'negative';
  return 'neutral';
}

/**
 * Whole-dollar currency display, bigint-safe. Mirrors `formatDollars`
 * (USD, $ prefix, comma thousands groups, 0 fraction digits, round-half-up
 * magnitude) but derives every digit from the bigint — no lossy Number().
 */
function formatWholeDollarsFromCents(value: bigint | null): string {
  if (value == null) return '—';
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  const hundred = BigInt(100);
  const remainder = abs % hundred;
  let dollars = abs / hundred;
  if (remainder >= BigInt(50)) dollars += BigInt(1); // round half away from zero (matches Intl)
  const grouped = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${grouped}`;
}

function ResultRow({ label, valueCents, qualifier }: ResultRowProps) {
  const value = parseCentsBigInt(valueCents);
  const variant: ResultSign = centsSign(value);

  const Icon =
    variant === 'positive'
      ? TrendingUp
      : variant === 'negative'
        ? TrendingDown
        : null;
  const colorClass =
    variant === 'positive'
      ? 'text-emerald-500'
      : variant === 'negative'
        ? 'text-red-500'
        : 'text-foreground';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between border-t pt-3 mt-2">
        <span
          className="text-sm font-bold uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          {label}
        </span>
        <div
          className={cn('flex items-center gap-1 font-semibold', colorClass)}
        >
          {Icon && <Icon className="h-4 w-4" />}
          <span className="font-mono text-lg tabular-nums">
            {formatWholeDollarsFromCents(value)}
          </span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{qualifier}</p>
    </div>
  );
}

// === Main Component ===

export function RundownSummaryPanel({
  sessionId,
  tableBankMode,
  className,
}: RundownSummaryPanelProps) {
  const {
    data: projection,
    isLoading,
    error,
  } = useTableAccountingProjection(sessionId);

  if (isLoading) {
    return (
      <Card
        className={cn('border-2 border-border/50 animate-pulse', className)}
      >
        <CardHeader className="pb-2">
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Session Rundown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (error || !projection) {
    return null;
  }

  return (
    <Card className={cn('border-2 border-border/50', className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle
          className="text-sm font-bold uppercase tracking-widest"
          style={{ fontFamily: 'monospace' }}
        >
          Session Rundown
        </CardTitle>
        {tableBankMode && (
          <Badge variant="outline" className="text-xs">
            {TABLE_BANK_MODE_LABELS[tableBankMode]}
          </Badge>
        )}
      </CardHeader>

      <CardContent>
        {projection.calculation_kind === 'telemetry_drop_formula' && (
          <ResultRow
            label="Projected Win/Loss"
            valueCents={projection.projected_table_win_loss_cents}
            qualifier="Includes telemetry-derived drop estimate. Non-custody. Not final."
          />
        )}

        {projection.calculation_kind === 'inventory_only' && (
          <ResultRow
            label="Partial Table Result"
            valueCents={projection.partial_table_result_cents}
            qualifier="Telemetry-derived drop estimate not available for this session."
          />
        )}

        {projection.calculation_kind === 'integrity_failure' && (
          <div className="border-t pt-3 mt-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">
                Table result unavailable —{' '}
                {projection.integrity_issues.join(' | ')}. Contact your
                supervisor.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
