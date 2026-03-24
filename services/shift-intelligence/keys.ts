/**
 * ShiftIntelligenceService React Query Key Factory (PRD-055)
 */

const ROOT = ['shift-intelligence'] as const;

export const shiftIntelligenceKeys = {
  all: ROOT,

  anomalyAlerts: Object.assign(
    (windowStart: string, windowEnd: string) =>
      [...ROOT, 'anomaly-alerts', { windowStart, windowEnd }] as const,
    { scope: [...ROOT, 'anomaly-alerts'] as const },
  ),

  baselines: Object.assign(
    (gamingDay?: string) => [...ROOT, 'baselines', { gamingDay }] as const,
    { scope: [...ROOT, 'baselines'] as const },
  ),
};
