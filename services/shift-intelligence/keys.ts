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

  shiftAlerts: Object.assign(
    (gamingDay: string, status?: string) =>
      [...ROOT, 'shift-alerts', { gamingDay, status }] as const,
    { scope: [...ROOT, 'shift-alerts'] as const },
  ),

  alertQuality: Object.assign(
    (startDate: string, endDate: string) =>
      [...ROOT, 'alert-quality', { startDate, endDate }] as const,
    { scope: [...ROOT, 'alert-quality'] as const },
  ),
};
