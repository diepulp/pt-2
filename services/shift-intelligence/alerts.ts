/**
 * ShiftIntelligenceService — Alert Operations (PRD-056)
 * Persistent alert CRUD: persist, acknowledge, query, quality telemetry.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import type { Database } from '@/types/database.types';

import type {
  AcknowledgeAlertInput,
  AcknowledgeAlertResultDTO,
  AlertQualityDTO,
  AlertsQuery,
  PersistAlertsInput,
  PersistAlertsResultDTO,
  ShiftAlertDTO,
} from './dtos';
import {
  mapAcknowledgeResult,
  mapAlertQualityResult,
  mapPersistResult,
} from './mappers';

// ── Persist Alerts ──────────────────────────────────────────────────────────

export async function persistAlerts(
  supabase: SupabaseClient<Database>,
  input?: PersistAlertsInput,
): Promise<PersistAlertsResultDTO> {
  const { data, error } = await supabase.rpc('rpc_persist_anomaly_alerts', {
    p_gaming_day: input?.gaming_day ?? undefined,
  });

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to persist alerts: ${error.message}`,
      { details: safeErrorDetails(error) },
    );
  }

  return mapPersistResult(data as Record<string, unknown>);
}

// ── Acknowledge Alert ───────────────────────────────────────────────────────

export async function acknowledgeAlert(
  supabase: SupabaseClient<Database>,
  input: AcknowledgeAlertInput,
): Promise<AcknowledgeAlertResultDTO> {
  const { data, error } = await supabase.rpc('rpc_acknowledge_alert', {
    p_alert_id: input.alert_id,
    p_notes: input.notes ?? undefined,
    p_is_false_positive: input.is_false_positive ?? undefined,
  });

  if (error) {
    if (error.message.includes('SHIFT_ALERT_NOT_FOUND')) {
      throw new DomainError('NOT_FOUND', 'Alert not found', {
        details: safeErrorDetails(error),
      });
    }
    if (error.message.includes('SHIFT_ACKNOWLEDGE_UNAUTHORIZED')) {
      throw new DomainError(
        'FORBIDDEN',
        'Insufficient role to acknowledge alerts',
        {
          details: safeErrorDetails(error),
        },
      );
    }
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to acknowledge alert: ${error.message}`,
      { details: safeErrorDetails(error) },
    );
  }

  return mapAcknowledgeResult(data as Record<string, unknown>);
}

// ── Get Alerts (persistent) ─────────────────────────────────────────────────

export async function getAlerts(
  supabase: SupabaseClient<Database>,
  query: AlertsQuery,
): Promise<ShiftAlertDTO[]> {
  let qb = supabase
    .from('shift_alert')
    .select(
      `
      *,
      alert_acknowledgment (
        acknowledged_by,
        notes,
        is_false_positive,
        created_at,
        staff:acknowledged_by ( first_name, last_name )
      ),
      gaming_table:table_id ( label )
    `,
    )
    .eq('gaming_day', query.gaming_day)
    .order('created_at', { ascending: false });

  if (query.status) {
    qb = qb.eq('status', query.status);
  }

  const { data, error } = await qb;

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to fetch alerts: ${error.message}`,
      { details: safeErrorDetails(error) },
    );
  }

  return (data ?? []).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join shape requires dynamic access
    const r = row as any;
    const ack = r.alert_acknowledgment?.[0] ?? null;
    const table = r.gaming_table;

    return {
      id: r.id,
      tableId: r.table_id,
      tableLabel: table?.label ?? '',
      metricType: r.metric_type,
      gamingDay: r.gaming_day,
      status: r.status,
      severity: r.severity,
      observedValue: r.observed_value,
      baselineMedian: r.baseline_median,
      baselineMad: r.baseline_mad,
      deviationScore: r.deviation_score,
      direction: r.direction,
      message: r.message,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      acknowledgment: ack
        ? {
            acknowledgedBy: ack.acknowledged_by,
            acknowledgedByName: ack.staff
              ? `${ack.staff.first_name ?? ''} ${ack.staff.last_name ?? ''}`.trim() ||
                null
              : null,
            notes: ack.notes,
            isFalsePositive: ack.is_false_positive,
            createdAt: ack.created_at,
          }
        : null,
    };
  });
}

// ── Alert Quality Telemetry (WS10) ──────────────────────────────────────────

export async function getAlertQuality(
  supabase: SupabaseClient<Database>,
  startDate: string,
  endDate: string,
): Promise<AlertQualityDTO> {
  const { data, error } = await supabase.rpc('rpc_get_alert_quality', {
    p_start: startDate,
    p_end: endDate,
  });

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to fetch alert quality: ${error.message}`,
      { details: safeErrorDetails(error) },
    );
  }

  return mapAlertQualityResult(data as Record<string, unknown>, {
    start: startDate,
    end: endDate,
  });
}
