---
issue: ISSUE-752833A6
title: Policy Snapshot Remediation
service: RatingSlipService
phase: Immediate Fix
workstreams:
  WS1:
    name: Database Migration - RPC Fix + Read Path Hardening
    agent: rls-expert
    depends_on: []
    outputs:
      - supabase/migrations/YYYYMMDDXXXXXX_fix_policy_snapshot_population.sql
      - supabase/migrations/YYYYMMDDXXXXXX_harden_accrual_json_casting.sql
    gate: schema-validation
  WS2:
    name: Database Migration - Discriminator Column
    agent: rls-expert
    depends_on: [WS1]
    outputs:
      - supabase/migrations/YYYYMMDDXXXXXX_add_accrual_kind_column.sql
    gate: schema-validation
  WS3:
    name: Integration Test Updates
    agent: e2e-testing
    depends_on: [WS1, WS2]
    outputs:
      - hooks/rating-slip-modal/__tests__/use-close-with-financial.test.tsx (update)
      - services/rating-slip/__tests__/policy-snapshot.integration.test.ts (new)
    gate: test-pass
  WS4:
    name: E2E Verification
    agent: qa-specialist
    depends_on: [WS3]
    outputs:
      - Verification report
    gate: build
execution_phases:
  - parallel: [WS1]
  - parallel: [WS2]
  - parallel: [WS3]
  - parallel: [WS4]
---

# EXECUTION-SPEC: ISSUE-752833A6 Policy Snapshot Remediation

## Overview

**Problem**: `rpc_start_rating_slip` creates rating slips with `policy_snapshot = NULL`, causing `rpc_accrue_on_close` to fail with `LOYALTY_SNAPSHOT_MISSING`.

**Solution**: Modify the RPC to construct `policy_snapshot.loyalty` from the `game_settings` table at slip creation time (ADR-019 D2 compliance).

## Workstream Details

### WS1: Database Migration - RPC Fix

**Objective**: Modify `rpc_start_rating_slip` to populate `policy_snapshot.loyalty` from `game_settings` table, and harden `rpc_accrue_on_close` read path.

