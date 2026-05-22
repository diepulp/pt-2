// FinancialValue component — Phase 1.3 frozen contract
// ─────────────────────────────────────────────────────
// Props:
//   value: FinancialValue           — from types/financial.ts; value.value is integer cents
//   label: string                   — caller-supplied display label
//   variant?: 'inline' | 'stacked' | 'compact'
//   derivedFrom?: readonly string[] — required when display declares a Derived summary
//   className?: string
//
// Allowed combinations (Phase 1.4 lint will enforce):
//   1. Single authority — value.type drives badge
//   2. Unknown completeness — renders "Not computed" or "Unknown"; never $0
//   3. Pattern B (Derived) — derivedFrom required; D5 degraded authority visible; contributing fields listed
//
// Disallowed:
//   - compliance + derivedFrom containing operational authority labels
//   - Derived display without visible degraded authority label
//   - tooltip-only or truncated authority/source
//   - formatDollars(value.value) — use formatCents
//   - CSS overflow-hidden/ellipsis on authority badge or source label
//
// DEF-NEVER: hold_percent, average_bet, min_bet, max_bet, loyalty points,
//            policy thresholds are NEVER passed as FinancialValue

import { cn } from '@/lib/utils';
import type {
  FinancialValue as FinancialValueType,
  FinancialAuthority,
} from '@/types/financial';

// Formats integer cents with 2 decimal places for precise display.
// Does NOT call formatDollars — avoids the cents/dollars confusion ADR-031 guards against.
const CENTS_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatValueCents(cents: number): string {
  return CENTS_FORMATTER.format(cents / 100);
}

export interface FinancialValueProps {
  value: FinancialValueType;
  label: string;
  variant?: 'inline' | 'stacked' | 'compact';
  derivedFrom?: readonly string[];
  className?: string;
}

// D5 authority hierarchy: Actual > Observed > Estimated
// Compliance is isolated and never appears in D5 degradation.

const AUTHORITY_LABEL: Record<FinancialAuthority, string> = {
  actual: 'Actual',
  observed: 'Observed',
  estimated: 'Estimated',
  compliance: 'Compliance',
};

const AUTHORITY_COLORS: Record<FinancialAuthority, string> = {
  actual:
    'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400',
  observed:
    'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400',
  estimated:
    'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400',
  compliance:
    'bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-400',
};

/**
 * Guard: compliance authority must never be mixed with operational authorities via derivedFrom.
 * This is a hard rule — render an error indicator if violated.
 */
function hasComplianceMixViolation(
  type: FinancialAuthority,
  derivedFrom?: readonly string[],
): boolean {
  if (type !== 'compliance' || !derivedFrom || derivedFrom.length === 0)
    return false;
  // Check if any derivedFrom entry is an operational authority label (case-insensitive)
  const operationalLabels = new Set(['actual', 'observed', 'estimated']);
  return derivedFrom.some((f) => operationalLabels.has(f.toLowerCase()));
}

