-- ============================================================================
-- Migration: ADR-033 Reward Catalog Domain Model Scaffolding (MVP)
-- Created: 2026-02-06
-- ADR Reference: docs/80-adrs/ADR-033-LOYALTY-REWARD-DOMAIN-MODEL-SCAFFOLDING-MVP.md
-- EXEC-SPEC: docs/20-architecture/specs/ADR-033/EXECUTION-SPEC-ADR-033.md
-- Owner: LoyaltyService
-- Purpose: Create reward catalog tables, RLS policies, and seed data.
--   Tables: reward_catalog, reward_price_points, reward_entitlement_tier,
--           reward_limits, reward_eligibility, loyalty_earn_config
--   Enum: reward_family
--   RLS: ADR-015 Pattern C hybrid (not ADR-030 critical tables)
-- Review: RLS_REVIEW_COMPLETE — ADR-015 Pattern C, role-gated writes, no ADR-030 D4 tables
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create Enum
-- ============================================================================

CREATE TYPE public.reward_family AS ENUM ('points_comp', 'entitlement');

COMMENT ON TYPE public.reward_family IS
  'ADR-033: Reward taxonomy families. points_comp = points-priced comps (ledger debit). entitlement = tier/limits-driven instruments (coupon issuance).';

-- ============================================================================
-- STEP 2: Create reward_catalog
-- ============================================================================

CREATE TABLE public.reward_catalog (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id   uuid        NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  code        text        NOT NULL,
  name        text        NOT NULL,
  family      reward_family NOT NULL,
  kind        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  fulfillment text        NULL CHECK (fulfillment IN ('immediate', 'voucher', 'external')),
  ui_tags     text[]      NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reward_catalog_casino_code_unique UNIQUE (casino_id, code)
);

COMMENT ON TABLE public.reward_catalog IS
  'ADR-033: Canonical list of rewards operators can browse and issue. LoyaltyService-owned.';

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.trg_reward_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reward_catalog_updated_at
  BEFORE UPDATE ON public.reward_catalog
  FOR EACH ROW EXECUTE FUNCTION public.trg_reward_catalog_updated_at();

-- ============================================================================
-- STEP 3: Create reward_price_points (1:1 with reward_catalog for points_comp)
-- ============================================================================

