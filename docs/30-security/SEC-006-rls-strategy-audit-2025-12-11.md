---
id: SEC-006
title: RLS Strategy Audit Report
owner: Security
status: APPROVED - P0 Remediation Complete
created: 2025-12-11
approved: 2025-12-11
approver: Lead Architect
audit_type: System-wide RLS Gap Analysis
reference: ADR-015, ADR-018, ADR-020, SEC-001, SEC-002, SEC-003, SEC-005
related_adrs: [ADR-015, ADR-018, ADR-020]
auditor: rls-expert skill
severity_summary:
  critical: 5
  high: 4
  medium: 3
remediation_tracking:
  p0_status: complete
  p0_migration: 20251212080915_sec006_rls_hardening.sql
  p1_status: complete
  p2_status: deferred
---

# RLS Strategy Audit Report - PT-2

**Audit Date:** 2025-12-11
**Audit Type:** System-wide RLS Gap Analysis
**Reference:** ADR-015, ADR-018, ADR-020, SEC-001, SEC-002, SEC-003, SEC-005
**Auditor:** rls-expert skill

---

## Executive Summary

The ADR-015 connection pooling fix surfaced a broader pattern of RLS vulnerabilities across the PT-2 codebase. This audit identifies **5 critical gaps**, **4 high-severity issues**, and **3 medium-severity compliance deviations** that require remediation.

**Key Finding:** The `set_rls_context()` RPC and Pattern C (hybrid) policies are correctly implemented for most tables. However, **SECURITY DEFINER functions bypass RLS** and several RPCs trust caller-provided `p_casino_id` without validating against injected context—defeating the protection ADR-015 provides.

**Architecture Note (2025-12-15):** ADR-020 has formalized the Pattern C (hybrid) architecture as the MVP strategy. This audit's findings and remediation align with ADR-020's Track A requirements: `set_rls_context` RPC per request + COALESCE pattern policies + JWT fallback.

---

## Critical Severity (P0) - Immediate Action Required

### 1. Floor Layout Service - NO RLS ENABLED

**Tables Affected:**
- `floor_layout` - Has `casino_id`, **RLS NOT ENABLED**
- `floor_layout_version` - No direct `casino_id`, **RLS NOT ENABLED**
- `floor_pit` - Inherits from version, **RLS NOT ENABLED**
- `floor_table_slot` - Inherits from version, **RLS NOT ENABLED**
- `floor_layout_activation` - Has `casino_id`, **RLS NOT ENABLED**

**Location:** `supabase/migrations/20251108223004_create_floor_layout_service.sql`

**Risk:** Cross-tenant data exposure. Any authenticated user can read/write floor layouts for any casino.

**Remediation:**
```sql
ALTER TABLE floor_layout ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_layout_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_pit ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_table_slot ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_layout_activation ENABLE ROW LEVEL SECURITY;
-- Add Pattern C policies for each table
```

---

### 2. Floor Layout RPCs - No Casino Context Validation

**Functions Affected:**
- `rpc_create_floor_layout(p_casino_id, ...)` - Line 83-101
- `rpc_activate_floor_layout(p_casino_id, ...)` - Line 103-120

**Location:** `supabase/migrations/20251108223004_create_floor_layout_service.sql:83-120`

**Pattern Violation:** These are `SECURITY DEFINER` functions that:
1. Accept `p_casino_id` as a parameter
2. **Trust the caller input without validation**
3. Insert data with the caller-provided casino_id

**Risk:** Privilege escalation - any authenticated staff can create floor layouts for any casino by providing a different `p_casino_id`.

**Remediation:** (per SEC-001 Template 5)
```sql
-- Add to both functions:
DECLARE
  v_context_casino_id uuid := NULLIF(current_setting('app.casino_id', true), '')::uuid;
BEGIN
  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set';
  END IF;
  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch';
  END IF;
  -- proceed with insert
```

---

### 3. Chip Custody RPCs - No Casino Context Validation

**Functions Affected:**
- `rpc_log_table_inventory_snapshot` - Line 139-174
- `rpc_request_table_fill` - Line 176-218
- `rpc_request_table_credit` - Line 220-261
- `rpc_log_table_drop` - Line 263-310

**Location:** `supabase/migrations/20251108195341_table_context_chip_custody.sql`

**Pattern Violation:** All four functions are `SECURITY DEFINER` and accept `p_casino_id` without validating against RLS context.

**Partial Mitigation:** These tables have trigger `assert_table_context_casino()` which validates `NEW.casino_id` matches `gaming_table.casino_id`. However, this only prevents table/casino misalignment—it **does not** validate the caller is authorized for that casino.

**Risk:** A staff member from Casino A could record chip custody events for Casino B's tables.

