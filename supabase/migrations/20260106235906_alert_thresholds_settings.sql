-- =====================================================
-- Migration: Alert Thresholds Configuration
-- Created: 2026-01-06 23:59:06
-- PRD: PRD-LOYALTY-PROMO (WS6)
-- Spec: SHIFT_DASHBOARDS_V0_ALERT_THRESHOLDS_BASELINES_PATCH.md
-- Purpose: Add alert_thresholds JSONB column to casino_settings
-- =====================================================
-- This migration adds:
--   1. alert_thresholds JSONB column to casino_settings
--   2. Default v0 alert pack configuration
--
-- Ownership: CasinoService (settings schema)
-- Consumers: LoyaltyService, Dashboards (read-only)
-- =====================================================

BEGIN;

-- ============================================================================
-- STEP 1: Add alert_thresholds column with v0 defaults
-- ============================================================================

ALTER TABLE public.casino_settings
ADD COLUMN IF NOT EXISTS alert_thresholds jsonb NOT NULL DEFAULT '{
  "table_idle": {
    "warn_minutes": 20,
    "critical_minutes": 45,
    "enabled": true
  },
  "slip_duration": {
    "warn_hours": 4,
    "critical_hours": 8,
    "enabled": true
  },
  "pause_duration": {
    "warn_minutes": 30,
    "enabled": true
  },
  "drop_anomaly": {
    "mad_multiplier": 3,
    "fallback_percent": 50,
    "enabled": true
  },
  "hold_deviation": {
    "deviation_pp": 10,
    "extreme_low": -5,
    "extreme_high": 40,
    "enabled": false
  },
  "promo_issuance_spike": {
    "mad_multiplier": 3,
    "fallback_percent": 100,
    "enabled": true
  },
  "promo_void_rate": {
    "warn_percent": 5,
    "enabled": true
  },
  "outstanding_aging": {
    "max_age_hours": 24,
    "max_value_dollars": 2000,
    "max_coupon_count": 25,
    "enabled": true
  },
  "baseline": {
    "window_days": 7,
    "method": "median_mad",
    "min_history_days": 3
  }
}'::jsonb;

COMMENT ON COLUMN public.casino_settings.alert_thresholds IS
  'Casino-scoped operational alert thresholds for shift dashboards. '
  'Presentation/ops controls only - no accounting/AGR/tax policy. '
  'See docs/00-vision/loyalty-service-extension/SHIFT_DASHBOARDS_V0_ALERT_THRESHOLDS_BASELINES_PATCH.md';

-- ============================================================================
-- STEP 2: Add promo policy controls (if not already present)
-- ============================================================================

-- promo_require_exact_match: Whether match play requires exact wager match
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'casino_settings'
      AND column_name = 'promo_require_exact_match'
  ) THEN
    ALTER TABLE public.casino_settings
    ADD COLUMN promo_require_exact_match boolean NOT NULL DEFAULT true;

    COMMENT ON COLUMN public.casino_settings.promo_require_exact_match IS
      'PRD-LOYALTY-PROMO: If true, match play requires exact wager match. If false, any wager >= required is valid.';
  END IF;
END $$;

-- promo_allow_anonymous_issuance: Whether coupons can be issued without a player
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'casino_settings'
      AND column_name = 'promo_allow_anonymous_issuance'
  ) THEN
    ALTER TABLE public.casino_settings
    ADD COLUMN promo_allow_anonymous_issuance boolean NOT NULL DEFAULT true;

    COMMENT ON COLUMN public.casino_settings.promo_allow_anonymous_issuance IS
      'PRD-LOYALTY-PROMO: If true, promotional coupons can be issued without linking to a player.';
  END IF;
END $$;

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;
