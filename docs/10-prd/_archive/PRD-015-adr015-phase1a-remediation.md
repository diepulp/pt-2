---
id: PRD-015
title: ADR-015 Phase 1A Remediation - RPC Self-Injection Completion
owner: Lead Architect
status: Draft
affects: [ADR-015, ADR-018, ADR-020, SEC-005, SEC-006]
created: 2025-12-21
last_review: 2025-12-21
phase: Phase MVP (Security Remediation)
pattern: N/A (Infrastructure)
http_boundary: false
priority: P0
issue_ref: ISSUE-5FE4A689
---

# PRD-015 — ADR-015 Phase 1A Remediation

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Priority:** P0 - Blocks production deployment with connection pooling
- **Summary:** Complete ADR-015 Phase 1A self-injection across all RPC domains. Multi-agent verification confirmed 79% of RPCs (15 of 19) are non-compliant with Phase 1A requirements, creating connection pooling failures and potential cross-tenant data leakage. This PRD addresses the systematic gap discovered in ISSUE-5FE4A689, fixes the SEC-005 role authorization violation in `rpc_create_financial_txn`, and establishes CI enforcement to prevent future regressions.

---

## 2. Problem & Goals

### 2.1 Problem

**ISSUE-5FE4A689 Root Cause Analysis:**

ADR-015 Phase 1A (implemented Dec 13, 2025) only addressed rating slip RPCs, leaving 15 of 19 RPCs (79%) non-compliant. This creates two critical security vulnerabilities:

1. **Connection Pooling Race Condition:** Under Supabase transaction mode pooling (port 6543), `set_rls_context()` calls and subsequent RPC calls may execute on different pooled connections. Without RPC self-injection, context is lost between connections, causing:
   - RLS policy failures (NULL context)
   - Cross-tenant data leakage (stale context from previous request)
   - Intermittent HTTP 500 errors under load

2. **Role Authorization Bug:** `rpc_create_financial_txn` excludes `pit_boss` from its role list (line 71), despite SEC-005 v1.2.0 explicitly authorizing pit_boss for table buy-ins. This blocks core pit boss workflows.

**Timeline of Gap:**
```
Dec 10, 2025: ADR-015 Phase 1A planned
Dec 11, 2025: rpc_create_financial_txn created (BEFORE Phase 1A)
Dec 12, 2025: Table management RPCs created (BEFORE Phase 1A)
Dec 13, 2025: Phase 1A implemented for RATING SLIPS ONLY
Dec 13, 2025: Loyalty RPCs created (SAME DAY, parallel workstream)
Dec 21, 2025: Gap discovered via multi-agent audit (ISSUE-5FE4A689)
```

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: 100% Phase 1A compliance | All 19 RPCs contain `PERFORM set_rls_context()` |
| **G2**: pit_boss can create buy-ins | `rpc_create_financial_txn` accepts pit_boss role |
| **G3**: No connection pooling failures | Load tests pass at 100 req/s with transaction mode |
| **G4**: No cross-tenant leakage | Concurrent multi-casino tests show zero leakage |
| **G5**: Future regression prevention | CI linting rule blocks non-compliant RPC migrations |

### 2.3 Non-Goals

- Track B migration (JWT-only policies) - deferred per ADR-020
- New RPC creation - remediation only
- SECURITY INVOKER to DEFINER conversions - preserve current security modes
- Performance optimization of RLS policies
- Role boundary test expansion (covered by future PRD)

---

## 3. Users & Use Cases

- **Primary users:** Pit Bosses, Cashiers, System Administrators

**Top Jobs:**

- As a **Pit Boss**, I need to move players between tables (which creates financial transactions) so that I can manage table capacity without calling a cashier.
- As a **Cashier**, I need loyalty operations to work reliably under load so that comp redemptions don't fail during busy periods.
- As a **DevOps Engineer**, I need connection pooling to work safely so that we can scale to production traffic.
- As a **Security Auditor**, I need all RPCs to self-inject context so that cross-tenant isolation is guaranteed.

---

## 4. Scope & Feature List

### 4.1 In Scope (P0 Remediation)