**Remediation:** Add context validation to all four RPCs (same pattern as #2).

---

### 4. rpc_issue_mid_session_reward - No Casino Context Validation

**Location:** `supabase/migrations/00000000000000_baseline_srm.sql:342-426` (later updated in `20251211153228_adr015_rls_compliance_patch.sql:31-122`)

**Pattern Violation:** Accepts `p_casino_id` and validates it against `rating_slip.casino_id`, but **does not validate against current_setting('app.casino_id')**.

**Risk:** Staff from Casino A could issue loyalty points on behalf of Casino B if they know a valid rating_slip_id.

**Remediation:** Add at function start:
```sql
IF NULLIF(current_setting('app.casino_id', true), '')::uuid IS DISTINCT FROM p_casino_id THEN
  RAISE EXCEPTION 'casino_id context mismatch';
END IF;
```

---

### 5. Company and Casino Tables - No RLS

**Tables:**
- `company` - No `casino_id` (parent entity)
- `casino` - Is the anchor, no parent `casino_id`

**Location:** `supabase/migrations/00000000000000_baseline_srm.sql:13-28`

**Assessment:** These may be intentionally unprotected for multi-casino admin access. However:
- Without RLS, any authenticated user can enumerate all casinos
- Could enable reconnaissance for cross-tenant attacks

**Recommendation:**
- Add RLS to `casino` table with admin-only read access pattern
- Consider if `company` should be protected

---

## High Severity (P1) - Address This Sprint

### 6. Append-Only Ledger Tables Missing DELETE/UPDATE Policies

Per SEC-001 Template 3, append-only ledgers MUST have explicit denial policies.

**Tables Missing `no_updates` / `no_deletes`:**

| Table | Has RLS | Has no_updates | Has no_deletes |
|-------|---------|----------------|----------------|
| `loyalty_ledger` | Yes | No | No |
| `mtl_entry` | Yes | No | No |
| `finance_outbox` | Yes | No | No |
| `loyalty_outbox` | Yes | No | No |

**Risk:** Administrative users could corrupt audit trails through direct table modifications.

**Remediation:**
```sql
CREATE POLICY loyalty_ledger_no_updates ON loyalty_ledger FOR UPDATE USING (false);
CREATE POLICY loyalty_ledger_no_deletes ON loyalty_ledger FOR DELETE USING (false);
-- Repeat for mtl_entry, finance_outbox, loyalty_outbox
```

---

### 7. player_financial_transaction - Policy Order Conflict

**Finding:** The ADR-015 compliance patch (`20251211153228`) creates policies allowing `pit_boss, admin` for insert. Then `20251211170030_adr015_finance_rls_hybrid.sql` creates a different policy allowing `cashier` only.

**Location:**
- `20251211153228_adr015_rls_compliance_patch.sql:333-344`
- `20251211170030_adr015_finance_rls_hybrid.sql:28-42`

**Risk:** Policy conflict could cause unexpected denials. Need to verify which policies are actually active.

**Remediation:** Drop duplicate policies, create unified policy:
```sql
-- Should allow: admin (full), cashier (full), pit_boss (buy-ins only per SEC-005)
```

---

### 8. Rating Slip Pause Legacy Policies

**Location:** `supabase/migrations/20251128221408_rating_slip_pause_tracking.sql:24-37`

**Finding:** Original policies use legacy pattern (no JWT fallback). These were replaced in `20251209183401_adr015_hybrid_rls_policies.sql`, but the original policies use:
```sql
casino_id = current_setting('app.casino_id')::uuid  -- No NULLIF, no fallback
```

**Status:** Fixed in later migration. Verify policies are dropped/replaced.

---

### 9. rpc_create_financial_txn Signature Change

**Finding:** The function signature changed between migrations:

- **Original** (`baseline_srm.sql`): `SECURITY DEFINER`, no auth check
- **Updated** (`20251211172516_adr015_financial_rpc_hardening.sql`): `SECURITY INVOKER`, full Pattern C validation

**Risk:** Migration order must be preserved. If baseline runs after hardening, security is degraded.

**Status:** Hardened version is newer. Verify it's the active version.

---

## Medium Severity (P2) - Schedule for Next Iteration

### 10. Context Session Tables (context schema)

**Tables:**
- `context.sessions`
- `context.session_events`
- `context.session_state`

**Finding:** No RLS enabled. These tables have `user_id` (not `casino_id`) and are used for AI agent session tracking, not casino operations.

**Assessment:** These are system-internal tables not exposed to end users. Lower risk but consider:
- Should agent sessions be scoped by casino?
- Could session data leak cross-tenant info?

---

### 11. Trigger-Based Validation Without RLS Backup

**Tables with triggers but no RLS:**
- `gaming_table_settings` - Has `trg_gaming_table_settings_casino` trigger
- `dealer_rotation` - Has `trg_dealer_rotation_casino` trigger

**Assessment:** These now have RLS per `20251211153228_adr015_rls_compliance_patch.sql`. The triggers provide defense-in-depth for foreign key alignment.

---

### 12. Service Key Usage Audit Needed

**From SEC-001:**
> "No service keys in runtime - All operations use anon key + user authentication"

**Recommendation:** Grep codebase for `SUPABASE_SERVICE_ROLE_KEY` usage in runtime code (non-migration, non-test).

---

## Compliance Summary Matrix

| Category | Status | Issues |
|----------|--------|--------|
| Tables with RLS Enabled | 28/33 | 5 floor layout tables missing |
| Pattern C (Hybrid) Policies | 90% | Rating slip pause legacy (fixed) |
| RPC Context Validation | 2/8 | 6 RPCs trust caller casino_id |
| Append-Only Ledger Policies | 60% | 4 tables missing no_update/delete |
| JWT Fallback in Policies | 95% | Minor gaps in older policies |

---

## Recommended Remediation Priority

### Immediate (P0)
Create migration to:
- Enable RLS on floor layout tables with Pattern C policies
- Harden all 6 chip custody + floor layout RPCs with context validation
- Add context validation to `rpc_issue_mid_session_reward`

### This Sprint (P1)
- Add explicit `no_updates` / `no_deletes` policies to append-only ledgers
- Audit and resolve `player_financial_transaction` policy conflicts
- Verify all legacy policies have been replaced

### Next Iteration (P2)
- Evaluate RLS needs for `company` / `casino` tables
- Consider context schema protection
- Conduct service key usage audit

---

## Verification Checklist

After remediation, verify:

```sql
-- Check all tables have RLS enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check all policies use Pattern C
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
AND qual NOT LIKE '%COALESCE%NULLIF%current_setting%'
ORDER BY tablename;

-- Test cross-casino isolation
SELECT set_rls_context('staff-a', 'casino-a', 'pit_boss');
SELECT count(*) FROM floor_layout;  -- Should only see casino-a data
```

---

## Root Cause Analysis

ADR-015 correctly fixed the `SET LOCAL` connection pooling issue by:
1. Creating `set_rls_context()` RPC for atomic context injection
2. Implementing Pattern C (hybrid) policies with JWT fallback

**However**, SECURITY DEFINER functions **bypass RLS entirely** and were not audited for context validation. These RPCs accept `p_casino_id` as a parameter and trust the caller without checking it matches `current_setting('app.casino_id')`.

### Systemic Gap

The original security model assumed:
1. RLS policies would enforce casino scope on all data access
2. RPCs would use `SECURITY INVOKER` to inherit caller's RLS context

In practice:
1. Several RPCs use `SECURITY DEFINER` (bypasses RLS)
2. These RPCs trust caller-provided `p_casino_id`
3. No validation that `p_casino_id` matches authenticated context

### Architectural Recommendation

Update SEC-001 to mandate:
1. All service RPCs MUST validate `p_casino_id` against `current_setting('app.casino_id')`
2. Prefer `SECURITY INVOKER` unless `SECURITY DEFINER` is required for specific privilege elevation
3. Add pre-commit hook to scan for new SECURITY DEFINER functions without context validation

---

## Architectural Review & Approval

**Reviewer:** Lead Architect
**Review Date:** 2025-12-11
**Decision:** APPROVED WITH CONDITIONS

---

### Review Summary

The SEC-006 audit is **architecturally sound** and correctly identifies systemic RLS gaps that bypass ADR-015 protections. The audit methodology is thorough, covering:

1. Table-level RLS enablement scan
2. SECURITY DEFINER function analysis
3. Pattern C (hybrid) policy compliance
4. Cross-reference with SRM ownership boundaries

### Validation Against SRM v4.3.0

| Audit Finding | SRM Alignment | Verdict |
|---------------|---------------|---------|
| FloorLayoutService tables missing RLS | SRM §FloorLayoutService owns these 5 tables | **CONFIRMED** - Gap exists |
| Chip custody RPCs (TableContextService) | SRM §TableContextService owns table_*, RPCs | **CONFIRMED** - Template 5 violation |
| rpc_issue_mid_session_reward (LoyaltyService) | SRM §LoyaltyService owns this RPC | **CONFIRMED** - Template 5 violation |
| Append-only ledgers missing denial policies | SEC-001 Template 3 mandates no_update/delete | **CONFIRMED** - Compliance gap |
| company/casino tables no RLS | SRM §CasinoService - intentionally foundational | **DEFERRED** - Risk accepted for MVP |

### Approval Conditions

1. **P0 Remediation MUST complete before next release**
   - FloorLayoutService RLS + policies (5 tables)
   - RPC context validation (7 functions)

2. **P1 Remediation scheduled for current sprint**
   - Append-only ledger denial policies (4 tables)
   - Resolve policy conflicts on `player_financial_transaction`

3. **ADR-018 Required** - Document SECURITY DEFINER governance pattern
   - Mandate Template 5 validation for all SECURITY DEFINER RPCs
   - Add pre-commit scanner for unvalidated RPCs

### Architectural Recommendations

**1. Migration Structure (Single Atomic Migration)**

Create one migration to address all P0 items:
```
supabase/migrations/YYYYMMDDHHMMSS_sec006_rls_hardening.sql
```

Sections:
- SECTION 1: FloorLayoutService RLS + Pattern C policies
- SECTION 2: RPC context validation (7 functions)
- SECTION 3: Append-only ledger denial policies

**2. RPC Hardening Pattern**

Apply SEC-001 Template 5 to all affected RPCs. Prefer hybrid context resolution:

```sql
v_context_casino_id uuid := COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
);
```

**3. FloorLayoutService Policy Design**

For tables without direct `casino_id` (floor_layout_version, floor_pit, floor_table_slot):
- Use subquery pattern to derive casino scope from parent table
- See `mtl_audit_note` policy in ADR-015 patch for reference

```sql
-- Example: floor_layout_version (derives casino from floor_layout)
CREATE POLICY floor_layout_version_select ON floor_layout_version
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM floor_layout fl
       WHERE fl.id = floor_layout_version.layout_id
         AND fl.casino_id = COALESCE(
           NULLIF(current_setting('app.casino_id', true), '')::uuid,
           (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
         )
    )
  );
```

**4. Pre-Commit Hook Enhancement**

Add to `.husky/pre-commit-migration-safety.sh`:
```bash
# Scan for SECURITY DEFINER without context validation
if grep -l "SECURITY DEFINER" "$file" | xargs grep -L "current_setting('app.casino_id'"; then
  echo "ERROR: SECURITY DEFINER function missing context validation"
  exit 1
fi
```

### Workstream Breakdown

| ID | Task | Owner | Priority | Est. Effort |
|----|------|-------|----------|-------------|
| WS1 | FloorLayoutService RLS (5 tables) | rls-expert | P0 | 2h |
| WS2 | Floor Layout RPCs (2 functions) | rls-expert | P0 | 1h |
| WS3 | Chip Custody RPCs (4 functions) | rls-expert | P0 | 2h |
| WS4 | rpc_issue_mid_session_reward | rls-expert | P0 | 30m |
| WS5 | Append-only denial policies | rls-expert | P1 | 1h |
| WS6 | Finance policy conflict resolution | rls-expert | P1 | 1h |
| WS7 | ADR-018 SECURITY DEFINER governance | lead-architect | P1 | 1h |
| WS8 | Pre-commit hook enhancement | devops | P2 | 30m |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration rollback needed | Low | Medium | Test in staging with cross-casino test data |
| RPC signature breaks clients | Low | High | Functions are additive (validation only) |
| Performance degradation | Low | Low | Subquery patterns are indexed |

### Definition of Done

- [ ] All 5 FloorLayoutService tables have RLS enabled
- [ ] All 7 RPCs validate casino context per Template 5
- [ ] 4 append-only ledgers have no_update/no_delete policies
- [ ] Integration tests verify cross-casino isolation
- [ ] ADR-018 drafted and approved
- [ ] SEC-001 updated with mandatory RPC validation clause

---

**APPROVED:** Lead Architect
**Date:** 2025-12-11
**Conditions:** P0 items must complete before next release

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-11 | Initial audit created |
| 2025-12-11 | **APPROVED** - Lead Architect review completed with conditions |
| 2025-12-12 | **P0 REMEDIATION COMPLETE** - Migration `20251212080915_sec006_rls_hardening.sql` created |
| 2025-12-12 | **P1 REMEDIATION COMPLETE** - Append-only denial policies included in migration |
| 2025-12-12 | **ADR-018** drafted - SECURITY DEFINER governance pattern documented |
| 2025-12-15 | **ADR-020 REFERENCE ADDED** - Pattern C (hybrid) formalized as MVP architecture (Track A) |

---

## Related Documents

- `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` - Connection pooling fix (Phase 1)
- `docs/80-adrs/ADR-018-security-definer-governance.md` - SECURITY DEFINER patterns
- `docs/80-adrs/ADR-020-rls-track-a-mvp-strategy.md` - **Track A (hybrid) as MVP architecture**
- `docs/30-security/SEC-001-rls-policy-matrix.md`
- `docs/30-security/SEC-002-casino-scoped-security-model.md`
- `docs/30-security/SEC-003-rbac-matrix.md`
- `docs/30-security/SEC-005-role-taxonomy.md`
