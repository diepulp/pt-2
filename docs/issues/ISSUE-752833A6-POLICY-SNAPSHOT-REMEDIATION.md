# ISSUE-752833A6: Rating Slip policy_snapshot Not Populated - Remediation Strategy

**Status:** Investigating
**Severity:** HIGH
**Created:** 2025-12-27
**Category:** Bug
**Services:** RatingSlipService, LoyaltyService

---

## Executive Summary

**Root Cause Confirmed**: `rpc_start_rating_slip` (SEC-007 migration, line 178-186) creates rating slips with `policy_snapshot = NULL`. The RPC inserts only `game_settings` but never constructs the required `policy_snapshot.loyalty` structure that `rpc_accrue_on_close` mandates per ADR-019 D2.

**Impact**: Players earn zero loyalty points for play sessions because base accrual fails silently with `LOYALTY_SNAPSHOT_MISSING` error.

---

## Problem Statement

When rating slips are closed, the `policy_snapshot` field remains NULL instead of being populated with loyalty configuration from `game_settings` table. This prevents `rpc_accrue_on_close` from calculating loyalty points, causing loyalty accrual to fail silently.

### Evidence

| Player | Rating Slip ID | policy_snapshot | Expected |
|--------|----------------|-----------------|----------|
| Test EnrollFix | `a02467a1-3b75-4a71-b64d-10a2c010c8d3` | `NULL` | `{loyalty: {...}}` |

### Error Chain

```
1. Pit boss creates rating slip via POST /api/v1/rating-slips
   -> rpc_start_rating_slip executes
   -> INSERT omits policy_snapshot column
   -> rating_slip.policy_snapshot = NULL

2. Pit boss closes slip via POST /api/v1/rating-slips/{id}/close
   -> rpc_close_rating_slip executes
   -> Slip status = 'closed', duration calculated

3. System triggers loyalty accrual
   -> rpc_accrue_on_close executes
   -> v_loyalty_snapshot := v_slip.policy_snapshot->'loyalty'
   -> v_loyalty_snapshot IS NULL
   -> RAISE EXCEPTION 'LOYALTY_SNAPSHOT_MISSING'
   -> HTTP 400 returned, no points minted
```

---

## Investigation Findings

### 1. RPC Analysis: rpc_accrue_on_close

**Location**: `supabase/migrations/20251221173703_prd015_ws2_loyalty_rpcs_self_injection.sql:148-154`

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- CANONICAL SOURCE: policy_snapshot.loyalty (ADR-019 D2)
-- ═══════════════════════════════════════════════════════════════════════
v_loyalty_snapshot := v_slip.policy_snapshot->'loyalty';

IF v_loyalty_snapshot IS NULL THEN
  RAISE EXCEPTION 'LOYALTY_SNAPSHOT_MISSING: Rating slip lacks policy_snapshot.loyalty';
