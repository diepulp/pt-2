/**
 * Baseline Quality Section
 *
 * Snapshot coverage, telemetry distribution, audit correlation.
 *
 * AuditCorrelationDto fields:
 *   totalSlips, slipsWithPft, slipsWithMtl, slipsWithLoyalty,
 *   fullChainCount, fullChainRate
 *
 * @see EXEC-065 WS2
 */

import type { BaselineQualitySection } from '@/services/reporting/shift-report';

import { formatNumber, formatPercent } from '../format';

interface BaselineQualityProps {
  data: BaselineQualitySection;
}

export function BaselineQuality({ data }: BaselineQualityProps) {
  const totalTelemetry =
    data.telemetryDistribution.goodCoverage +
    data.telemetryDistribution.lowCoverage +
    data.telemetryDistribution.none;

  return (
    <section className="mb-8">
      <h3
        className="text-sm font-bold uppercase tracking-widest mb-4 border-b border-border pb-2"
        style={{ fontFamily: 'monospace' }}
      >
        6. Baseline &amp; Data Quality
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Snapshot Coverage */}
        <div className="border-2 border-border bg-card p-4">
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3"
            style={{ fontFamily: 'monospace' }}
          >
            Snapshot Coverage
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Coverage Ratio</span>
              <span className="font-mono tabular-nums font-semibold">
                {formatPercent(data.snapshotCoverageRatio * 100)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Coverage Tier</span>
              <span className="font-mono uppercase text-xs font-semibold">
                {data.coverageTier}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tables</span>
              <span className="font-mono tabular-nums">
                {formatNumber(data.tablesCount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Missing Baseline</span>
              <span className="font-mono tabular-nums">
                {formatNumber(data.tablesMissingBaselineCount)}
              </span>
            </div>
          </div>
        </div>

        {/* Telemetry Distribution */}
        <div className="border-2 border-border bg-card p-4">
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3"
            style={{ fontFamily: 'monospace' }}
          >
            Telemetry Distribution
          </div>
          <div className="space-y-3">
            <TelemetryBar
              label="Good Coverage"
              count={data.telemetryDistribution.goodCoverage}
              total={totalTelemetry}
              colorClass="bg-green-500"
            />
            <TelemetryBar
              label="Low Coverage"
              count={data.telemetryDistribution.lowCoverage}
              total={totalTelemetry}
              colorClass="bg-yellow-500"
            />
            <TelemetryBar
              label="None"
              count={data.telemetryDistribution.none}
              total={totalTelemetry}
              colorClass="bg-red-500/60"
            />
          </div>
        </div>

        {/* Audit Correlation — AuditCorrelationDto */}
        {data.auditCorrelation && (
          <div className="border-2 border-border bg-card p-4 md:col-span-2">
            <div
              className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3"
              style={{ fontFamily: 'monospace' }}
            >
              Audit Correlation
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs">
                  Total Slips
                </span>
                <span className="font-mono tabular-nums font-semibold">
                  {formatNumber(data.auditCorrelation.totalSlips)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">
                  Full Chain
                </span>
                <span className="font-mono tabular-nums font-semibold">
                  {formatNumber(data.auditCorrelation.fullChainCount)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">
                  Chain Rate
                </span>
                <span className="font-mono tabular-nums font-semibold">
                  {formatPercent(data.auditCorrelation.fullChainRate)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">
                  With PFT / MTL / Loyalty
                </span>
                <span className="font-mono tabular-nums font-semibold">
                  {formatNumber(data.auditCorrelation.slipsWithPft)} /{' '}
                  {formatNumber(data.auditCorrelation.slipsWithMtl)} /{' '}
                  {formatNumber(data.auditCorrelation.slipsWithLoyalty)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function TelemetryBar({
  label,
  count,
  total,
  colorClass,
}: {
  label: string;
  count: number;
  total: number;
  colorClass: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">
          {formatNumber(count)} ({formatPercent(pct)})
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
