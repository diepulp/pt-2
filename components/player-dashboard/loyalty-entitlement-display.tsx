'use client';

/**
 * Loyalty Entitlement Display — ADR-044 D7 hybrid surface.
 *
 * Separates portfolio awareness from actionable local balance.
 * - portfolio_total: "Portfolio total (all properties)" — awareness ONLY
 * - redeemable_here: "Available here" — the only actionable number
 * - properties: collapsible per-property breakdown
 *
 * @see PRD-051 §4 / ADR-044 D7
 */

import { ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import type { LoyaltyEntitlementDTO } from '@/services/recognition';

interface LoyaltyEntitlementDisplayProps {
  entitlement: LoyaltyEntitlementDTO;
  activeLocally: boolean;
}

export function LoyaltyEntitlementDisplay({
  entitlement,
  activeLocally,
}: LoyaltyEntitlementDisplayProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const hasMultipleProperties = entitlement.properties.length > 1;

  return (
    <div className="space-y-2">
      {/* Actionable: Local balance */}
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">
          Available here
        </span>
        <span className="text-lg font-bold tabular-nums text-foreground">
          {entitlement.redeemableHere.toLocaleString()} pts
        </span>
      </div>

      {/* Local tier badge */}
      {activeLocally && entitlement.localTier && (
        <Badge
          variant="outline"
          className="text-[10px] uppercase tracking-wider border-amber-500/30 text-amber-400 bg-amber-500/10"
        >
          {entitlement.localTier}
        </Badge>
      )}

      {/* Awareness: Portfolio total (only show when multi-property) */}
      {hasMultipleProperties && (
        <div className="pt-1 border-t border-border/20">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">
              Portfolio total (all properties)
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {entitlement.portfolioTotal.toLocaleString()} pts
            </span>
          </div>

          {/* Collapsible property breakdown */}
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            {showBreakdown ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {entitlement.properties.length} properties
          </button>

          {showBreakdown && (
            <div className="mt-1 space-y-1 pl-4">
              {entitlement.properties.map((prop) => (
                <div
                  key={prop.casinoId}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-2.5 w-2.5" />
                    {prop.casinoName}
                    {prop.tier && (
                      <span className="text-amber-400/60">({prop.tier})</span>
                    )}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {prop.balance.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
