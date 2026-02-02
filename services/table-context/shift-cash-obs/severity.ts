/**
 * Alert Severity Guardrails
 *
 * Pure functions for severity computation, downgrade rules, and alert filtering.
 * Prevents false-critical alerts from weak telemetry data.
 *
 * @see SHIFT_SEVERITY_ALLOWLISTS_v1.md
 */

// === Types ===

export type AlertSeverity = 'info' | 'warn' | 'critical';
export type TelemetryQuality = 'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE';
export type DowngradeReason = 'low_coverage' | 'no_coverage';

export interface SeverityResult {
  severity: AlertSeverity;
  original_severity: AlertSeverity;
  downgraded: boolean;
  downgrade_reason?: DowngradeReason;
}

// === Constants ===

export const ALLOWED_DIRECTIONS = ['cash_out'] as const;
export const ALLOWED_KINDS = ['cash_out_observed_spike_telemetry'] as const;

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  info: 0,
  warn: 1,
  critical: 2,
};

const MAX_SEVERITY_BY_QUALITY: Record<TelemetryQuality, AlertSeverity> = {
  GOOD_COVERAGE: 'critical',
  LOW_COVERAGE: 'warn',
  NONE: 'info',
};

const DOWNGRADE_REASON_BY_QUALITY: Record<
  TelemetryQuality,
  DowngradeReason | undefined
> = {
  GOOD_COVERAGE: undefined,
  LOW_COVERAGE: 'low_coverage',
  NONE: 'no_coverage',
};

// === Validation ===

/**
 * Check if an alert kind is in the MVP allow-list.
 */
export function isAllowedAlertKind(kind: string): boolean {
  return (ALLOWED_KINDS as readonly string[]).includes(kind);
}

/**
 * Check if a direction is in the MVP allow-list.
 */
export function isAllowedDirection(direction: string): boolean {
  return (ALLOWED_DIRECTIONS as readonly string[]).includes(direction);
}

// === Severity Computation ===

/**
 * Compute potentially-downgraded severity based on telemetry quality.
 *
 * No false-critical invariant: critical alerts require GOOD_COVERAGE.
 *
 * @see SHIFT_SEVERITY_ALLOWLISTS_v1.md §4
 */
export function computeAlertSeverity(
  baseSeverity: AlertSeverity,
  telemetryQuality: TelemetryQuality,
): SeverityResult {
  const maxAllowed = MAX_SEVERITY_BY_QUALITY[telemetryQuality];

  // Downgrade if base exceeds max allowed for this quality level
  const effectiveSeverity: AlertSeverity =
    SEVERITY_ORDER[baseSeverity] > SEVERITY_ORDER[maxAllowed]
      ? maxAllowed
      : baseSeverity;

  const downgraded = effectiveSeverity !== baseSeverity;

  return {
    severity: effectiveSeverity,
    original_severity: baseSeverity,
    downgraded,
    downgrade_reason: downgraded
      ? DOWNGRADE_REASON_BY_QUALITY[telemetryQuality]
      : undefined,
  };
}

// === Quality Aggregation ===

/**
 * Get the worst (minimum) telemetry quality from an array.
 * Used for pit-level alert quality assessment.
 *
 * @see SHIFT_SEVERITY_ALLOWLISTS_v1.md §6
 */
export function getWorstQuality(
  qualities: TelemetryQuality[],
): TelemetryQuality {
  if (qualities.length === 0) return 'NONE';

  return qualities.reduce<TelemetryQuality>((worst, q) => {
    const QUALITY_ORDER: Record<TelemetryQuality, number> = {
      GOOD_COVERAGE: 2,
      LOW_COVERAGE: 1,
      NONE: 0,
    };
    return QUALITY_ORDER[q] < QUALITY_ORDER[worst] ? q : worst;
  }, qualities[0]);
}
