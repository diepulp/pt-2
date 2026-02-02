/**
 * CasinoService DTOs
 *
 * Pattern B (Canonical CRUD): DTOs derived via Pick/Omit from Database types.
 * No manual interfaces except for RPC response types (GamingDayDTO).
 *
 * @see SPEC-PRD-000-casino-foundation.md section 4.2
 * @see SERVICE_RESPONSIBILITY_MATRIX.md section 882-1006
 */

import type { Database } from '@/types/database.types';

// === Base Row Types (for Pick/Omit derivation) ===

type CasinoRow = Database['public']['Tables']['casino']['Row'];
type CasinoInsert = Database['public']['Tables']['casino']['Insert'];
type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];
type CasinoSettingsUpdate =
  Database['public']['Tables']['casino_settings']['Update'];
type StaffRow = Database['public']['Tables']['staff']['Row'];
type StaffInsert = Database['public']['Tables']['staff']['Insert'];

// === Casino DTOs ===

/** Public casino profile */
export type CasinoDTO = Pick<
  CasinoRow,
  'id' | 'name' | 'location' | 'status' | 'created_at'
>;

/** Casino creation input */
export type CreateCasinoDTO = Pick<
  CasinoInsert,
  'name' | 'location' | 'address' | 'company_id'
>;

/** Casino update input (all fields optional) */
export type UpdateCasinoDTO = Partial<CreateCasinoDTO>;

// === Casino Settings DTOs ===

/**
 * Public casino settings (excludes internal audit fields).
 *
 * ADR-031 unit annotations:
 * - `watchlist_floor`: MTL watchlist threshold in cents (default 300000 = $3,000)
 * - `ctr_threshold`: CTR reporting threshold in cents (default 1000000 = $10,000)
 */
export type CasinoSettingsDTO = Pick<
  CasinoSettingsRow,
  | 'id'
  | 'casino_id'
  | 'gaming_day_start_time'
  | 'timezone'
  | 'watchlist_floor'
  | 'ctr_threshold'
>;

/** Settings update input */
export type UpdateCasinoSettingsDTO = Partial<
  Pick<
    CasinoSettingsUpdate,
    'gaming_day_start_time' | 'timezone' | 'watchlist_floor' | 'ctr_threshold'
  >
>;

// === Staff DTOs ===

/** Public staff profile (excludes email for privacy) */
export type StaffDTO = Pick<
  StaffRow,
  | 'id'
  | 'first_name'
  | 'last_name'
  | 'role'
  | 'status'
  | 'employee_id'
  | 'casino_id'
>;

/** Staff creation input */
export type CreateStaffDTO = Pick<
  StaffInsert,
  | 'first_name'
  | 'last_name'
  | 'role'
  | 'employee_id'
  | 'email'
  | 'casino_id'
  | 'user_id'
>;

/** Staff update input (all fields optional except constraints) */
export type UpdateStaffDTO = Partial<
  Pick<
    StaffInsert,
    | 'first_name'
    | 'last_name'
    | 'role'
    | 'employee_id'
    | 'email'
    | 'casino_id'
    | 'user_id'
  >
> & {
  /** Staff status — included for claims lifecycle (AUTH-HARDENING WS3) */
  status?: 'active' | 'inactive';
};

// === Staff Invite DTOs (PRD-025) ===

type StaffInviteRow = Database['public']['Tables']['staff_invite']['Row'];

/** Staff invite public view (excludes token_hash for security) */
export type StaffInviteDTO = Pick<
  StaffInviteRow,
  | 'id'
  | 'casino_id'
  | 'email'
  | 'staff_role'
  | 'expires_at'
  | 'accepted_at'
  | 'created_at'
>;

/** Bootstrap casino RPC input */
export interface BootstrapCasinoInput {
  casino_name: string;
  timezone?: string;
  gaming_day_start?: string;
}

/** Bootstrap casino RPC result */
export interface BootstrapCasinoResult {
  casino_id: string;
  staff_id: string;
  staff_role: string;
}

/** Create staff invite input */
export interface CreateInviteInput {
  email: string;
  role: Database['public']['Enums']['staff_role'];
}

/** Create staff invite RPC result */
export interface CreateInviteResult {
  invite_id: string;
  raw_token: string;
  expires_at: string;
}

/** Accept staff invite input */
export interface AcceptInviteInput {
  token: string;
}