CREATE TABLE public.reward_price_points (
  reward_id       uuid    PRIMARY KEY REFERENCES public.reward_catalog(id) ON DELETE CASCADE,
  casino_id       uuid    NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  points_cost     int     NOT NULL CHECK (points_cost >= 0),
  allow_overdraw  boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE public.reward_price_points IS
  'ADR-033: Point pricing for points_comp rewards. 1:1 with reward_catalog. points_cost >= 0 (zero = complimentary, no debit). LoyaltyService-owned.';

-- ============================================================================
-- STEP 4: Create reward_entitlement_tier
-- ============================================================================

CREATE TABLE public.reward_entitlement_tier (
  id         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id  uuid  NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  reward_id  uuid  NOT NULL REFERENCES public.reward_catalog(id) ON DELETE CASCADE,
  tier       text  NOT NULL,
  benefit    jsonb NOT NULL,

  CONSTRAINT reward_entitlement_tier_unique UNIQUE (casino_id, reward_id, tier)
);

COMMENT ON TABLE public.reward_entitlement_tier IS
  'ADR-033: Tier-based benefit mapping for entitlement rewards. benefit JSONB e.g. {"face_value_cents": 2500, "instrument_type": "match_play"}. LoyaltyService-owned.';

-- ============================================================================
-- STEP 5: Create reward_limits
-- ============================================================================

CREATE TABLE public.reward_limits (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id        uuid    NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  reward_id        uuid    NOT NULL REFERENCES public.reward_catalog(id) ON DELETE CASCADE,
  scope            text    NOT NULL CHECK (scope IN ('per_visit', 'per_gaming_day', 'per_week', 'per_month')),
  max_issues       int     NOT NULL DEFAULT 1 CHECK (max_issues > 0),
  cooldown_minutes int     NULL,
  requires_note    boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE public.reward_limits IS
  'ADR-033: Issue frequency constraints for rewards. LoyaltyService-owned.';

-- ============================================================================
-- STEP 6: Create reward_eligibility
-- ============================================================================

CREATE TABLE public.reward_eligibility (
  id                 uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id          uuid   NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  reward_id          uuid   NOT NULL REFERENCES public.reward_catalog(id) ON DELETE CASCADE,
  min_tier           text   NULL,
  max_tier           text   NULL,
  min_points_balance int    NULL,
  visit_kinds        text[] NULL
);

COMMENT ON TABLE public.reward_eligibility IS
  'ADR-033: Minimal eligibility guardrails for reward issuance. LoyaltyService-owned.';

-- ============================================================================
-- STEP 7: Create loyalty_earn_config
-- ============================================================================

CREATE TABLE public.loyalty_earn_config (
  casino_id                uuid    PRIMARY KEY REFERENCES public.casino(id) ON DELETE CASCADE,
  points_per_theo          int     NOT NULL DEFAULT 10,
  default_point_multiplier numeric NOT NULL DEFAULT 1.0,
  rounding_policy          text    NOT NULL DEFAULT 'floor' CHECK (rounding_policy IN ('floor', 'nearest', 'ceil')),
  is_active                boolean NOT NULL DEFAULT true,
  effective_from           timestamptz NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.loyalty_earn_config IS
  'ADR-033: Casino-scoped configuration for point accrual. Upsert-friendly (PK = casino_id). LoyaltyService-owned.';

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.trg_loyalty_earn_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER loyalty_earn_config_updated_at
  BEFORE UPDATE ON public.loyalty_earn_config
  FOR EACH ROW EXECUTE FUNCTION public.trg_loyalty_earn_config_updated_at();

-- ============================================================================
-- STEP 8: Indexes
-- ============================================================================

-- Performance index for catalog browsing (filter by casino + active status)
DROP INDEX IF EXISTS idx_reward_catalog_casino_active;
CREATE INDEX idx_reward_catalog_casino_active
  ON public.reward_catalog (casino_id, is_active);

-- ============================================================================
-- STEP 9: Enable RLS on all tables
-- ============================================================================

ALTER TABLE public.reward_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_price_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_entitlement_tier ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_earn_config ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 10: RLS Policies — ADR-015 Pattern C hybrid
-- These tables are NOT ADR-030 D4 critical → COALESCE fallback is permitted
-- for all operations (SELECT and writes).
-- Policy naming: {table_name}_{operation}
-- Implementation: DROP IF EXISTS + CREATE for local re-run safety
-- ============================================================================

-- ── reward_catalog ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS reward_catalog_select ON public.reward_catalog;
CREATE POLICY reward_catalog_select ON public.reward_catalog
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
  );

DROP POLICY IF EXISTS reward_catalog_insert ON public.reward_catalog;
CREATE POLICY reward_catalog_insert ON public.reward_catalog
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS reward_catalog_update ON public.reward_catalog;
CREATE POLICY reward_catalog_update ON public.reward_catalog
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS reward_catalog_delete ON public.reward_catalog;
CREATE POLICY reward_catalog_delete ON public.reward_catalog
  FOR DELETE USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) = 'admin'
  );

-- ── reward_price_points ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS reward_price_points_select ON public.reward_price_points;
CREATE POLICY reward_price_points_select ON public.reward_price_points
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
  );

DROP POLICY IF EXISTS reward_price_points_insert ON public.reward_price_points;
CREATE POLICY reward_price_points_insert ON public.reward_price_points
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS reward_price_points_update ON public.reward_price_points;
CREATE POLICY reward_price_points_update ON public.reward_price_points
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS reward_price_points_delete ON public.reward_price_points;
CREATE POLICY reward_price_points_delete ON public.reward_price_points
  FOR DELETE USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

-- ── reward_entitlement_tier ─────────────────────────────────────────────────

