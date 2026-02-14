/**
 * Shift Cash Observation Severity Guardrails Tests
 *
 * Tests for alert severity computation, downgrade rules, and filtering.
 * Enforces the no-false-critical invariant.
 *
 * @see SHIFT_SEVERITY_ALLOWLISTS_v1.md
 */

import {
  computeAlertSeverity,
  getWorstQuality,
  isAllowedAlertKind,
  isAllowedDirection,
} from '../shift-cash-obs/severity';
import type {
  AlertSeverity,
  TelemetryQuality,
} from '../shift-cash-obs/severity';

// === isAllowedAlertKind ===

describe('isAllowedAlertKind', () => {
  it('allows cash_out_observed_spike_telemetry', () => {
    expect(isAllowedAlertKind('cash_out_observed_spike_telemetry')).toBe(true);
  });

  it('rejects cash_in_spike', () => {
    expect(isAllowedAlertKind('cash_in_spike')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isAllowedAlertKind('')).toBe(false);
  });

  it('rejects unknown kinds', () => {
    expect(isAllowedAlertKind('random_alert_type')).toBe(false);
  });
});

// === isAllowedDirection ===

describe('isAllowedDirection', () => {
  it('allows cash_out', () => {
    expect(isAllowedDirection('cash_out')).toBe(true);
  });

  it('rejects cash_in', () => {
    expect(isAllowedDirection('cash_in')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isAllowedDirection('')).toBe(false);
  });

  it('rejects unknown directions', () => {
    expect(isAllowedDirection('cash_transfer')).toBe(false);
  });
});

// === computeAlertSeverity ===

describe('computeAlertSeverity', () => {
  // GOOD_COVERAGE: max severity = critical (no downgrade)
  describe('with GOOD_COVERAGE quality', () => {
    it('critical base -> critical, not downgraded', () => {
      const result = computeAlertSeverity('critical', 'GOOD_COVERAGE');

      expect(result.severity).toBe('critical');
      expect(result.original_severity).toBe('critical');
      expect(result.downgraded).toBe(false);
      expect(result.downgrade_reason).toBeUndefined();
    });

    it('warn base -> warn, not downgraded', () => {
      const result = computeAlertSeverity('warn', 'GOOD_COVERAGE');

      expect(result.severity).toBe('warn');
      expect(result.original_severity).toBe('warn');
      expect(result.downgraded).toBe(false);
      expect(result.downgrade_reason).toBeUndefined();
    });

    it('info base -> info, not downgraded', () => {
      const result = computeAlertSeverity('info', 'GOOD_COVERAGE');

      expect(result.severity).toBe('info');
      expect(result.original_severity).toBe('info');
      expect(result.downgraded).toBe(false);
    });
  });

  // LOW_COVERAGE: max severity = warn
  describe('with LOW_COVERAGE quality', () => {
    it('critical base -> warn, downgraded with low_coverage reason', () => {
      const result = computeAlertSeverity('critical', 'LOW_COVERAGE');

      expect(result.severity).toBe('warn');
      expect(result.original_severity).toBe('critical');
      expect(result.downgraded).toBe(true);
      expect(result.downgrade_reason).toBe('low_coverage');
    });

    it('warn base -> warn, not downgraded', () => {
      const result = computeAlertSeverity('warn', 'LOW_COVERAGE');

      expect(result.severity).toBe('warn');
      expect(result.original_severity).toBe('warn');
      expect(result.downgraded).toBe(false);
      expect(result.downgrade_reason).toBeUndefined();
    });

    it('info base -> info, not downgraded', () => {
      const result = computeAlertSeverity('info', 'LOW_COVERAGE');

      expect(result.severity).toBe('info');
      expect(result.original_severity).toBe('info');
      expect(result.downgraded).toBe(false);
    });
  });

  // NONE: max severity = info
  describe('with NONE quality', () => {
    it('critical base -> info, downgraded with no_coverage reason', () => {
      const result = computeAlertSeverity('critical', 'NONE');

      expect(result.severity).toBe('info');
      expect(result.original_severity).toBe('critical');
      expect(result.downgraded).toBe(true);
      expect(result.downgrade_reason).toBe('no_coverage');
    });

    it('warn base -> info, downgraded with no_coverage reason', () => {
      const result = computeAlertSeverity('warn', 'NONE');

      expect(result.severity).toBe('info');
      expect(result.original_severity).toBe('warn');
      expect(result.downgraded).toBe(true);
      expect(result.downgrade_reason).toBe('no_coverage');
    });

    it('info base -> info, not downgraded', () => {
      const result = computeAlertSeverity('info', 'NONE');

      expect(result.severity).toBe('info');
      expect(result.original_severity).toBe('info');
      expect(result.downgraded).toBe(false);
      expect(result.downgrade_reason).toBeUndefined();
    });
  });
});

