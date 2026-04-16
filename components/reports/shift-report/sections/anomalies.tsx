/**
 * Anomalies Section
 *
 * Alert counts by severity, acknowledgment stats, alert quality metrics.
 *
 * @see EXEC-065 WS2
 */

import type { AnomaliesSection } from '@/services/reporting/shift-report';

import { formatNumber, formatPercent } from '../format';

interface AnomaliesProps {
  data: AnomaliesSection;
}

function SeverityBadge({
  severity,
  count,
}: {
  severity: string;
  count: number;
}) {
  const colorMap: Record<string, string> = {
    critical: 'bg-red-500/10 text-red-400 border-red-500/30',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    low: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    info: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    warn: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  };

  const classes =
    colorMap[severity] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/30';

  return (
    <div className={`border rounded p-3 ${classes}`}>
      <div
        className="text-[10px] font-bold uppercase tracking-widest mb-1"
        style={{ fontFamily: 'monospace' }}
      >
        {severity}
      </div>
      <div className="text-xl font-semibold font-mono tabular-nums">
        {formatNumber(count)}
      </div>
    </div>
  );
}

export function Anomalies({ data }: AnomaliesProps) {
  // Count alerts by severity (AlertSeverity: 'info' | 'warn' | 'critical')
  const severityCounts: Record<string, number> = {};
  for (const alert of data.alerts) {
    const sev = alert.severity ?? 'unknown';
    severityCounts[sev] = (severityCounts[sev] ?? 0) + 1;
  }

  // Count anomalies (isAnomaly flag on AnomalyAlertDTO)
  const anomalyCount = data.alerts.filter((a) => a.isAnomaly).length;

  return (
    <section className="mb-8">
      <h3
        className="text-sm font-bold uppercase tracking-widest mb-4 border-b border-border pb-2"
        style={{ fontFamily: 'monospace' }}
      >
        5. Anomalies &amp; Alerts
      </h3>

      {/* Alert severity distribution */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
        {['critical', 'warn', 'info'].map((severity) => (
          <SeverityBadge
            key={severity}
            severity={severity}
            count={severityCounts[severity] ?? 0}
          />
        ))}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="border-2 border-border bg-card p-3">
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            Total Alerts
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums">
            {formatNumber(data.alerts.length)}
          </div>
        </div>
        <div className="border-2 border-border bg-card p-3">
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            Anomalies
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums">
            {formatNumber(anomalyCount)}
          </div>
        </div>
        <div className="border-2 border-border bg-card p-3">
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            Anomaly Rate
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums">
            {data.alerts.length > 0
              ? formatPercent((anomalyCount / data.alerts.length) * 100)
              : '--'}
          </div>
        </div>
      </div>

      {/* Alert Quality Metrics — uses AlertQualityDTO */}
      {data.alertQuality && (
        <div className="border-2 border-border bg-card p-4">
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3"
            style={{ fontFamily: 'monospace' }}
          >
            Alert Quality Telemetry
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground block text-xs">
                Total Alerts
              </span>
              <span className="font-mono tabular-nums font-semibold">
                {formatNumber(data.alertQuality.totalAlerts)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs">
                Acknowledged
              </span>
              <span className="font-mono tabular-nums font-semibold">
                {formatNumber(data.alertQuality.acknowledgedCount)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs">
                False Positives
              </span>
              <span className="font-mono tabular-nums font-semibold">
                {formatNumber(data.alertQuality.falsePositiveCount)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs">
                Median Ack Latency
              </span>
              <span className="font-mono tabular-nums font-semibold">
                {data.alertQuality.medianAcknowledgeLatencyMs != null
                  ? `${(data.alertQuality.medianAcknowledgeLatencyMs / 60000).toFixed(0)} min`
                  : '--'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Baseline coverage — uses BaselineCoverageDTO */}
      {data.baselineCoverage && (
        <div className="mt-3 text-xs text-muted-foreground font-mono">
          Baseline gaming day: {data.baselineGamingDay ?? 'N/A'} | Tables with
          baseline: {formatNumber(data.baselineCoverage.withBaseline)} /{' '}
          {formatNumber(
            data.baselineCoverage.withBaseline +
              data.baselineCoverage.withoutBaseline,
          )}
        </div>
      )}

      {data.alerts.length === 0 && !data.alertQuality && (
        <p className="text-sm text-muted-foreground italic">
          No anomalies detected for this shift.
        </p>
      )}
    </section>
  );
}