export function FinancialValue({
  value,
  label,
  variant = 'stacked',
  derivedFrom,
  className,
}: FinancialValueProps) {
  const isUnknown = value.completeness.status === 'unknown';
  const isDerived = derivedFrom !== undefined && derivedFrom.length > 0;
  const violatesComplianceMix = hasComplianceMixViolation(
    value.type,
    derivedFrom,
  );

  // Hard compliance isolation guard
  if (violatesComplianceMix) {
    return (
      <div
        className={cn(
          'rounded border border-destructive/50 bg-destructive/5 px-2 py-1',
          className,
        )}
        role="alert"
        aria-label="Financial value compliance violation"
      >
        <span
          className="text-xs font-bold uppercase tracking-widest text-destructive"
          style={{ fontFamily: 'monospace' }}
        >
          Compliance Mix Violation
        </span>
      </div>
    );
  }

  // Degraded authority label: trust value.type as the D5 result (set at service layer)
  const authorityLabel = AUTHORITY_LABEL[value.type];
  const authorityColor = AUTHORITY_COLORS[value.type];

  // Formatted value: unknown completeness never renders $0
  const formattedValue = isUnknown ? null : formatValueCents(value.value);

  if (variant === 'inline') {
    return (
      <span
        className={cn(
          'inline-flex items-baseline gap-1.5 flex-wrap',
          className,
        )}
        data-testid="financial-value"
      >
        <span
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          {label}
        </span>
        <span
          className="font-mono tabular-nums font-semibold text-foreground"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {isUnknown ? (
            <span className="text-muted-foreground italic">Not computed</span>
          ) : (
            formattedValue
          )}
        </span>
        <span
          className={cn(
            'rounded border px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            authorityColor,
          )}
          style={{ fontFamily: 'monospace' }}
          data-authority={value.type}
        >
          {isDerived ? `Derived / ${authorityLabel}` : authorityLabel}
        </span>
        <span
          className="text-[10px] text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
          data-source={value.source}
        >
          {value.source}
        </span>
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        className={cn('flex items-center gap-1.5 flex-wrap min-w-0', className)}
        data-testid="financial-value"
      >
        <span
          className="font-mono tabular-nums font-semibold text-sm text-foreground"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {isUnknown ? (
            <span className="text-muted-foreground italic text-xs">
              Not computed
            </span>
          ) : (
            formattedValue
          )}
        </span>
        <span
          className={cn(
            'rounded border px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0',
            authorityColor,
          )}
          style={{ fontFamily: 'monospace' }}
          data-authority={value.type}
        >
          {isDerived ? `Derived / ${authorityLabel}` : authorityLabel}
        </span>
        <span
          className="text-[10px] text-muted-foreground shrink-0"
          style={{ fontFamily: 'monospace' }}
          data-source={value.source}
        >
          {value.source}
        </span>
      </div>
    );
  }

  // Default: stacked variant
  return (
    <div
      className={cn('flex flex-col gap-1', className)}
      data-testid="financial-value"
    >
      {/* Label row */}
      <div
        className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
        style={{ fontFamily: 'monospace' }}
      >
        {label}
      </div>

      {/* Value row */}
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className="font-mono tabular-nums font-bold text-lg text-foreground"
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontFamily: 'monospace',
          }}
        >
          {isUnknown ? (
            <span className="text-muted-foreground italic text-sm font-normal">
              Not computed
            </span>
          ) : (
            formattedValue
          )}
        </span>
      </div>

      {/* Metadata row: authority + source — never truncated */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={cn(
            'rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            authorityColor,
          )}
          style={{ fontFamily: 'monospace' }}
          data-authority={value.type}
        >
          {isDerived ? `Derived / ${authorityLabel}` : authorityLabel}
        </span>
        <span
          className="text-[10px] text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
          data-source={value.source}
        >
          {value.source}
        </span>
      </div>

      {/* Completeness row */}
      {value.completeness.status !== 'complete' && (
        <div className="flex items-center gap-1">
          <span
            className={cn(
              'text-[10px] font-medium',
              value.completeness.status === 'unknown'
                ? 'text-muted-foreground'
                : 'text-amber-600 dark:text-amber-400',
            )}
            style={{ fontFamily: 'monospace' }}
            data-completeness={value.completeness.status}
          >
            {value.completeness.status === 'unknown'
              ? 'Unknown completeness'
              : 'Partial'}
          </span>
          {value.completeness.coverage !== undefined && (
            <span className="text-[10px] text-muted-foreground">
              ({Math.round(value.completeness.coverage * 100)}%)
            </span>
          )}
        </div>
      )}

      {/* Derived contributing fields */}
      {isDerived && (
        <div
          className="text-[10px] text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
          data-derived-from={derivedFrom.join(',')}
        >
          From: {derivedFrom.join(', ')}
        </div>
      )}
    </div>
  );
}