**Key Requirements**:
1. TABLE-AUTHORITATIVE: Look up policy values from `game_settings` table via correct join path
2. Fallback to hardcoded defaults (house_edge: 1.5, decisions_per_hour: 70, etc.)
3. Do NOT use `p_game_settings` parameter for policy values (it's for runtime state like average_bet)
4. Add `_source` tracking for audit trail
5. Preserve SEC-007 context validation (Template 5)
6. **JSON Casting Hygiene**: Harden `rpc_accrue_on_close` read path to handle malformed data

**CRITICAL: Correct Join Path** (verified from baseline_srm.sql):
```sql
-- WRONG (from issue doc): table_id -> game_type_id (column doesn't exist!)
-- CORRECT: gaming_table.type -> game_settings.game_type (both game_type enum)

FROM gaming_table gt
JOIN game_settings gs
  ON gs.game_type = gt.type
  AND gs.casino_id = gt.casino_id
WHERE gt.id = p_table_id;
```

**Snapshot Completeness** (all accrual-affecting fields from game_settings):
| Field | Type | Default | Used by Loyalty v1 |
|-------|------|---------|-------------------|
| `house_edge` | numeric | 1.5 | Yes - theo calc |
| `decisions_per_hour` | int | 70 | Yes - theo calc |
| `points_conversion_rate` | numeric | 10.0 | Yes - points calc |
| `point_multiplier` | numeric | 1.0 | Yes - promotional bonus |

**JSON Extraction Safety Pattern** (for READ path in `rpc_accrue_on_close`):
```sql
-- BAD: explodes on '', 'null', or malformed data
(v_loyalty_snapshot->>'house_edge')::numeric

-- GOOD: NULLIF converts empty string to NULL, COALESCE provides hard default
COALESCE(NULLIF(v_loyalty_snapshot->>'house_edge', '')::numeric, 1.5)

-- For integers:
COALESCE(NULLIF(v_loyalty_snapshot->>'decisions_per_hour', '')::int, 70)
```

**Write Path** (rpc_start_rating_slip): Already safe - uses typed columns + numeric literals via `jsonb_build_object()`.

**Read Path** (rpc_accrue_on_close): Must audit and apply defensive casting pattern.

**Migration Content**: See remediation document Phase 1 for complete SQL, plus read-path hardening.

**Validation**:
```bash
npm run db:types
```

### WS2: Database Migration - Discriminator Column

**Objective**: Add `accrual_kind` discriminator column with conditional CHECK constraint per ADR-014.

**Key Requirements**:
1. Add `accrual_kind` column: `'loyalty'` (default) or `'compliance_only'`
2. Add conditional CHECK: `accrual_kind != 'loyalty' OR (policy_snapshot IS NOT NULL AND policy_snapshot ? 'loyalty')`
   - **Critical**: Must explicitly check `IS NOT NULL` - Postgres CHECK passes on NULL values
3. Support ghost gaming visits (ADR-014): `compliance_only` slips don't require loyalty snapshot

**Migration Content**:
```sql
-- Step 1: Add column with default (existing rows get 'loyalty')
ALTER TABLE rating_slip
ADD COLUMN accrual_kind text NOT NULL DEFAULT 'loyalty'
CHECK (accrual_kind IN ('loyalty', 'compliance_only'));

-- Step 2: BACKFILL - Mark existing NULL-snapshot rows as compliance_only
-- Without this, CHECK constraint will fail on existing bad data!
UPDATE rating_slip
SET accrual_kind = 'compliance_only'
WHERE policy_snapshot IS NULL
   OR NOT (policy_snapshot ? 'loyalty');

-- Step 3: NOW safe to add conditional constraint
-- NOTE: Must check IS NOT NULL explicitly - Postgres CHECK passes on NULL
ALTER TABLE rating_slip
ADD CONSTRAINT chk_policy_snapshot_if_loyalty
CHECK (
  accrual_kind != 'loyalty' OR (policy_snapshot IS NOT NULL AND policy_snapshot ? 'loyalty')
);

COMMENT ON COLUMN rating_slip.accrual_kind IS
  'ADR-014: Explicit discriminator. "loyalty" requires policy_snapshot.loyalty. "compliance_only" is for ghost gaming (MTL/finance only).';
```

**Migration Sequence Rationale**:
1. Add column → existing rows default to 'loyalty'
2. Backfill → reclassify broken rows to 'compliance_only'
3. Add CHECK → now safe, no existing violations

**Validation**:
```bash
npm run db:types
```

### WS3: Integration Test Updates

**Objective**: Add/update tests to verify policy_snapshot population.

**Key Requirements**:
1. Update existing test fixtures to expect `policy_snapshot` in responses
2. Create new integration test for policy_snapshot construction
3. Test accrual workflow succeeds with populated snapshot

**Test Cases**:
- New slip has `policy_snapshot.loyalty` with expected fields
- `_source` tracking reflects game_settings vs defaults
- Close + accrue workflow completes without LOYALTY_SNAPSHOT_MISSING
- SEC-007 casino mismatch validation still works
- JSON hygiene: malformed snapshot values don't crash accrual (defensive defaults kick in)

**compliance_only Test Cases** (ADR-014 ghost gaming):
- Creating `compliance_only` slip does NOT require loyalty snapshot
- Closing `compliance_only` slip succeeds (no accrual attempted)
- `rpc_accrue_on_close` skips/no-ops cleanly for `compliance_only` slips
- CHECK constraint rejects `accrual_kind = 'loyalty'` with NULL snapshot

### WS4: E2E Verification

**Objective**: Manual verification that the complete workflow succeeds.

**Verification Steps**:
1. Create rating slip -> verify policy_snapshot populated
2. Close slip -> verify no errors
3. Check loyalty accrual -> verify points minted
4. Query audit_log -> verify source tracking

## Dependencies

```
WS1 (RPC Fix)
    |
    v
WS2 (Discriminator Column)
    |
    v
WS3 (Integration Tests)
    |
    v
WS4 (E2E Verification)
```

## Gates

| Phase | Gate | Command |
|-------|------|---------|
| 1 | schema-validation | `npm run db:types` |
| 2 | schema-validation | `npm run db:types` |
| 3 | test-pass | `npm test services/rating-slip/` |
| 4 | build | `npm run build` |

## Risk Mitigation

- **Fallback chain**: If game_settings lookup fails, hardcoded defaults ensure snapshot is still populated
- **No signature change**: RPC parameters unchanged, only internal logic modified
- **Backfill before CHECK**: Existing NULL-snapshot rows reclassified to `compliance_only` BEFORE constraint added
- **Ghost visit support**: ADR-014 compliant - compliance_only slips bypass snapshot requirement
- **JSON hygiene**: Read path uses `NULLIF(...,'')::type` + hard defaults to prevent cast explosions
- **Join path verified**: Uses `gaming_table.type` -> `game_settings.game_type` (confirmed from baseline_srm.sql)

## References

- ADR-014: Ghost Gaming Visits
- ADR-019 v2: Loyalty Points Policy (D2: canonical snapshot source)
- SEC-007: Rating Slip RPC Hardening
- ISSUE-752833A6: Original investigation document
