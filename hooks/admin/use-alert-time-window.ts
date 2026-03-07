'use client';

import { useMemo } from 'react';

export type AlertTimeSource = 'active_shift' | 'checkpoint' | 'fallback_8h';

export interface AlertTimeWindow {
  start: string;
  end: string;
  source: AlertTimeSource;
}

/**
 * Resolves the time window for admin alerts page.
 *
 * Fallback ladder:
 *   1. Active shift window (requires casino_settings.gaming_day_start_time + shift model)
 *   2. Most recent shift_checkpoint time bounds
 *   3. Last 8 hours fallback with banner
 *
 * MVP contract: Until shift/checkpoint infra is proven present,
 * returns fallback_8h deterministically. No ad-hoc shift-length inference.
 */
export function useAlertTimeWindow(): AlertTimeWindow {
  return useMemo(() => {
    // MVP: deterministic fallback — no shift model available yet.
    // Future: integrate active shift and shift_checkpoint sources.
    const now = new Date();
    const eightHoursAgo = new Date(now.getTime() - 8 * 60 * 60 * 1000);

    return {
      start: eightHoursAgo.toISOString(),
      end: now.toISOString(),
      source: 'fallback_8h' as const,
    };
  }, []);
}
