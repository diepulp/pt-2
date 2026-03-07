-- ADR-039 D4: Loyalty measurement schema
-- Bounded context: LoyaltyService (Reward)
-- Tables: loyalty_valuation_policy, loyalty_liability_snapshot

-- ============================================================
-- Table 1: loyalty_valuation_policy
-- ============================================================

CREATE TABLE IF NOT EXISTS loyalty_valuation_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES casino(id),
  cents_per_point numeric NOT NULL CHECK (cents_per_point > 0),
  effective_date date NOT NULL,
  version_identifier text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_by_staff_id uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One active policy per casino (partial unique index — no btree_gist extension needed)
-- DA P1-1 fix: replaced EXCLUDE constraint with partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_policy_per_casino
  ON loyalty_valuation_policy (casino_id) WHERE (is_active = true);

-- NOTE: Policy semantics — treat (casino_id, effective_date) as a real-world validity axis.
-- Post-MVP: consider UNIQUE (casino_id, effective_date, version_identifier) to prevent duplicates.

-- ============================================================
-- Table 2: loyalty_liability_snapshot
-- ============================================================

CREATE TABLE IF NOT EXISTS loyalty_liability_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES casino(id),
  snapshot_date date NOT NULL,
  total_outstanding_points bigint NOT NULL,
  estimated_monetary_value_cents bigint NOT NULL,
  valuation_policy_version text NOT NULL,
  valuation_effective_date date NOT NULL,
  player_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, snapshot_date)
);

-- ============================================================
-- RLS: loyalty_valuation_policy
-- ============================================================

ALTER TABLE loyalty_valuation_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_valuation_policy FORCE ROW LEVEL SECURITY;

-- Pattern C SELECT: all authenticated staff within casino
DROP POLICY IF EXISTS "loyalty_valuation_policy_select_casino_scoped" ON loyalty_valuation_policy;
CREATE POLICY "loyalty_valuation_policy_select_casino_scoped"
  ON loyalty_valuation_policy
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      ((current_setting('request.jwt.claims', true)::jsonb) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Write policy: pit_boss/admin only (ADR-030 session var enforcement)
DROP POLICY IF EXISTS "loyalty_valuation_policy_insert_admin" ON loyalty_valuation_policy;
CREATE POLICY "loyalty_valuation_policy_insert_admin"
  ON loyalty_valuation_policy
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      ((current_setting('request.jwt.claims', true)::jsonb) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS "loyalty_valuation_policy_update_admin" ON loyalty_valuation_policy;
CREATE POLICY "loyalty_valuation_policy_update_admin"
  ON loyalty_valuation_policy
  FOR UPDATE TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      ((current_setting('request.jwt.claims', true)::jsonb) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      ((current_setting('request.jwt.claims', true)::jsonb) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')
  );

-- ============================================================
-- RLS: loyalty_liability_snapshot
-- ============================================================

ALTER TABLE loyalty_liability_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_liability_snapshot FORCE ROW LEVEL SECURITY;

-- Pattern C SELECT: all authenticated staff within casino
DROP POLICY IF EXISTS "loyalty_liability_snapshot_select_casino_scoped" ON loyalty_liability_snapshot;
CREATE POLICY "loyalty_liability_snapshot_select_casino_scoped"
  ON loyalty_liability_snapshot
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      ((current_setting('request.jwt.claims', true)::jsonb) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- No direct write policies on loyalty_liability_snapshot
-- Writes happen exclusively via rpc_snapshot_loyalty_liability (SECURITY DEFINER, WS4)

NOTIFY pgrst, 'reload schema';
