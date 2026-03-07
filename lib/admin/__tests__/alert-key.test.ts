import type { CashObsSpikeAlertDTO } from '@/services/table-context/dtos';

import { computeAlertKey } from '../alert-key';

function makeAlert(
  overrides: Partial<CashObsSpikeAlertDTO> = {},
): CashObsSpikeAlertDTO {
  return {
    alert_type: 'cash_out_observed_spike_telemetry',
    severity: 'warn',
    entity_type: 'table',
    entity_id: 'table-1',
    entity_label: 'Table 1',
    observed_value: 15000,
    threshold: 10000,
    message: 'Observed exceeds threshold',
    is_telemetry: true,
    ...overrides,
  };
}

describe('computeAlertKey', () => {
  it('produces a stable key for the same input', () => {
    const alert = makeAlert();
    expect(computeAlertKey(alert)).toBe(computeAlertKey(alert));
  });

  it('produces identical keys for equivalent alerts', () => {
    const a = makeAlert();
    const b = makeAlert();
    expect(computeAlertKey(a)).toBe(computeAlertKey(b));
  });

  it('normalizes numeric precision with toFixed(2)', () => {
    const a = makeAlert({ threshold: 10000, observed_value: 15000 });
    const key = computeAlertKey(a);
    expect(key).toContain('10000.00');
    expect(key).toContain('15000.00');
  });

  it('handles floating point values correctly', () => {
    const a = makeAlert({ threshold: 10000.1, observed_value: 15000.999 });
    const b = makeAlert({ threshold: 10000.1, observed_value: 15000.999 });
    expect(computeAlertKey(a)).toBe(computeAlertKey(b));
  });

  it('produces different keys for different entity_ids', () => {
    const a = makeAlert({ entity_id: 'table-1' });
    const b = makeAlert({ entity_id: 'table-2' });
    expect(computeAlertKey(a)).not.toBe(computeAlertKey(b));
  });

  it('produces different keys for different severities', () => {
    const a = makeAlert({ severity: 'warn' });
    const b = makeAlert({ severity: 'critical' });
    expect(computeAlertKey(a)).not.toBe(computeAlertKey(b));
  });

  it('produces different keys for different entity_types', () => {
    const a = makeAlert({ entity_type: 'table' });
    const b = makeAlert({ entity_type: 'pit' });
    expect(computeAlertKey(a)).not.toBe(computeAlertKey(b));
  });

  it('produces different keys for different observed values', () => {
    const a = makeAlert({ observed_value: 15000 });
    const b = makeAlert({ observed_value: 20000 });
    expect(computeAlertKey(a)).not.toBe(computeAlertKey(b));
  });

  it('includes version prefix', () => {
    expect(computeAlertKey(makeAlert())).toMatch(/^v1\|/);
  });

  it('uses pipe delimiters', () => {
    const key = computeAlertKey(makeAlert());
    const parts = key.split('|');
    expect(parts).toHaveLength(7);
  });
});
