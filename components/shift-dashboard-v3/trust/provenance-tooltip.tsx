'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatPercentage } from '@/lib/format';
import type { ProvenanceMetadata } from '@/services/table-context/shift-metrics/provenance';

export interface ProvenanceTooltipProps {
  provenance: ProvenanceMetadata;
  children: React.ReactNode;
}

const SOURCE_LABELS: Record<ProvenanceMetadata['source'], string> = {
  inventory: 'Inventory (snapshots)',
  telemetry: 'Telemetry (buy-ins)',
  mixed: 'Mixed (inventory + telemetry)',
};

const QUALITY_LABELS: Record<ProvenanceMetadata['quality'], string> = {
  GOOD_COVERAGE: 'Good coverage',
  LOW_COVERAGE: 'Low coverage',
  NONE: 'No telemetry',
};

const NULL_REASON_LABELS: Record<string, string> = {
  missing_opening: 'Missing opening snapshot',
  missing_closing: 'Missing closing snapshot',
  misaligned: 'Snapshot misaligned with shift window',
  partial_coverage: 'Partial telemetry coverage',
};

/**
 * Provenance tooltip — shows trust metadata on hover.
 *
 * Wraps any child element with a tooltip showing:
 * - Data source (inventory / telemetry / mixed)
 * - Telemetry quality
 * - Coverage ratio
 * - Null reasons (if any)
 *
 * @see TRUST_LAYER_RULES.md §6
 * @see SHIFT_METRICS_UX_CONTRACT_v1.md §6
 */
export function ProvenanceTooltip({
  provenance,
  children,
}: ProvenanceTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-xs p-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Source
            </span>
            <span className="text-xs">{SOURCE_LABELS[provenance.source]}</span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Quality
            </span>
            <span className="text-xs">
              {QUALITY_LABELS[provenance.quality]}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Coverage
            </span>
            <span className="text-xs font-mono tabular-nums">
              {formatPercentage(provenance.coverage_ratio * 100)}
            </span>
          </div>

          {provenance.null_reasons.length > 0 && (
            <div className="border-t border-border/40 pt-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Limitations
              </span>
              <ul className="mt-0.5 space-y-0.5">
                {provenance.null_reasons.map((reason) => (
                  <li
                    key={reason}
                    className="text-[10px] text-muted-foreground"
                  >
                    {NULL_REASON_LABELS[reason] ?? reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
