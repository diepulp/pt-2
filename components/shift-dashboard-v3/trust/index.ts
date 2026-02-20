/**
 * Trust UI Primitives
 *
 * Composable trust indicators for shift dashboard data quality visualization.
 * These components communicate data confidence, coverage, and provenance
 * to operators.
 *
 * @see TRUST_LAYER_RULES.md
 * @see SHIFT_METRICS_UX_CONTRACT_v1.md
 */

export { CoverageBar } from './coverage-bar';
export type { CoverageBarProps } from './coverage-bar';

export { MetricGradeBadge } from './metric-grade-badge';
export type { MetricGradeBadgeProps } from './metric-grade-badge';

export { MissingDataWarning } from './missing-data-warning';
export type { MissingDataWarningProps } from './missing-data-warning';

export { OpeningSourceBadge } from './opening-source-badge';
export type { OpeningSourceBadgeProps } from './opening-source-badge';

export { ProvenanceTooltip } from './provenance-tooltip';
export type { ProvenanceTooltipProps } from './provenance-tooltip';

export { TelemetryQualityIndicator } from './telemetry-quality-indicator';
export type {
  TelemetryQualityIndicatorProps,
  TelemetryQualityLevel,
} from './telemetry-quality-indicator';
