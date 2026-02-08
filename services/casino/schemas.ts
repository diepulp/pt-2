/**
 * CasinoService Zod Validation Schemas
 *
 * Validation schemas for API request bodies and query parameters.
 * Includes staff role constraint refinement per PRD-000.
 *
 * @see SPEC-PRD-000-casino-foundation.md section 4.3
 */

import { z } from 'zod';

import { uuidSchema, uuidSchemaNullable } from '@/lib/validation';

// === Casino Schemas ===

/** Schema for creating a new casino */
export const createCasinoSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  location: z.string().max(255).nullable().optional(),
  address: z.record(z.string(), z.unknown()).nullable().optional(),
  company_id: uuidSchemaNullable('company ID').optional(),
});

/** Schema for updating an existing casino */
export const updateCasinoSchema = createCasinoSchema.partial();

// === Casino Settings Schemas ===

/** Schema for updating casino settings */
export const updateCasinoSettingsSchema = z.object({
  gaming_day_start_time: z
    .string()
    .regex(
      /^\d{2}:\d{2}(:\d{2})?$/,
      'Must be HH:MM or HH:MM:SS format (e.g., 06:00)',
    )
    .optional(),
  timezone: z
    .string()
    .min(1)
    .max(64, 'Timezone must be at most 64 characters')
    .optional(),
  watchlist_floor: z
    .number()
    .positive('Watchlist floor must be positive')
    .optional(),
  ctr_threshold: z
    .number()
    .positive('CTR threshold must be positive')
    .optional(),
});

// === Staff Schemas ===

/** Staff roles enum */
export const staffRoleSchema = z.enum([
  'dealer',
  'pit_boss',
  'cashier',
  'admin',
]);

/**
 * Schema for creating a staff member with role constraint refinement.
 *
 * Role constraint (PRD-000 section 3.3):
 * - Dealer: Must NOT have user_id (non-authenticated role)
 * - Pit Boss/Admin: MUST have user_id (authenticated roles)
 */
export const createStaffSchema = z
  .object({
    first_name: z.string().min(1, 'First name is required').max(100),
    last_name: z.string().min(1, 'Last name is required').max(100),
    role: staffRoleSchema,
    employee_id: z.string().max(50).nullable().optional(),
    email: z.string().email('Invalid email format').nullable().optional(),
    casino_id: uuidSchema('casino ID'),
    user_id: uuidSchemaNullable('user ID').optional(),
  })
  .refine(
    (data) => {
      // Dealer must NOT have user_id; pit_boss/admin MUST have user_id
      if (data.role === 'dealer') {
        return data.user_id === null || data.user_id === undefined;
      }
      return data.user_id !== null && data.user_id !== undefined;
    },
    {
      message:
        'Dealer role cannot have user_id; pit_boss and admin roles must have user_id',
      path: ['user_id'],
    },
  );

// === Query Parameter Schemas ===

/** Schema for gaming day query parameters */
export const gamingDayQuerySchema = z.object({
  timestamp: z
    .string()
    .datetime({ message: 'Must be a valid ISO 8601 datetime' })
    .optional(),
});

/** Schema for casino list query parameters */
export const casinoListQuerySchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100, 'Limit cannot exceed 100')
    .default(20),
});

/** Schema for staff list query parameters */
export const staffListQuerySchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  role: staffRoleSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100, 'Limit cannot exceed 100')
    .default(20),
});

// === Onboarding Schemas (PRD-025) ===

/** Bootstrap casino input (called from /bootstrap form) */
export const bootstrapCasinoSchema = z.object({
  casino_name: z.string().min(1, 'Casino name is required').max(100),
  timezone: z.string().min(1).max(64).optional(),
  gaming_day_start: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format')
    .optional(),
});

/** Staff invite creation input (admin-only) */
export const createInviteSchema = z.object({
  email: z.string().email('Invalid email format'),
  role: z.enum(['dealer', 'pit_boss', 'cashier', 'admin']),
});

/** Invite acceptance input (token from URL) */
export const acceptInviteSchema = z.object({
  token: z
    .string()
    .length(64, 'Token must be 64-character hex string')
    .regex(/^[0-9a-f]{64}$/, 'Token must be lowercase hexadecimal'),
});

// === Alert Threshold Schemas (PRD-LOYALTY-PROMO WS6) ===

/** Base schema for enabled thresholds */
const alertThresholdConfigSchema = z.object({
  enabled: z.boolean().default(true),
});

/** Table idle threshold schema */
export const tableIdleThresholdSchema = alertThresholdConfigSchema.extend({
  warn_minutes: z.number().int().positive().default(20),
  critical_minutes: z.number().int().positive().default(45),
});

/** Slip duration threshold schema */
export const slipDurationThresholdSchema = alertThresholdConfigSchema.extend({
  warn_hours: z.number().int().positive().default(4),
  critical_hours: z.number().int().positive().default(8),
});

/** Pause duration threshold schema */
export const pauseDurationThresholdSchema = alertThresholdConfigSchema.extend({
  warn_minutes: z.number().int().positive().default(30),
});