**RPC Self-Injection (15 RPCs):**

| Domain | RPC | Migration File |
|--------|-----|----------------|
| Financial | `rpc_create_financial_txn` | `20251211172516_adr015_financial_rpc_hardening.sql` |
| Loyalty | `rpc_accrue_on_close` | `20251213010000_prd004_loyalty_rpcs.sql` |
| Loyalty | `rpc_redeem` | `20251213010000_prd004_loyalty_rpcs.sql` |
| Loyalty | `rpc_manual_credit` | `20251213010000_prd004_loyalty_rpcs.sql` |
| Loyalty | `rpc_apply_promotion` | `20251213010000_prd004_loyalty_rpcs.sql` |
| Loyalty | `rpc_reconcile_loyalty_balance` | `20251213010000_prd004_loyalty_rpcs.sql` |
| Loyalty | `rpc_get_player_ledger` | `20251213010000_prd004_loyalty_rpcs.sql` |
| Loyalty | `rpc_issue_mid_session_reward` | `20251212080915_sec006_rls_hardening.sql` |
| Table Mgmt | `rpc_update_table_status` | `20251212081000_sec007_rating_slip_rpc_hardening.sql` |
| Table Mgmt | `rpc_log_table_inventory_snapshot` | `20251212080915_sec006_rls_hardening.sql` |
| Table Mgmt | `rpc_request_table_fill` | `20251212080915_sec006_rls_hardening.sql` |
| Table Mgmt | `rpc_request_table_credit` | `20251212080915_sec006_rls_hardening.sql` |
| Table Mgmt | `rpc_log_table_drop` | `20251212080915_sec006_rls_hardening.sql` |
| Casino Ops | `rpc_create_floor_layout` | `20251212080915_sec006_rls_hardening.sql` |
| Casino Ops | `rpc_activate_floor_layout` | `20251212080915_sec006_rls_hardening.sql` |

**Role Authorization Fix:**
- Add `pit_boss` to `rpc_create_financial_txn` role list (line 71)
- Add conditional validation per SEC-005: pit_boss limited to `direction='in'`, `tender_type IN ('cash','chips')`

**CI Enforcement:**
- Pre-commit hook to detect RPC migrations missing `PERFORM set_rls_context`
- GitHub Actions check for migration compliance

### 4.2 Out of Scope

- Helper functions (`calculate_theo_from_snapshot`, `evaluate_session_reward_suggestion`)
- Rating slip RPCs (already Phase 1A compliant)
- RLS policy changes (policies are correct, RPCs are not)
- Frontend changes

---

## 5. Requirements

### 5.1 Functional Requirements

**FR-1: Self-Injection Pattern**
All 15 non-compliant RPCs MUST include self-injection at function start:
```sql
-- SELF-INJECTION: ADR-015 Phase 1A for connection pooling
PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);
```

**FR-2: Role Authorization**
`rpc_create_financial_txn` MUST:
- Accept `pit_boss` role in addition to `cashier` and `admin`
- Validate pit_boss transactions: `direction = 'in'` AND `tender_type IN ('cash', 'chips')`
- Raise exception if pit_boss attempts cash-out or marker transactions

**FR-3: Context Extraction**
All RPCs MUST extract staff role using Pattern C hybrid:
```sql
v_context_staff_role := COALESCE(
  NULLIF(current_setting('app.staff_role', true), ''),
  (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
);
```

**FR-4: Backward Compatibility**
Self-injection MUST NOT break existing call patterns. RPCs must continue to work when called after explicit `set_rls_context()`.

### 5.2 Non-Functional Requirements

**NFR-1: Load Testing**
- 100 concurrent requests/second for 60 seconds
- Zero HTTP 500 errors from RLS context failures
- Transaction mode pooling (port 6543) enabled

**NFR-2: Isolation Testing**
- 10 concurrent casinos, 10 requests each, simultaneous execution
- Zero cross-casino data in any response
- Verified by checking `casino_id` in all returned records

**NFR-3: Migration Safety**
- Single atomic migration file
- Rollback script prepared (revert to previous RPC versions)
- No data modification, only function replacements