DROP POLICY IF EXISTS reward_entitlement_tier_select ON public.reward_entitlement_tier;
CREATE POLICY reward_entitlement_tier_select ON public.reward_entitlement_tier
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
  );

DROP POLICY IF EXISTS reward_entitlement_tier_insert ON public.reward_entitlement_tier;
CREATE POLICY reward_entitlement_tier_insert ON public.reward_entitlement_tier
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS reward_entitlement_tier_update ON public.reward_entitlement_tier;
CREATE POLICY reward_entitlement_tier_update ON public.reward_entitlement_tier
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS reward_entitlement_tier_delete ON public.reward_entitlement_tier;
CREATE POLICY reward_entitlement_tier_delete ON public.reward_entitlement_tier
  FOR DELETE USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

-- ── reward_limits ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS reward_limits_select ON public.reward_limits;
CREATE POLICY reward_limits_select ON public.reward_limits
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
  );

DROP POLICY IF EXISTS reward_limits_insert ON public.reward_limits;
CREATE POLICY reward_limits_insert ON public.reward_limits
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS reward_limits_update ON public.reward_limits;
CREATE POLICY reward_limits_update ON public.reward_limits
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS reward_limits_delete ON public.reward_limits;
CREATE POLICY reward_limits_delete ON public.reward_limits
  FOR DELETE USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

-- ── reward_eligibility ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS reward_eligibility_select ON public.reward_eligibility;
CREATE POLICY reward_eligibility_select ON public.reward_eligibility
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
  );

DROP POLICY IF EXISTS reward_eligibility_insert ON public.reward_eligibility;
CREATE POLICY reward_eligibility_insert ON public.reward_eligibility
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS reward_eligibility_update ON public.reward_eligibility;
CREATE POLICY reward_eligibility_update ON public.reward_eligibility
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS reward_eligibility_delete ON public.reward_eligibility;
CREATE POLICY reward_eligibility_delete ON public.reward_eligibility
  FOR DELETE USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

-- ── loyalty_earn_config ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS loyalty_earn_config_select ON public.loyalty_earn_config;
CREATE POLICY loyalty_earn_config_select ON public.loyalty_earn_config
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
  );

DROP POLICY IF EXISTS loyalty_earn_config_insert ON public.loyalty_earn_config;
CREATE POLICY loyalty_earn_config_insert ON public.loyalty_earn_config
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) = 'admin'
  );

DROP POLICY IF EXISTS loyalty_earn_config_update ON public.loyalty_earn_config;
CREATE POLICY loyalty_earn_config_update ON public.loyalty_earn_config
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) = 'admin'
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) = 'admin'
  );

-- loyalty_earn_config: NO DELETE policy (admin manages via upsert only)

-- ============================================================================
-- STEP 11: Policy Documentation
-- ============================================================================

COMMENT ON POLICY reward_catalog_select ON public.reward_catalog IS
  'ADR-033: Pattern C hybrid SELECT — casino staff read. Not ADR-030 critical.';
COMMENT ON POLICY reward_catalog_insert ON public.reward_catalog IS
  'ADR-033: Pattern C hybrid INSERT — pit_boss/admin role-gated.';
COMMENT ON POLICY reward_catalog_update ON public.reward_catalog IS
  'ADR-033: Pattern C hybrid UPDATE — pit_boss/admin role-gated.';
COMMENT ON POLICY reward_catalog_delete ON public.reward_catalog IS
  'ADR-033: Pattern C hybrid DELETE — admin only. MVP hygiene; may move to soft-delete.';

COMMENT ON POLICY reward_price_points_select ON public.reward_price_points IS
  'ADR-033: Pattern C hybrid SELECT — casino staff read.';
COMMENT ON POLICY reward_price_points_insert ON public.reward_price_points IS
  'ADR-033: Pattern C hybrid INSERT — pit_boss/admin role-gated.';
COMMENT ON POLICY reward_price_points_update ON public.reward_price_points IS
  'ADR-033: Pattern C hybrid UPDATE — pit_boss/admin role-gated.';