END IF;
```

**Assessment**: The RPC correctly validates - it's designed to require the snapshot. The issue is upstream.

### 2. Gap Location: rpc_start_rating_slip

**Location**: `supabase/migrations/20251212081000_sec007_rating_slip_rpc_hardening.sql:178-186`

```sql
INSERT INTO rating_slip (
  casino_id, visit_id, table_id,
  seat_number, game_settings, status, start_time
  -- policy_snapshot MISSING FROM INSERT
)
VALUES (
  p_casino_id, p_visit_id, p_table_id,
  p_seat_number, p_game_settings, 'open', now()
  -- policy_snapshot NOT POPULATED
)
```

### 3. ADR-019 D2 Requirement (Violated)

> **"Responsibility: RatingSlip/Visit flow must populate the snapshot at slip creation/open (or at least before close)."**

**Required `policy_snapshot.loyalty` Structure** (per ADR-019):
```json
{
  "loyalty": {
    "house_edge": 1.5,
    "decisions_per_hour": 60,
    "points_conversion_rate": 10.0,
    "point_multiplier": 1.0,
    "policy_version": "loyalty_points_v1"
  }
}
```

> **Immutability Principle**: Snapshot ALL parameters that could affect accrual calculation, even if unused today. Future tiering/bonusing may depend on `point_multiplier`.

### 4. Data Sources Available

**game_settings table** (`supabase/migrations/20251126131051_game_settings_theo_fields.sql`):

| Column | Type | Default |
|--------|------|---------|
| `house_edge` | numeric | 1.5 |
| `decisions_per_hour` | int | 70 |
| `points_conversion_rate` | numeric | 10.0 |
| `point_multiplier` | numeric | 1.0 |

These values exist but are never copied into `policy_snapshot.loyalty`.

### 5. RLS Expert Assessment

| Aspect | Finding |
|--------|---------|
| **RPC Security Model** | Correct - SECURITY DEFINER with Template 5 validation (SEC-007) |
| **Casino Scope Validation** | Correct - context validation implemented |
| **Snapshot Population** | **NOT an RLS issue** - it's a business logic gap |
| **game_settings Access** | game_settings is passed as parameter, available for snapshot construction |

**Best Practice**: Snapshots should be populated at **creation time** (not close time) to ensure immutability and prevent retroactive calculation changes if `game_settings` table values change.

---

## Affected Components

### Database Layer

| File | Line | Issue |
|------|------|-------|
| `supabase/migrations/20251212081000_sec007_rating_slip_rpc_hardening.sql` | 178-186 | INSERT omits policy_snapshot |
| `supabase/migrations/00000000000000_baseline_srm.sql` | 148-160 | Schema defines field but no default |

### Service Layer

| File | Issue |
|------|-------|
| `services/rating-slip/crud.ts` | Passes game_settings but no snapshot construction |
| `services/loyalty/crud.ts` | Error mapping for LOYALTY_SNAPSHOT_MISSING exists |

### API Layer

| File | Issue |
|------|-------|
| `app/api/v1/rating-slips/[id]/close/route.ts` | Close succeeds but accrual fails |

---

## Remediation Strategy

### Option A: Modify `rpc_start_rating_slip` (RECOMMENDED)

**Rationale**:
- ADR-019 specifies snapshot must be populated at "slip creation/open"
- Immutability principle: snapshot policy at creation, not at close
- Minimal blast radius: single RPC change

### Option B: Lookup from `game_settings` Table (RECOMMENDED)

**Rationale**: `game_settings` table is the canonical source of truth for loyalty policy. Callers should not define policy ad-hoc.

### ⚠️ Footgun Warning: `p_game_settings` as Primary Source

If `p_game_settings` is allowed to override policy values:
- **Non-determinism**: Same game type could yield different policy values depending on caller
- **No single source of truth**: Policy scattered across callers instead of centralized in `game_settings`
- **Audit difficulty**: Harder to answer "why did this slip get these values?"

### Recommended Approach: Table-Authoritative with Audit Trail

Priority chain (INVERTED from naive approach):
1. **`game_settings` table lookup** (canonical source via `table_id` → `game_type_id`)
2. Fallback to hardcoded defaults (from migration 20251126131051)
3. `p_game_settings` is **NOT used for policy values** - it's for runtime game state (average_bet, etc.)

If business requires caller overrides in future, gate behind explicit flag and log prominently.

### Audit Trail Enhancement

Source tracking is embedded in `policy_snapshot._source` AND logged to `audit_log.details`:

**In `policy_snapshot` (immutable on the slip):**
```json
{
  "loyalty": {
    "house_edge": 1.5,
    "decisions_per_hour": 70,
    "points_conversion_rate": 10.0,
    "point_multiplier": 1.0,
    "policy_version": "loyalty_points_v1"
  },
  "_source": {
    "house_edge": "game_settings",
    "decisions_per_hour": "game_settings",
    "points_conversion_rate": "default",
    "point_multiplier": "game_settings"
  }
}
```

**In `audit_log.details` (queryable):**
```json
{
  "rating_slip_id": "uuid",
  "policy_snapshot_populated": true,
  "policy_snapshot_source": { "house_edge": "game_settings", ... },
  "policy_values": { "house_edge": 1.5, ... }
}
```

This makes debugging trivial: "Where did 1.5 house_edge come from?" → Query `_source.house_edge` on the slip or audit log.

---

## Defense in Depth: Conditional CHECK Constraint

**Problem**: The current failure occurs at close time (`rpc_accrue_on_close` raises `LOYALTY_SNAPSHOT_MISSING`). This is too late - the bad row already exists.

**Complication (ADR-014)**: Blanket enforcement would break **ghost gaming visits**. Per ADR-014, these are compliance-only slips that must NEVER accrue loyalty:

| Visit Kind | `player_id` | Loyalty Eligible | `policy_snapshot.loyalty` |
|------------|-------------|------------------|---------------------------|
| `gaming_identified_rated` | Required | Yes | **Required** |
| `gaming_ghost_unrated` | NULL | No | Must be absent or ignored |
| `reward_identified` | Required | N/A (no gaming) | N/A (no rating slips) |

Current runtime guard (`rpc_accrue_on_close` line 125-127) checks `player_id IS NULL` to exclude ghost visits. But this is late - we want schema-level enforcement.

### The Clean Pattern: Explicit Discriminator + Conditional Constraint

Add an explicit column on `rating_slip` to declare intent:

```sql
-- Option 1: Boolean (simpler)
ALTER TABLE rating_slip ADD COLUMN accrues_loyalty boolean NOT NULL DEFAULT true;