/** Drop anomaly threshold schema */
export const dropAnomalyThresholdSchema = alertThresholdConfigSchema.extend({
  mad_multiplier: z.number().positive().default(3),
  fallback_percent: z.number().positive().default(50),
});

/** Hold deviation threshold schema (disabled by default) */
export const holdDeviationThresholdSchema = alertThresholdConfigSchema.extend({
  enabled: z.boolean().default(false), // Override default - disabled until trusted
  deviation_pp: z.number().positive().default(10),
  extreme_low: z.number().default(-5),
  extreme_high: z.number().positive().default(40),
});

/** Promo issuance spike threshold schema */
export const promoIssuanceSpikeThresholdSchema =
  alertThresholdConfigSchema.extend({
    mad_multiplier: z.number().positive().default(3),
    fallback_percent: z.number().positive().default(100),
  });

/** Promo void rate threshold schema */
export const promoVoidRateThresholdSchema = alertThresholdConfigSchema.extend({
  warn_percent: z.number().positive().max(100).default(5),
});

/** Outstanding aging threshold schema */
export const outstandingAgingThresholdSchema =
  alertThresholdConfigSchema.extend({
    max_age_hours: z.number().int().positive().default(24),
    max_value_dollars: z.number().positive().default(2000),
    max_coupon_count: z.number().int().positive().default(25),
  });

/** Baseline configuration schema */
export const alertBaselineConfigSchema = z.object({
  window_days: z.number().int().positive().default(7),
  method: z.enum(['median_mad', 'mean_stddev']).default('median_mad'),
  min_history_days: z.number().int().positive().default(3),
});

/**
 * Complete alert thresholds schema with defaults
 *
 * @see docs/00-vision/loyalty-service-extension/SHIFT_DASHBOARDS_V0_ALERT_THRESHOLDS_BASELINES_PATCH.md
 */
export const alertThresholdsSchema = z.object({
  table_idle: tableIdleThresholdSchema.default({
    enabled: true,
    warn_minutes: 20,
    critical_minutes: 45,
  }),
  slip_duration: slipDurationThresholdSchema.default({
    enabled: true,
    warn_hours: 4,
    critical_hours: 8,
  }),
  pause_duration: pauseDurationThresholdSchema.default({
    enabled: true,
    warn_minutes: 30,
  }),
  drop_anomaly: dropAnomalyThresholdSchema.default({
    enabled: true,
    mad_multiplier: 3,
    fallback_percent: 50,
  }),
  hold_deviation: holdDeviationThresholdSchema.default({
    enabled: false,
    deviation_pp: 10,
    extreme_low: -5,
    extreme_high: 40,
  }),
  promo_issuance_spike: promoIssuanceSpikeThresholdSchema.default({
    enabled: true,
    mad_multiplier: 3,
    fallback_percent: 100,
  }),
  promo_void_rate: promoVoidRateThresholdSchema.default({
    enabled: true,
    warn_percent: 5,
  }),
  outstanding_aging: outstandingAgingThresholdSchema.default({
    enabled: true,
    max_age_hours: 24,
    max_value_dollars: 2000,
    max_coupon_count: 25,
  }),
  baseline: alertBaselineConfigSchema.default({
    window_days: 7,
    method: 'median_mad',
    min_history_days: 3,
  }),
});

/** Partial schema for updating alert thresholds (deep partial) */
export const updateAlertThresholdsSchema = z
  .object({
    table_idle: tableIdleThresholdSchema.partial().optional(),
    slip_duration: slipDurationThresholdSchema.partial().optional(),
    pause_duration: pauseDurationThresholdSchema.partial().optional(),
    drop_anomaly: dropAnomalyThresholdSchema.partial().optional(),
    hold_deviation: holdDeviationThresholdSchema.partial().optional(),
    promo_issuance_spike: promoIssuanceSpikeThresholdSchema
      .partial()
      .optional(),
    promo_void_rate: promoVoidRateThresholdSchema.partial().optional(),
    outstanding_aging: outstandingAgingThresholdSchema.partial().optional(),
    baseline: alertBaselineConfigSchema.partial().optional(),
  })
  .partial();

// === Type Exports (inferred from schemas) ===

export type CreateCasinoInput = z.infer<typeof createCasinoSchema>;
export type UpdateCasinoInput = z.infer<typeof updateCasinoSchema>;
export type UpdateCasinoSettingsInput = z.infer<
  typeof updateCasinoSettingsSchema
>;
export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type GamingDayQuery = z.infer<typeof gamingDayQuerySchema>;
export type CasinoListQuery = z.infer<typeof casinoListQuerySchema>;
export type StaffListQuery = z.infer<typeof staffListQuerySchema>;
export type AlertThresholdsInput = z.infer<typeof alertThresholdsSchema>;
export type UpdateAlertThresholdsInput = z.infer<
  typeof updateAlertThresholdsSchema
>;
// Onboarding (PRD-025)
export type BootstrapCasinoSchemaInput = z.infer<typeof bootstrapCasinoSchema>;
export type CreateInviteSchemaInput = z.infer<typeof createInviteSchema>;
export type AcceptInviteSchemaInput = z.infer<typeof acceptInviteSchema>;
