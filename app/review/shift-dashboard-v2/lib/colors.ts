/**
 * Shift Dashboard V2 - Semantic Color Helpers
 *
 * Color system aligned with Nielsen's Heuristic #4 (Consistency and Standards).
 *
 * @see IMPLEMENTATION_STRATEGY.md §8.1 Color Semantics
 */

/**
 * Semantic status colors.
 */
export const STATUS_COLORS = {
  positive: {
    text: 'text-emerald-500',
    bg: 'bg-emerald-500',
    bgMuted: 'bg-emerald-500/10',
    border: 'border-emerald-500',
  },
  negative: {
    text: 'text-rose-500',
    bg: 'bg-rose-500',
    bgMuted: 'bg-rose-500/10',
    border: 'border-rose-500',
  },
  warning: {
    text: 'text-amber-500',
    bg: 'bg-amber-500',
    bgMuted: 'bg-amber-500/10',
    border: 'border-amber-500',
  },
  info: {
    text: 'text-blue-500',
    bg: 'bg-blue-500',
    bgMuted: 'bg-blue-500/10',
    border: 'border-blue-500',
  },
  neutral: {
    text: 'text-slate-400',
    bg: 'bg-slate-400',
    bgMuted: 'bg-slate-400/10',
    border: 'border-slate-400',
  },
} as const;

/**
 * Get color configuration for win/loss value.
 */
export function getWinLossColor(cents: number | null | undefined) {
  if (cents == null || cents === 0) return STATUS_COLORS.neutral;
  return cents > 0 ? STATUS_COLORS.positive : STATUS_COLORS.negative;
}

/**
 * Get color for alert severity.
 */
export function getAlertSeverityColor(severity: 'info' | 'warn' | 'critical') {
  switch (severity) {
    case 'critical':
      return STATUS_COLORS.negative;
    case 'warn':
      return STATUS_COLORS.warning;
    case 'info':
    default:
      return STATUS_COLORS.info;
  }
}

/**
 * Get color for telemetry quality.
 */
export function getTelemetryQualityColor(
  quality: 'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE',
) {
  switch (quality) {
    case 'GOOD_COVERAGE':
      return STATUS_COLORS.positive;
    case 'LOW_COVERAGE':
      return STATUS_COLORS.warning;
    case 'NONE':
    default:
      return STATUS_COLORS.neutral;
  }
}