-- Option 2: Enum (more extensible)
CREATE TYPE accrual_kind AS ENUM ('loyalty', 'compliance_only');
ALTER TABLE rating_slip ADD COLUMN accrual_kind accrual_kind NOT NULL DEFAULT 'loyalty';
```

Then enforce conditionally:

```sql
-- If loyalty-eligible, MUST have policy_snapshot.loyalty
-- If compliance-only, policy_snapshot.loyalty is optional/forbidden
ALTER TABLE rating_slip
ADD CONSTRAINT chk_policy_snapshot_conditional
CHECK (
  CASE
    WHEN accrual_kind = 'loyalty' THEN policy_snapshot ? 'loyalty'
    WHEN accrual_kind = 'compliance_only' THEN true  -- No loyalty snapshot required
    ELSE false
  END
);
```

### Why Explicit Discriminator > Inferring from `player_id`

| Approach | Problem |
|----------|---------|
| Infer from `player_id IS NULL` | Future: identified player opts out of loyalty? Doesn't fit. |
| Infer from `visit.visit_kind` | Cross-table dependency, harder to enforce at INSERT |
| **Explicit `accrual_kind`** | Self-documenting, enforced at row level, future-proof |

### Recommended Schema Change

```sql
-- Add discriminator with safe default for existing rows
ALTER TABLE rating_slip
ADD COLUMN accrual_kind text NOT NULL DEFAULT 'loyalty'
CHECK (accrual_kind IN ('loyalty', 'compliance_only'));

-- Conditional constraint: loyalty slips MUST have snapshot
ALTER TABLE rating_slip
ADD CONSTRAINT chk_policy_snapshot_if_loyalty
CHECK (
  accrual_kind != 'loyalty' OR policy_snapshot ? 'loyalty'
);

COMMENT ON COLUMN rating_slip.accrual_kind IS
  'ADR-014: Explicit discriminator. "loyalty" requires policy_snapshot.loyalty. "compliance_only" is for ghost gaming (MTL/finance only).';
```

### Update `rpc_start_rating_slip` to Set Discriminator

```sql
-- In rpc_start_rating_slip, determine accrual_kind from visit
SELECT v.visit_kind INTO v_visit_kind
FROM visit v WHERE v.id = p_visit_id;

v_accrual_kind := CASE
  WHEN v_visit_kind = 'gaming_ghost_unrated' THEN 'compliance_only'
  ELSE 'loyalty'
END;

-- Then in INSERT:
INSERT INTO rating_slip (
  ..., accrual_kind, policy_snapshot, ...
) VALUES (
  ..., v_accrual_kind,
  CASE WHEN v_accrual_kind = 'loyalty' THEN v_policy_snapshot ELSE NULL END,
  ...
);
```

### Migration Sequence (Dev)

1. Add `accrual_kind` column with default `'loyalty'`
2. Deploy RPC fix (sets discriminator + conditional snapshot)
3. Clean up orphaned dev data
4. Add conditional CHECK constraint

> **Shift Left Principle**: Catch errors at INSERT time. A rejected write is better than a silent loyalty failure discovered at close.

---

## Migration Plan

### Phase 1: Database Migration (Immediate Fix)

**Migration Name**: `20251227XXXXXX_fix_policy_snapshot_population.sql`

```sql
-- Migration: Fix policy_snapshot population in rpc_start_rating_slip
-- Issue: ISSUE-752833A6
-- Problem: policy_snapshot never populated, blocking loyalty accrual
-- Solution: Construct policy_snapshot.loyalty from game_settings at slip creation
-- Reference: ADR-019 D2

BEGIN;

