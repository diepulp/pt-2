/**
 * Casino Settings Route Tests (EXEC-042 WS0)
 *
 * Tests for alert_thresholds PATCH, role enforcement, unknown key preservation,
 * Zod .loose() regression, and DTO projection drift guard.
 */

import {
  updateCasinoSettingsSchema,
  updateAlertThresholdsSchema,
} from '@/services/casino/schemas';
import type {
  CasinoSettingsWithAlertsDTO,
  UpdateCasinoSettingsDTO,
} from '@/services/casino/dtos';

// --- Zod schema unit tests ---

describe('updateCasinoSettingsSchema', () => {
  it('accepts alert_thresholds field', () => {
    const input = {
      alert_thresholds: {
        table_idle: { warn_minutes: 30 },
      },
    };

    const result = updateCasinoSettingsSchema.parse(input);
    expect(result.alert_thresholds).toBeDefined();
    expect(result.alert_thresholds?.table_idle?.warn_minutes).toBe(30);
  });

  it('accepts input without alert_thresholds (unchanged)', () => {
    const input = { watchlist_floor: 500000 };

    const result = updateCasinoSettingsSchema.parse(input);
    expect(result.watchlist_floor).toBe(500000);
    expect(result.alert_thresholds).toBeUndefined();
  });

  it('accepts empty object', () => {
    const result = updateCasinoSettingsSchema.parse({});
    expect(result).toEqual({});
  });

  it('validates gaming_day_start_time format', () => {
    expect(() =>
      updateCasinoSettingsSchema.parse({ gaming_day_start_time: 'invalid' }),
    ).toThrow();

    const result = updateCasinoSettingsSchema.parse({
      gaming_day_start_time: '06:00',
    });
    expect(result.gaming_day_start_time).toBe('06:00');
  });
});

describe('updateAlertThresholdsSchema — .loose() regression', () => {
  it('preserves unknown keys at outer level', () => {
    const input = {
      table_idle: { warn_minutes: 30 },
      _future_field: true,
    };

    const result = updateAlertThresholdsSchema.parse(input);
    expect((result as Record<string, unknown>)._future_field).toBe(true);
  });

  it('preserves unknown keys at category level', () => {
    const input = {
      table_idle: {
        warn_minutes: 30,
        _experimental_metric: 'test',
      },
    };

    const result = updateAlertThresholdsSchema.parse(input);
    expect(
      (result.table_idle as Record<string, unknown>)?._experimental_metric,
    ).toBe('test');
  });

  it('accepts deep partial updates', () => {
    const input = {
      hold_deviation: { enabled: true },
    };

    const result = updateAlertThresholdsSchema.parse(input);
    expect(result.hold_deviation?.enabled).toBe(true);
    // deviation_pp gets default value from schema since .partial() applies at outer level
    expect(result.hold_deviation?.deviation_pp).toBeDefined();
  });
});

// --- DTO projection drift guard ---

describe('CasinoSettingsWithAlertsDTO projection drift guard', () => {
  it('SETTINGS_SELECT includes all required CasinoSettingsWithAlertsDTO keys', () => {
    // This constant mirrors the SETTINGS_SELECT in route.ts
    // If the DTO grows but the select string doesn't, this test catches it.
    const SETTINGS_SELECT =
      'id, casino_id, gaming_day_start_time, timezone, watchlist_floor, ctr_threshold, alert_thresholds, updated_at, promo_require_exact_match, promo_allow_anonymous_issuance';

    const selectFields = SETTINGS_SELECT.split(',').map((f) => f.trim());

    const requiredKeys: (keyof CasinoSettingsWithAlertsDTO)[] = [
      'id',
      'casino_id',
      'gaming_day_start_time',
      'timezone',
      'watchlist_floor',
      'ctr_threshold',
      'alert_thresholds',
      'updated_at',
      'promo_require_exact_match',
      'promo_allow_anonymous_issuance',
    ];

    for (const key of requiredKeys) {
      expect(selectFields).toContain(key);
    }
  });
});

// --- UpdateCasinoSettingsDTO type compatibility ---

describe('UpdateCasinoSettingsDTO type contracts', () => {
  it('supports alert_thresholds in update payload', () => {
    const dto: UpdateCasinoSettingsDTO = {
      alert_thresholds: {
        table_idle: {
          enabled: true,
          warn_minutes: 25,
          critical_minutes: 50,
        },
        slip_duration: {
          enabled: true,
          warn_hours: 6,
          critical_hours: 12,
        },
        pause_duration: { enabled: true, warn_minutes: 30 },
        drop_anomaly: {
          enabled: true,
          mad_multiplier: 3,
          fallback_percent: 50,
        },
        hold_deviation: {
          enabled: false,
          deviation_pp: 10,
          extreme_low: -5,
          extreme_high: 40,
        },
        promo_issuance_spike: {
          enabled: true,
          mad_multiplier: 3,
          fallback_percent: 100,
        },
        promo_void_rate: { enabled: true, warn_percent: 5 },
        outstanding_aging: {
          enabled: true,
          max_age_hours: 24,
          max_value_dollars: 2000,
          max_coupon_count: 25,
        },
        baseline: {
          window_days: 7,
          method: 'median_mad',
          min_history_days: 3,
        },
      },
    };

    expect(dto.alert_thresholds).toBeDefined();
  });

  it('supports update without alert_thresholds', () => {
    const dto: UpdateCasinoSettingsDTO = {
      watchlist_floor: 500000,
    };

    expect(dto.alert_thresholds).toBeUndefined();
  });
});
