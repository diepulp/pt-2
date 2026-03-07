import type { CashObsSpikeAlertDTO } from '@/services/table-context/dtos';

/**
 * Single source of truth for alert key derivation.
 * All consumers (alerts page, badge hook, dismiss context) MUST import this.
 * No local reimplementation of key logic.
 */
export function computeAlertKey(alert: CashObsSpikeAlertDTO): string {
  const threshold = Number(alert.threshold).toFixed(2);
  const observed = Number(alert.observed_value).toFixed(2);
  return `v1|${alert.alert_type}|${alert.entity_type}|${alert.entity_id}|${alert.severity}|${threshold}|${observed}`;
}