CREATE OR REPLACE FUNCTION rpc_start_rating_slip(
  p_casino_id UUID,
  p_visit_id UUID,
  p_table_id UUID,
  p_seat_number TEXT,
  p_game_settings JSONB,
  p_actor_id UUID
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_result rating_slip;
  v_player_id UUID;
  v_policy_snapshot JSONB;
  v_game_settings_lookup RECORD;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-007)
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;
  -- ═══════════════════════════════════════════════════════════════════════

  -- Validate visit is open and get player_id for audit
  SELECT player_id INTO v_player_id
  FROM visit
  WHERE id = p_visit_id
    AND casino_id = p_casino_id
    AND ended_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_OPEN: Visit % is not active', p_visit_id;
  END IF;

  -- Validate table is active
  IF NOT EXISTS (
    SELECT 1 FROM gaming_table
    WHERE id = p_table_id
      AND casino_id = p_casino_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'TABLE_NOT_ACTIVE: Table % is not active', p_table_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- BUILD POLICY_SNAPSHOT (ISSUE-752833A6 Fix, ADR-019 D2)
  -- ═══════════════════════════════════════════════════════════════════════
  -- TABLE-AUTHORITATIVE: game_settings table is canonical source
  -- p_game_settings is for runtime state (average_bet), NOT policy values
  -- Priority: 1) game_settings table, 2) hardcoded defaults

  -- Lookup from game_settings table via table's game type (AUTHORITATIVE)
  SELECT gs.house_edge, gs.decisions_per_hour, gs.points_conversion_rate, gs.point_multiplier
  INTO v_game_settings_lookup
  FROM gaming_table gt
  LEFT JOIN game_settings gs ON gs.game_type_id = gt.game_type_id
                             AND gs.casino_id = p_casino_id
  WHERE gt.id = p_table_id;

  -- Build snapshot from canonical sources only (NO p_game_settings for policy)
  v_policy_snapshot := jsonb_build_object(
    'loyalty', jsonb_build_object(
      'house_edge', COALESCE(v_game_settings_lookup.house_edge, 1.5),
      'decisions_per_hour', COALESCE(v_game_settings_lookup.decisions_per_hour, 70),
      'points_conversion_rate', COALESCE(v_game_settings_lookup.points_conversion_rate, 10.0),
      'point_multiplier', COALESCE(v_game_settings_lookup.point_multiplier, 1.0),
      'policy_version', 'loyalty_points_v1'
    ),
    '_source', jsonb_build_object(
      'house_edge', CASE WHEN v_game_settings_lookup.house_edge IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'decisions_per_hour', CASE WHEN v_game_settings_lookup.decisions_per_hour IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'points_conversion_rate', CASE WHEN v_game_settings_lookup.points_conversion_rate IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'point_multiplier', CASE WHEN v_game_settings_lookup.point_multiplier IS NOT NULL THEN 'game_settings' ELSE 'default' END
    )
  );
  -- ═══════════════════════════════════════════════════════════════════════

  -- Create slip with policy_snapshot (ISSUE-752833A6 fix)
  INSERT INTO rating_slip (
    casino_id, visit_id, table_id,
    seat_number, game_settings, policy_snapshot, status, start_time
  )
  VALUES (
    p_casino_id, p_visit_id, p_table_id,
    p_seat_number, p_game_settings, v_policy_snapshot, 'open', now()
  )
  RETURNING * INTO v_result;

  -- Audit log with policy source tracking (debugging: "where did these values come from?")
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating-slip',
    p_actor_id,
    'start_rating_slip',
    jsonb_build_object(
      'rating_slip_id', v_result.id,
      'visit_id', p_visit_id,
      'player_id', v_player_id,
      'table_id', p_table_id,
      'policy_snapshot_populated', true,
      'policy_snapshot_source', v_policy_snapshot->'_source',
      'policy_values', v_policy_snapshot->'loyalty'
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_start_rating_slip(UUID, UUID, UUID, TEXT, JSONB, UUID) IS
  'Creates new rating slip for active visit/table. SEC-007 hardened with Template 5 context validation. ISSUE-752833A6: Now populates policy_snapshot.loyalty from game_settings for ADR-019 D2 compliance.';

NOTIFY pgrst, 'reload schema';

COMMIT;
```

### Phase 2: Clean Up Dev Data (Optional)

Dev environment only - historical data is irrelevant. Delete or ignore orphaned slips:

```sql
-- Option A: Delete closed slips with NULL snapshot (dev only)
DELETE FROM rating_slip WHERE policy_snapshot IS NULL AND status = 'closed';

-- Option B: Just verify none remain after testing
SELECT COUNT(*) FROM rating_slip WHERE policy_snapshot IS NULL;
```

> **Production note**: If this ever reaches prod with historical data, a backfill strategy would be needed. For now, YAGNI.

### Phase 3: TypeScript Service Layer

**No changes required** - the service already passes `game_settings` to the RPC. The RPC now constructs `policy_snapshot` internally.

---

## Verification Plan

### 1. Unit Test: New Slip Has Snapshot

```sql
-- After migration, verify new slips get policy_snapshot
SELECT
  id,
  policy_snapshot->'loyalty' IS NOT NULL AS has_loyalty_snapshot,
  policy_snapshot->'loyalty'->>'policy_version' AS version
FROM rating_slip
WHERE created_at > '2025-12-27'::date;
```

### 2. Integration Test: Accrual Succeeds

```typescript
// Test that close + accrue workflow completes
const slip = await ratingSlipService.start({
  visit_id,
  table_id,
  game_settings: { house_edge: 1.5 }
});

await ratingSlipService.close(slip.id, { average_bet: 100 });

const result = await loyaltyService.accrueOnClose(slip.id);
expect(result.base_points).toBeGreaterThanOrEqual(0);
expect(result.theo).toBeGreaterThan(0);
```

### 3. E2E Test: Player Loyalty Record Created

```sql
-- After closing a slip, player_loyalty should exist with points
SELECT
  pl.player_id,
  pl.current_balance,
  ll.points_delta,
  ll.reason,
  ll.metadata->'calc'->>'theo' AS theo
FROM player_loyalty pl
JOIN loyalty_ledger ll ON ll.player_id = pl.player_id
WHERE ll.rating_slip_id = 'the-slip-id'
  AND ll.reason = 'base_accrual';
```

### 4. Regression Check: SEC-007 Validation Still Works

```sql
-- Should fail with casino mismatch
SELECT set_rls_context(
  'actor-id'::uuid,
  'correct-casino-id'::uuid,
  'pit_boss'
);

SELECT rpc_start_rating_slip(
  'wrong-casino-id'::uuid,  -- Different casino
  'visit-id'::uuid,
  'table-id'::uuid,
  '1',
  '{}'::jsonb,
  'actor-id'::uuid
);
-- Expected: 'casino_id mismatch: caller provided ... but context is ...'
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| game_settings lookup fails | Low | Low | Fallback chain with hardcoded defaults |
| RPC signature change | None | None | Same parameters, only internal logic |
| Existing tests break | Medium | Low | Update fixtures to include policy_snapshot |
| Performance impact | Low | Low | Single additional JOIN, indexed columns |

---

## References

| Document | Location | Relevance |
|----------|----------|-----------|
| **ADR-014** | `docs/80-adrs/ADR-014-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md` | Ghost visits excluded from loyalty; `visit_kind` archetypes |
| **ADR-019 v2** | `docs/80-adrs/ADR-019-loyalty-points-policy_v2.md` | D2: Canonical snapshot source requirement |
| **PRD-004** | `docs/10-prd/PRD-004-loyalty-service.md` | FR-1: Base accrual from policy_snapshot |
| **SEC-007** | `supabase/migrations/20251212081000_sec007_*.sql` | Rating slip RPC hardening |
| **Ghost Guard** | `supabase/migrations/20251216073543_adr014_ghost_visit_loyalty_guard.sql` | Runtime guard for ghost visits |
| **SRM** | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | RatingSlipService schema invariants |
| **LoyaltyService Vision** | `docs/00-vision/LoyaltyService_Points_Policy_PT-2.md` | Snapshot immutability principle |

---

## Summary

| Aspect | Status |
|--------|--------|
| **Root Cause** | `rpc_start_rating_slip` omits `policy_snapshot` from INSERT |
| **ADR Violation** | ADR-019 D2 requires snapshot at creation |
| **Fix Location** | RPC modification + `accrual_kind` discriminator column |
| **Blast Radius** | Low - isolated to rating slip creation flow |
| **RLS Impact** | None - SEC-007 validation preserved |
| **Security Impact** | None - existing context validation unchanged |
| **TypeScript Changes** | None required |
| **Regression Prevention** | Conditional CHECK: `accrual_kind = 'loyalty'` → requires `policy_snapshot ? 'loyalty'` |
| **Ghost Visit Support** | ADR-014 compliant: `accrual_kind = 'compliance_only'` for ghost gaming (no loyalty snapshot) |

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2025-12-27 | Investigation Team | Initial investigation and remediation strategy |
| 2025-12-27 | Investigation Team | Added `point_multiplier` to snapshot schema (immutability principle: capture all accrual parameters) |
| 2025-12-27 | Investigation Team | Added CHECK constraint strategy (shift left: fail at INSERT, not at close) |
| 2025-12-27 | Investigation Team | Changed to table-authoritative model: `game_settings` table is canonical, `p_game_settings` excluded from policy values. Added `_source` tracking for audit trail. |
| 2025-12-27 | Investigation Team | Simplified Phase 2: removed backfill complexity (dev environment, historical data irrelevant) |
| 2025-12-27 | Investigation Team | Conditional enforcement: Added `accrual_kind` discriminator pattern per ADR-014. Ghost gaming slips (`compliance_only`) don't require loyalty snapshot. |