// === getWorstQuality ===

describe('getWorstQuality', () => {
  it('returns NONE for empty array', () => {
    expect(getWorstQuality([])).toBe('NONE');
  });

  it('returns GOOD_COVERAGE when all GOOD', () => {
    expect(getWorstQuality(['GOOD_COVERAGE', 'GOOD_COVERAGE'])).toBe(
      'GOOD_COVERAGE',
    );
  });

  it('returns LOW_COVERAGE when mixed GOOD and LOW', () => {
    expect(getWorstQuality(['GOOD_COVERAGE', 'LOW_COVERAGE'])).toBe(
      'LOW_COVERAGE',
    );
  });

  it('returns NONE when mixed GOOD, LOW, and NONE', () => {
    expect(getWorstQuality(['GOOD_COVERAGE', 'LOW_COVERAGE', 'NONE'])).toBe(
      'NONE',
    );
  });

  it('returns NONE for single NONE', () => {
    expect(getWorstQuality(['NONE'])).toBe('NONE');
  });

  it('returns LOW_COVERAGE for single LOW', () => {
    expect(getWorstQuality(['LOW_COVERAGE'])).toBe('LOW_COVERAGE');
  });

  it('returns GOOD_COVERAGE for single GOOD', () => {
    expect(getWorstQuality(['GOOD_COVERAGE'])).toBe('GOOD_COVERAGE');
  });

  it('returns NONE when GOOD and NONE (no LOW)', () => {
    expect(getWorstQuality(['GOOD_COVERAGE', 'NONE'])).toBe('NONE');
  });
});

// === No False-Critical Invariant ===

describe('No false-critical invariant', () => {
  const LOW_QUALITY_STATES: TelemetryQuality[] = ['LOW_COVERAGE', 'NONE'];
  const ALL_SEVERITIES: AlertSeverity[] = ['info', 'warn', 'critical'];

  it.each(LOW_QUALITY_STATES)(
    'NEVER produces critical when quality is %s',
    (quality) => {
      for (const severity of ALL_SEVERITIES) {
        const result = computeAlertSeverity(severity, quality);
        expect(result.severity).not.toBe('critical');
      }
    },
  );

  it('critical is only possible with GOOD_COVERAGE', () => {
    const result = computeAlertSeverity('critical', 'GOOD_COVERAGE');
    expect(result.severity).toBe('critical');
    expect(result.downgraded).toBe(false);
  });

  it('exhaustive severity/quality matrix has no false critical', () => {
    const qualities: TelemetryQuality[] = [
      'GOOD_COVERAGE',
      'LOW_COVERAGE',
      'NONE',
    ];
    const severities: AlertSeverity[] = ['info', 'warn', 'critical'];

    for (const quality of qualities) {
      for (const severity of severities) {
        const result = computeAlertSeverity(severity, quality);
        if (quality !== 'GOOD_COVERAGE') {
          expect(result.severity).not.toBe('critical');
        }
      }
    }
  });
});

// === SeverityResult shape contract ===

describe('SeverityResult contract', () => {
  it('always includes all required fields', () => {
    const result = computeAlertSeverity('warn', 'LOW_COVERAGE');

    expect(result).toHaveProperty('severity');
    expect(result).toHaveProperty('original_severity');
    expect(result).toHaveProperty('downgraded');
    expect(typeof result.severity).toBe('string');
    expect(typeof result.original_severity).toBe('string');
    expect(typeof result.downgraded).toBe('boolean');
  });

  it('downgrade_reason is undefined when not downgraded', () => {
    const result = computeAlertSeverity('info', 'GOOD_COVERAGE');
    expect(result.downgraded).toBe(false);
    expect(result.downgrade_reason).toBeUndefined();
  });

  it('downgrade_reason is defined when downgraded', () => {
    const result = computeAlertSeverity('critical', 'NONE');
    expect(result.downgraded).toBe(true);
    expect(result.downgrade_reason).toBeDefined();
    expect(['low_coverage', 'no_coverage']).toContain(result.downgrade_reason);
  });
});