> Architecture details: See [ADR-015](../80-adrs/ADR-015-rls-connection-pooling-strategy.md), [SEC-005](../30-security/SEC-005-role-taxonomy.md)

---

## 6. UX / Flow Overview

**Flow 1: Pit Boss Player Move (Currently Broken)**
1. Pit boss opens rating slip modal
2. Clicks "Move Player" button
3. Selects destination table and seat
4. System calls `rpc_create_financial_txn` for buy-in
5. **CURRENT:** HTTP 500 - "unauthorized staff role"
6. **AFTER FIX:** Transaction succeeds, player moved

**Flow 2: Loyalty Redemption Under Load**
1. Multiple cashiers process comp redemptions simultaneously
2. Each calls `rpc_redeem` on different pooled connections
3. **CURRENT:** Intermittent failures when context lost
4. **AFTER FIX:** All redemptions succeed with correct casino scope

**Flow 3: CI Prevention**
1. Developer creates new RPC migration
2. Forgets to add `PERFORM set_rls_context()`
3. Pre-commit hook runs migration linter
4. **RESULT:** Commit blocked with error message:
   ```
   ERROR: RPC in migrations/20251222_new_rpc.sql missing self-injection (ADR-015)
   Add: PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);
   ```

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Migration |
|------------|--------|-----------|
| `set_rls_context()` RPC | Exists | `20251209183033` |
| Rating slip RPCs (reference pattern) | Compliant | `20251213190000` |
| ADR-015 Phase 1A specification | Documented | `docs/80-adrs/ADR-015` |
| SEC-005 v1.2.0 role taxonomy | Documented | `docs/30-security/SEC-005` |

### 7.2 Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| **R1:** Migration fails on existing data | None - functions only, no data changes | Test on staging first |
| **R2:** Double context injection overhead | Minimal - SET LOCAL is idempotent | Benchmark shows <1ms |
| **R3:** pit_boss constraint bypass | Security violation | Add explicit validation in RPC |
| **R4:** Parallel migration conflicts | Deployment failure | Coordinate with other workstreams |

**Open Questions:**
- Q1: Should helper functions also self-inject? **Decision:** No - they don't perform RLS-dependent operations directly.
- Q2: Should we convert SECURITY INVOKER to DEFINER? **Decision:** No - preserve existing security modes, focus on self-injection only.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] All 15 non-compliant RPCs updated with `PERFORM set_rls_context()`
- [ ] `rpc_create_financial_txn` accepts `pit_boss` role
- [ ] pit_boss constraints enforced (direction='in', tender_type validation)
- [ ] Existing rating slip RPCs unaffected (regression check)

**Data & Integrity**
- [ ] No cross-casino data leakage under concurrent load
- [ ] All transactions maintain correct `casino_id` scope
- [ ] Audit trail correctly records `created_by_staff_id`

**Security & Access**
- [ ] SEC-005 role authorization verified for pit_boss
- [ ] ADR-015 Phase 1A scanner reports 100% compliance
- [ ] Cross-casino denial tests pass (extend PRD-010 WS3)

**Testing**
- [ ] Load test: 100 req/s for 60s with zero RLS failures
- [ ] Isolation test: 10 concurrent casinos, zero leakage
- [ ] Regression test: Rating slip operations unaffected
- [ ] pit_boss buy-in test: Success with valid params
- [ ] pit_boss cash-out test: Rejected with clear error

**Operational Readiness**
- [ ] Migration deploys cleanly on staging
- [ ] Rollback migration prepared and tested
- [ ] Monitoring dashboard shows RLS error rate

**Documentation**
- [ ] ADR-015 changelog updated with Phase 1A completion date
- [ ] SEC-005 updated if pit_boss constraints change
- [ ] ISSUE-5FE4A689 marked resolved in Memori

**CI Enforcement**
- [ ] Pre-commit hook installed: `.husky/pre-commit-rpc-lint.sh`
- [ ] GitHub Action added: `.github/workflows/migration-lint.yml`
- [ ] Linting rule documented in `CONTRIBUTING.md`

---

## 9. Related Documents

