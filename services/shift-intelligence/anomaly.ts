/**
 * ShiftIntelligenceService — Anomaly Alerts (PRD-055)
 * Calls rpc_get_anomaly_alerts to read baseline-aware anomaly flags.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import type { Database } from '@/types/database.types';

import type { AnomalyAlertsQuery, AnomalyAlertsResponseDTO } from './dtos';
import { mapAnomalyAlertRow } from './mappers';

export async function getAnomalyAlerts(
  supabase: SupabaseClient<Database>,
  query: AnomalyAlertsQuery,
): Promise<AnomalyAlertsResponseDTO> {
  const { data, error } = await supabase.rpc('rpc_get_anomaly_alerts', {
    p_window_start: query.window_start,
    p_window_end: query.window_end,
  });

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to fetch anomaly alerts: ${error.message}`,
      { details: safeErrorDetails(error) },
    );
  }

  const alerts = (data ?? []).map(mapAnomalyAlertRow);

  // Compute baseline coverage at the table level
  const allTableIds = new Set(alerts.map((a) => a.tableId));
  const tablesWithReady = new Set(
    alerts.filter((a) => a.readinessState === 'ready').map((a) => a.tableId),
  );

  return {
    alerts,
    baselineGamingDay: alerts[0]?.baselineGamingDay ?? '',
    baselineCoverage: {
      withBaseline: tablesWithReady.size,
      withoutBaseline: allTableIds.size - tablesWithReady.size,
    },
  };
}