COMMENT ON POLICY reward_price_points_delete ON public.reward_price_points IS
  'ADR-033: Pattern C hybrid DELETE — pit_boss/admin role-gated.';

COMMENT ON POLICY reward_entitlement_tier_select ON public.reward_entitlement_tier IS
  'ADR-033: Pattern C hybrid SELECT — casino staff read.';
COMMENT ON POLICY reward_entitlement_tier_insert ON public.reward_entitlement_tier IS
  'ADR-033: Pattern C hybrid INSERT — pit_boss/admin role-gated.';
COMMENT ON POLICY reward_entitlement_tier_update ON public.reward_entitlement_tier IS
  'ADR-033: Pattern C hybrid UPDATE — pit_boss/admin role-gated.';
COMMENT ON POLICY reward_entitlement_tier_delete ON public.reward_entitlement_tier IS
  'ADR-033: Pattern C hybrid DELETE — pit_boss/admin role-gated.';

COMMENT ON POLICY reward_limits_select ON public.reward_limits IS
  'ADR-033: Pattern C hybrid SELECT — casino staff read.';
COMMENT ON POLICY reward_limits_insert ON public.reward_limits IS
  'ADR-033: Pattern C hybrid INSERT — pit_boss/admin role-gated.';
COMMENT ON POLICY reward_limits_update ON public.reward_limits IS
  'ADR-033: Pattern C hybrid UPDATE — pit_boss/admin role-gated.';
COMMENT ON POLICY reward_limits_delete ON public.reward_limits IS
  'ADR-033: Pattern C hybrid DELETE — pit_boss/admin role-gated.';

COMMENT ON POLICY reward_eligibility_select ON public.reward_eligibility IS
  'ADR-033: Pattern C hybrid SELECT — casino staff read.';
COMMENT ON POLICY reward_eligibility_insert ON public.reward_eligibility IS
  'ADR-033: Pattern C hybrid INSERT — pit_boss/admin role-gated.';
COMMENT ON POLICY reward_eligibility_update ON public.reward_eligibility IS
  'ADR-033: Pattern C hybrid UPDATE — pit_boss/admin role-gated.';
COMMENT ON POLICY reward_eligibility_delete ON public.reward_eligibility IS
  'ADR-033: Pattern C hybrid DELETE — pit_boss/admin role-gated.';

COMMENT ON POLICY loyalty_earn_config_select ON public.loyalty_earn_config IS
  'ADR-033: Pattern C hybrid SELECT — casino staff read.';
COMMENT ON POLICY loyalty_earn_config_insert ON public.loyalty_earn_config IS
  'ADR-033: Pattern C hybrid INSERT — admin only.';
COMMENT ON POLICY loyalty_earn_config_update ON public.loyalty_earn_config IS
  'ADR-033: Pattern C hybrid UPDATE — admin only.';

-- ============================================================================
-- STEP 12: Seed Data (idempotent via ON CONFLICT ... DO NOTHING)
-- ============================================================================

-- Seed casino reference (first casino in the database)
DO $seed$
DECLARE
  v_casino_id uuid;
