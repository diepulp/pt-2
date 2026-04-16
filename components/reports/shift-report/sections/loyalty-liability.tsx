/**
 * Loyalty Liability Section
 *
 * Outstanding points, enrolled players, dollar liability.
 *
 * LoyaltyLiabilityDto fields:
 *   totalOutstandingPoints, estimatedMonetaryValueCents, centsPerPoint,
 *   playerCount, snapshotDate
 *
 * @see EXEC-065 WS2
 */

import type { LoyaltyLiabilitySection } from '@/services/reporting/shift-report';

import { formatCents, formatNumber } from '../format';

interface LoyaltyLiabilityProps {
  data: LoyaltyLiabilitySection;
}

export function LoyaltyLiability({ data }: LoyaltyLiabilityProps) {
  const liability = data.loyaltyLiability;

  if (!liability) {
    return (
      <section className="mb-8">
        <h3
          className="text-sm font-bold uppercase tracking-widest mb-4 border-b border-border pb-2"
          style={{ fontFamily: 'monospace' }}
        >
          7. Loyalty Liability
        </h3>
        <p className="text-sm text-muted-foreground italic">
          Loyalty liability data unavailable.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <h3
        className="text-sm font-bold uppercase tracking-widest mb-4 border-b border-border pb-2"
        style={{ fontFamily: 'monospace' }}
      >
        7. Loyalty Liability
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border-2 border-border bg-card p-3">
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            Enrolled Players
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums">
            {formatNumber(liability.playerCount)}
          </div>
        </div>
        <div className="border-2 border-border bg-card p-3">
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            Outstanding Points
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums">
            {formatNumber(liability.totalOutstandingPoints)}
          </div>
        </div>
        <div className="border-2 border-border bg-card p-3">
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            Estimated Liability
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums">
            {formatCents(liability.estimatedMonetaryValueCents)}
          </div>
        </div>
        <div className="border-2 border-border bg-card p-3">
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            Rate
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums">
            {liability.centsPerPoint != null
              ? `${(liability.centsPerPoint / 100).toFixed(4)}/pt`
              : '--'}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
            Snapshot: {liability.snapshotDate}
          </div>
        </div>
      </div>
    </section>
  );
}
