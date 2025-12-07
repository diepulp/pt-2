/**
 * CasinoService Select Projections
 *
 * Named column sets for Supabase queries.
 * Prevents over-fetching and maintains consistent field exposure.
 *
 * @see SLAD §327 - Named column sets
 * @see SPEC-PRD-000-casino-foundation.md section 4.1
 */

// === Casino Selects ===

/** Minimal casino fields for list views */
export const CASINO_SELECT_MIN = 'id, name, status, created_at' as const;

/** Public casino profile (excludes address for list views) */
export const CASINO_SELECT_PUBLIC =
  'id, name, location, status, created_at' as const;

/** Full casino record (for detail views) */
export const CASINO_SELECT_FULL =
  'id, name, location, address, company_id, status, created_at' as const;

// === Casino Settings Selects ===

/** Public casino settings (excludes audit timestamps) */
export const CASINO_SETTINGS_SELECT =
  'id, casino_id, gaming_day_start_time, timezone, watchlist_floor, ctr_threshold' as const;

/** Full casino settings (includes audit fields) */
export const CASINO_SETTINGS_SELECT_FULL =
  'id, casino_id, gaming_day_start_time, timezone, watchlist_floor, ctr_threshold, created_at, updated_at' as const;

// === Staff Selects ===

/** Public staff profile (excludes email for privacy) */
export const STAFF_SELECT_PUBLIC =
  'id, first_name, last_name, role, status, employee_id, casino_id' as const;

/** Public staff profile with created_at for paginated list queries */
export const STAFF_SELECT_PUBLIC_LIST =
  'id, first_name, last_name, role, status, employee_id, casino_id, created_at' as const;

/** Staff with user linkage (for auth checks) */
export const STAFF_SELECT_WITH_USER =
  'id, first_name, last_name, role, status, employee_id, casino_id, user_id' as const;

/** Full staff record (admin views only) */
export const STAFF_SELECT_FULL =
  'id, first_name, last_name, role, status, employee_id, email, casino_id, user_id, created_at' as const;