- **Issue Reference**: [ISSUE-5FE4A689](../issues/ISSUE-5FE4A689-RPC-SELF-INJECTION-SYSTEMATIC-GAP-20251221.md)
- **Architecture / ADR**: [ADR-015 RLS Connection Pooling Strategy](../80-adrs/ADR-015-rls-connection-pooling-strategy.md)
- **Security / Roles**: [SEC-005 Role Taxonomy v1.2.0](../30-security/SEC-005-role-taxonomy.md)
- **Prior PRD**: [PRD-010 RLS MVP Hardening](./PRD-010-rls-mvp-hardening.md)
- **Compliant Reference**: `supabase/migrations/20251213190000_adr015_fix_rpc_context_injection.sql`
- **Test Suite**: `lib/supabase/__tests__/rls-pooling-safety.integration.test.ts`

---

## Appendix A: Migration Specification

### Migration File

**Name:** `YYYYMMDDHHMMSS_prd015_adr015_phase1a_complete.sql`

**Structure:**
```sql
-- PRD-015: ADR-015 Phase 1A Remediation
-- Complete self-injection for all non-compliant RPCs
-- Issue: ISSUE-5FE4A689
-- Authority: ADR-015, SEC-005 v1.2.0

-- =============================================================================
-- DOMAIN 1: FINANCIAL TRANSACTIONS
-- =============================================================================

-- Fix 1: rpc_create_financial_txn
-- - Add PERFORM set_rls_context() self-injection
-- - Add pit_boss to role list per SEC-005
-- - Add pit_boss constraints (direction='in', tender_type validation)
CREATE OR REPLACE FUNCTION rpc_create_financial_txn(
  p_casino_id uuid,
  p_player_id uuid,
  p_visit_id uuid,
  p_amount numeric,
  p_direction financial_direction,
  p_tender_type financial_source,
  p_created_by_staff_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_txn_id uuid;
BEGIN
  -- Extract staff role (Pattern C hybrid)
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling
  PERFORM set_rls_context(p_created_by_staff_id, p_casino_id, v_context_staff_role);

  -- ... rest of function with pit_boss in role list
  -- AND s.role IN ('cashier', 'pit_boss', 'admin')

  -- pit_boss constraint validation
  IF v_context_staff_role = 'pit_boss' THEN
    IF p_direction != 'in' THEN
      RAISE EXCEPTION 'pit_boss can only create buy-in transactions (direction=in)';
    END IF;
    IF p_tender_type NOT IN ('cash', 'chips') THEN
      RAISE EXCEPTION 'pit_boss can only use cash or chips for buy-ins';
    END IF;
  END IF;

  -- ... continue with transaction creation
END;
$$;

-- =============================================================================
-- DOMAIN 2: LOYALTY & COMP SYSTEM (7 RPCs)
-- =============================================================================
-- [Similar pattern for each RPC]

-- =============================================================================
-- DOMAIN 3: TABLE MANAGEMENT (5 RPCs)
-- =============================================================================
-- [Similar pattern for each RPC]

-- =============================================================================
-- DOMAIN 4: CASINO OPERATIONS (2 RPCs)
-- =============================================================================
-- [Similar pattern for each RPC]
```

### Rollback Migration

**Name:** `YYYYMMDDHHMMSS_prd015_rollback.sql`

```sql
-- ROLLBACK: PRD-015 Phase 1A Remediation
-- Use only if issues discovered in production
-- Reverts to pre-self-injection RPC versions

-- Note: This file should contain the ORIGINAL function definitions
-- from before PRD-015 was applied. Generate by copying from:
-- - 20251211172516_adr015_financial_rpc_hardening.sql
-- - 20251213010000_prd004_loyalty_rpcs.sql
-- - 20251212080915_sec006_rls_hardening.sql
-- - 20251212081000_sec007_rating_slip_rpc_hardening.sql
```

---

## Appendix B: Implementation Workstreams

### WS1: Financial RPC Fix (P0 - Critical Path)

**Estimated Effort:** 2 hours