BEGIN
  SELECT id INTO v_casino_id FROM public.casino LIMIT 1;

  IF v_casino_id IS NULL THEN
    RAISE NOTICE 'ADR-033 seed: No casino found — skipping seed data';
    RETURN;
  END IF;

  -- ── Points Comps ──────────────────────────────────────────────────────

  INSERT INTO public.reward_catalog (casino_id, code, name, family, kind, is_active)
  VALUES
    (v_casino_id, 'COMP_MEAL_25',     'Meal Comp ($25)',       'points_comp', 'meal',     true),
    (v_casino_id, 'COMP_BEVERAGE_10', 'Beverage Comp ($10)',   'points_comp', 'beverage', true),
    (v_casino_id, 'COMP_MISC_15',     'Miscellaneous ($15)',   'points_comp', 'misc',     true)
  ON CONFLICT (casino_id, code) DO NOTHING;

  -- Price points for points comps (reference parent via subquery)
  INSERT INTO public.reward_price_points (reward_id, casino_id, points_cost, allow_overdraw)
  VALUES
    ((SELECT id FROM public.reward_catalog WHERE casino_id = v_casino_id AND code = 'COMP_MEAL_25'),     v_casino_id, 250, false),
    ((SELECT id FROM public.reward_catalog WHERE casino_id = v_casino_id AND code = 'COMP_BEVERAGE_10'), v_casino_id, 100, false),
    ((SELECT id FROM public.reward_catalog WHERE casino_id = v_casino_id AND code = 'COMP_MISC_15'),     v_casino_id, 150, false)
  ON CONFLICT (reward_id) DO NOTHING;

  -- ── Entitlements ──────────────────────────────────────────────────────

  INSERT INTO public.reward_catalog (casino_id, code, name, family, kind, is_active)
  VALUES
    (v_casino_id, 'MP_TIER_DAILY', 'Tier Match Play (Daily)', 'entitlement', 'match_play', true),
    (v_casino_id, 'FP_TIER_DAILY', 'Tier Free Play (Daily)',  'entitlement', 'free_play',  true)
  ON CONFLICT (casino_id, code) DO NOTHING;

  -- Tier benefits for entitlements (seed silver/gold/platinum tiers)
  INSERT INTO public.reward_entitlement_tier (casino_id, reward_id, tier, benefit)
  VALUES
    (v_casino_id, (SELECT id FROM public.reward_catalog WHERE casino_id = v_casino_id AND code = 'MP_TIER_DAILY'),
     'silver', '{"face_value_cents": 1000, "instrument_type": "match_play"}'::jsonb),
    (v_casino_id, (SELECT id FROM public.reward_catalog WHERE casino_id = v_casino_id AND code = 'MP_TIER_DAILY'),
     'gold',   '{"face_value_cents": 2500, "instrument_type": "match_play"}'::jsonb),
    (v_casino_id, (SELECT id FROM public.reward_catalog WHERE casino_id = v_casino_id AND code = 'MP_TIER_DAILY'),
     'platinum', '{"face_value_cents": 5000, "instrument_type": "match_play"}'::jsonb),
    (v_casino_id, (SELECT id FROM public.reward_catalog WHERE casino_id = v_casino_id AND code = 'FP_TIER_DAILY'),
     'silver', '{"face_value_cents": 500, "instrument_type": "free_play"}'::jsonb),
    (v_casino_id, (SELECT id FROM public.reward_catalog WHERE casino_id = v_casino_id AND code = 'FP_TIER_DAILY'),
     'gold',   '{"face_value_cents": 1500, "instrument_type": "free_play"}'::jsonb),
    (v_casino_id, (SELECT id FROM public.reward_catalog WHERE casino_id = v_casino_id AND code = 'FP_TIER_DAILY'),
     'platinum', '{"face_value_cents": 3000, "instrument_type": "free_play"}'::jsonb)
  ON CONFLICT (casino_id, reward_id, tier) DO NOTHING;

  -- Limits for entitlements (1 per gaming day)
  INSERT INTO public.reward_limits (casino_id, reward_id, scope, max_issues)
  VALUES
    (v_casino_id, (SELECT id FROM public.reward_catalog WHERE casino_id = v_casino_id AND code = 'MP_TIER_DAILY'),
     'per_gaming_day', 1),
    (v_casino_id, (SELECT id FROM public.reward_catalog WHERE casino_id = v_casino_id AND code = 'FP_TIER_DAILY'),
     'per_gaming_day', 1)
  -- No unique constraint on reward_limits, so guard with subquery
  ON CONFLICT DO NOTHING;

  -- ── Earn Config ───────────────────────────────────────────────────────

  INSERT INTO public.loyalty_earn_config (casino_id, points_per_theo, default_point_multiplier, rounding_policy, is_active)
  VALUES (v_casino_id, 10, 1.0, 'floor', true)
  ON CONFLICT (casino_id) DO NOTHING;

END
$seed$;

-- ============================================================================
-- PostgREST schema reload
-- ============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;