/** Accept staff invite RPC result */
export interface AcceptInviteResult {
  staff_id: string;
  casino_id: string;
  staff_role: string;
}

// === Gaming Day DTO ===

/**
 * Gaming day computation RPC response from compute_gaming_day.
 * This is the only manual interface as it represents an RPC response,
 * not a direct table mapping.
 */
export interface GamingDayDTO {
  /** ISO date string (YYYY-MM-DD) */
  gaming_day: string;
  /** Casino UUID */
  casino_id: string;
  /** ISO timestamp when computation occurred */
  computed_at: string;
  /** Casino timezone used for computation */
  timezone: string;
}

// === Filter Types (for query keys and HTTP fetchers) ===

/** Filters for casino list queries */
export type CasinoListFilters = {
  status?: 'active' | 'inactive';
  cursor?: string;
  limit?: number;
};

/** Filters for casino staff list queries */
export type CasinoStaffFilters = {
  status?: 'active' | 'inactive';
  role?: 'dealer' | 'pit_boss' | 'admin';
  cursor?: string;
  limit?: number;
};

// === Alert Threshold DTOs (PRD-LOYALTY-PROMO WS6) ===
//
// These interfaces represent JSONB configuration types stored in casino_settings.alert_thresholds.
// They are Pattern B exceptions (like GamingDayDTO) because they model JSONB column structure,
// not database row mappings.

/** Base interface for enabled/disabled thresholds */
export interface AlertThresholdConfig {
  enabled: boolean;
}

/** Table idle alerts: warn when table open but no activity */
export interface TableIdleThreshold extends AlertThresholdConfig {
  warn_minutes: number;
  critical_minutes: number;
}

/** Rating slip duration alerts: catch stale sessions */
export interface SlipDurationThreshold extends AlertThresholdConfig {
  warn_hours: number;
  critical_hours: number;
}

/** Pause duration alerts */
export interface PauseDurationThreshold extends AlertThresholdConfig {
  warn_minutes: number;
}

/** Drop anomaly detection using MAD (Median Absolute Deviation) */
export interface DropAnomalyThreshold extends AlertThresholdConfig {
  mad_multiplier: number;
  fallback_percent: number;
}

/** Hold deviation alerts (disabled by default until drop/win inputs trusted) */
export interface HoldDeviationThreshold extends AlertThresholdConfig {
  deviation_pp: number; // percentage points
  extreme_low: number;
  extreme_high: number;
}

/** Promo issuance spike detection */
export interface PromoIssuanceSpikeThreshold extends AlertThresholdConfig {
  mad_multiplier: number;
  fallback_percent: number;
}

/** Promo void rate alerts */
export interface PromoVoidRateThreshold extends AlertThresholdConfig {
  warn_percent: number;
}

/** Outstanding (uncleared) promo aging alerts */
export interface OutstandingAgingThreshold extends AlertThresholdConfig {
  max_age_hours: number;
  max_value_dollars: number;
  max_coupon_count: number;
}

/** Baseline configuration for statistical alerts */
export interface AlertBaselineConfig {
  window_days: number;
  method: 'median_mad' | 'mean_stddev';
  min_history_days: number;
}

/**
 * Alert thresholds JSONB configuration type.
 * Represents the structure of casino_settings.alert_thresholds column.
 * RPC response shape - manual interface allowed per SLAD exception.
 */
export interface AlertThresholdsDTO {
  table_idle: TableIdleThreshold;
  slip_duration: SlipDurationThreshold;
  pause_duration: PauseDurationThreshold;
  drop_anomaly: DropAnomalyThreshold;
  hold_deviation: HoldDeviationThreshold;
  promo_issuance_spike: PromoIssuanceSpikeThreshold;
  promo_void_rate: PromoVoidRateThreshold;
  outstanding_aging: OutstandingAgingThreshold;
  baseline: AlertBaselineConfig;
}

/**
 * Extended casino settings DTO including alert thresholds.
 * JSONB fields typed manually since Database types map them to generic Json.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Extends DB-derived type with JSONB structure
export type CasinoSettingsWithAlertsDTO = CasinoSettingsDTO & {
  alert_thresholds: AlertThresholdsDTO;
  promo_require_exact_match: boolean;
  promo_allow_anonymous_issuance: boolean;
};