- [ ] Read current `rpc_create_financial_txn` implementation
- [ ] Add self-injection pattern
- [ ] Add `pit_boss` to role list
- [ ] Add pit_boss constraint validation
- [ ] Write unit test for pit_boss buy-in success
- [ ] Write unit test for pit_boss cash-out rejection

### WS2: Loyalty RPCs (P0 - 7 functions)

**Estimated Effort:** 4 hours

- [ ] `rpc_accrue_on_close` - Add self-injection
- [ ] `rpc_redeem` - Add self-injection
- [ ] `rpc_manual_credit` - Add self-injection
- [ ] `rpc_apply_promotion` - Add self-injection
- [ ] `rpc_reconcile_loyalty_balance` - Add self-injection
- [ ] `rpc_get_player_ledger` - Add self-injection (read-only, lower risk)
- [ ] `rpc_issue_mid_session_reward` - Add self-injection

### WS3: Table Management RPCs (P0 - 5 functions)

**Estimated Effort:** 3 hours

- [ ] `rpc_update_table_status` - Add self-injection
- [ ] `rpc_log_table_inventory_snapshot` - Add self-injection
- [ ] `rpc_request_table_fill` - Add self-injection
- [ ] `rpc_request_table_credit` - Add self-injection
- [ ] `rpc_log_table_drop` - Add self-injection

### WS4: Casino Operations RPCs (P1 - 2 functions)

**Estimated Effort:** 1 hour

- [ ] `rpc_create_floor_layout` - Add self-injection
- [ ] `rpc_activate_floor_layout` - Add self-injection

### WS5: Load & Isolation Testing (P0)

**Estimated Effort:** 4 hours

- [ ] Extend `rls-pooling-safety.integration.test.ts`
- [ ] Add 100 req/s load test with transaction pooling
- [ ] Add 10-casino concurrent isolation test
- [ ] Add pit_boss financial transaction tests
- [ ] Document test results

### WS6: CI Enforcement (P1)

**Estimated Effort:** 2 hours

- [ ] Create `.husky/pre-commit-rpc-lint.sh`
- [ ] Create `.github/workflows/migration-lint.yml`
- [ ] Update `CONTRIBUTING.md` with RPC requirements
- [ ] Test hook with intentionally non-compliant migration

### WS7: Documentation & Closure (P2)

**Estimated Effort:** 1 hour

- [ ] Update ADR-015 changelog
- [ ] Mark ISSUE-5FE4A689 resolved in Memori
- [ ] Update SEC-005 if needed
- [ ] Close this PRD

---

## Appendix C: CI Linting Rule

### Pre-commit Hook

**File:** `.husky/pre-commit-rpc-lint.sh`

```bash
#!/bin/bash
# ADR-015 Phase 1A Enforcement
# Ensures new RPC migrations include self-injection

set -e

for file in $(git diff --cached --name-only | grep "supabase/migrations"); do
  # Check if file defines an RPC function
  if grep -q "CREATE OR REPLACE FUNCTION rpc_" "$file"; then
    # Check for self-injection pattern
    if ! grep -q "PERFORM set_rls_context" "$file"; then
      echo "ERROR: RPC in $file missing self-injection (ADR-015 Phase 1A)"
      echo ""
      echo "All RPCs must include:"
      echo "  PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);"
      echo ""
      echo "See: docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md"
      exit 1
    fi
  fi
done

echo "ADR-015 Phase 1A: All RPC migrations compliant"
```

### GitHub Action

**File:** `.github/workflows/migration-lint.yml`

```yaml
name: Migration Lint

on:
  pull_request:
    paths:
      - 'supabase/migrations/**'

jobs:
  adr015-compliance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check RPC Self-Injection
        run: |
          for file in supabase/migrations/*.sql; do
            if grep -q "CREATE OR REPLACE FUNCTION rpc_" "$file"; then
              if ! grep -q "PERFORM set_rls_context" "$file"; then
                echo "::error file=$file::Missing ADR-015 Phase 1A self-injection"
                exit 1
              fi
            fi
          done
          echo "All RPC migrations are ADR-015 Phase 1A compliant"
```

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-21 | Lead Architect | Initial draft based on ISSUE-5FE4A689 multi-agent audit |
