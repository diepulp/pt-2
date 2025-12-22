---
prd: PRD-015
title: ADR-015 Phase 1A Remediation - RPC Self-Injection Completion
service: RLSSecurityInfrastructure
phase: MVP Security Remediation
priority: P0
issue_ref: ISSUE-5FE4A689
created: 2025-12-21
workstreams:
  WS1:
    name: Financial RPC Self-Injection Fix
    agent: rls-security-specialist
    depends_on: []
    outputs:
      - migration_financial_rpc.sql
    gate: type-check
    rpcs:
      - rpc_create_financial_txn
    notes: Add pit_boss role + constraints per SEC-005
  WS2:
    name: Loyalty RPCs Self-Injection
    agent: rls-security-specialist
    depends_on: []
    outputs:
      - migration_loyalty_rpcs.sql
    gate: type-check
    rpcs:
      - rpc_accrue_on_close
      - rpc_redeem
      - rpc_manual_credit
      - rpc_apply_promotion
      - rpc_reconcile_loyalty_balance
      - rpc_get_player_ledger
      - rpc_issue_mid_session_reward
  WS3:
    name: Table Management RPCs Self-Injection
    agent: rls-security-specialist
    depends_on: []
    outputs:
      - migration_table_mgmt_rpcs.sql
    gate: type-check
    rpcs:
      - rpc_update_table_status
      - rpc_log_table_inventory_snapshot
      - rpc_request_table_fill
      - rpc_request_table_credit
      - rpc_log_table_drop
  WS4:
    name: Casino Operations RPCs Self-Injection
    agent: rls-security-specialist
    depends_on: []
    outputs:
      - migration_casino_ops_rpcs.sql
    gate: type-check
    rpcs:
      - rpc_create_floor_layout
      - rpc_activate_floor_layout
  WS5:
    name: Load and Isolation Testing
    agent: qa-specialist
    depends_on: [WS1, WS2, WS3, WS4]
    outputs:
      - rls-pooling-safety.integration.test.ts (extended)
      - pit-boss-financial-txn.test.ts
    gate: test-pass
    tests:
      - 100 req/s load test with transaction pooling
      - 10-casino concurrent isolation test
      - pit_boss buy-in success test
      - pit_boss cash-out rejection test
  WS6:
    name: CI Enforcement
    agent: backend-developer
    depends_on: [WS5]
    outputs:
      - .husky/pre-commit-rpc-lint.sh
      - .github/workflows/migration-lint.yml
    gate: lint
  WS7:
    name: Documentation and Closure
    agent: backend-developer
    depends_on: [WS6]
    outputs:
      - ADR-015 changelog update
      - ISSUE-5FE4A689 resolution
    gate: build
execution_phases:
  - name: Phase 1 - RPC Self-Injection (Parallel)
    parallel: [WS1, WS2, WS3, WS4]
    gate: schema-validation
  - name: Phase 2 - Testing
    parallel: [WS5]
    gate: test-pass
  - name: Phase 3 - CI and Documentation
    parallel: [WS6, WS7]
    gate: build
---

# EXECUTION-SPEC: PRD-015 (ADR-015 Phase 1A Remediation)

## Overview

This EXECUTION-SPEC implements the systematic RPC self-injection fix for ADR-015 Phase 1A compliance. The audit in ISSUE-5FE4A689 discovered that 15 of 19 RPCs (79%) lack the required `PERFORM set_rls_context()` call, creating connection pooling race conditions and potential cross-tenant data leakage.

## Architecture Context

### Compliant Pattern Reference

The rating slip RPCs (migration `20251213190000_adr015_fix_rpc_context_injection.sql`) demonstrate the compliant pattern:

```sql
-- SELF-INJECTION: Call set_rls_context within same transaction
v_context_staff_role := COALESCE(
  NULLIF(current_setting('app.staff_role', true), ''),
  (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text,
  'pit_boss'  -- Default role for backward compatibility
);

PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);
```

### Non-Compliant Pattern (Current State)

Current RPCs extract context but don't re-inject it:

```sql
-- MISSING: PERFORM set_rls_context() call
v_casino_id uuid := COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
);
```

## Workstream Details

### WS1: Financial RPC Self-Injection Fix (P0 - Critical Path)

**Target RPC:** `rpc_create_financial_txn`
**Source Migration:** `20251211172516_adr015_financial_rpc_hardening.sql`

**Changes Required:**
1. Add self-injection pattern at function start
2. Add `pit_boss` to role list (line 71: `AND s.role IN ('cashier', 'admin')`)
3. Add pit_boss constraint validation per SEC-005 v1.2.0:
   - `direction = 'in'` only
   - `tender_type IN ('cash', 'chips')` only

**Implementation:**
```sql
-- Add after variable declarations, before validation
PERFORM set_rls_context(p_created_by_staff_id, p_casino_id, v_staff_role);

-- Update role check
AND s.role IN ('cashier', 'pit_boss', 'admin');

-- Add after role check
IF v_staff_role = 'pit_boss' THEN
  IF p_direction != 'in' THEN
    RAISE EXCEPTION 'pit_boss can only create buy-in transactions (direction=in)';
  END IF;
  IF p_tender_type NOT IN ('cash', 'chips') THEN
    RAISE EXCEPTION 'pit_boss can only use cash or chips for buy-ins';
  END IF;
END IF;
```

### WS2: Loyalty RPCs Self-Injection (7 functions)

**Target Migration:** `20251213010000_prd004_loyalty_rpcs.sql`

| RPC | Risk Level | Notes |
|-----|------------|-------|
| `rpc_accrue_on_close` | High | Write operation, triggers loyalty points |
| `rpc_redeem` | High | Write operation, deducts points |
| `rpc_manual_credit` | High | Admin override, write operation |
| `rpc_apply_promotion` | Medium | Applies promotional credits |
| `rpc_reconcile_loyalty_balance` | Medium | Balance reconciliation |
| `rpc_get_player_ledger` | Low | Read-only, but still needs isolation |
| `rpc_issue_mid_session_reward` | Medium | Real-time reward issuance |

**Implementation Pattern (for each RPC):**
```sql
-- Add at function start, after DECLARE block
v_context_staff_role := COALESCE(
  NULLIF(current_setting('app.staff_role', true), ''),
  (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
);
PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);
```

### WS3: Table Management RPCs Self-Injection (5 functions)

**Target Migration:** `20251212080915_sec006_rls_hardening.sql`

| RPC | Risk Level | Notes |
|-----|------------|-------|
| `rpc_update_table_status` | Medium | Table state changes |
| `rpc_log_table_inventory_snapshot` | Low | Audit/logging |
| `rpc_request_table_fill` | High | Financial implication |
| `rpc_request_table_credit` | High | Financial implication |
| `rpc_log_table_drop` | Medium | Table drops audit |

### WS4: Casino Operations RPCs Self-Injection (2 functions)

**Target Migration:** `20251212080915_sec006_rls_hardening.sql`

| RPC | Risk Level | Notes |
|-----|------------|-------|
| `rpc_create_floor_layout` | Low | Layout configuration |
| `rpc_activate_floor_layout` | Medium | Operational state change |

### WS5: Load and Isolation Testing

**Extend:** `lib/supabase/__tests__/rls-pooling-safety.integration.test.ts`

**Test Cases:**
1. **Load Test:** 100 concurrent requests/second for 60 seconds
   - Transaction mode pooling enabled (port 6543)
   - Zero HTTP 500 errors from RLS context failures

2. **Isolation Test:** 10 concurrent casinos, 10 requests each
   - Zero cross-casino data in responses
   - Verify `casino_id` in all returned records

3. **pit_boss Financial Tests:**
   - Buy-in with cash: Should succeed
   - Buy-in with chips: Should succeed
   - Cash-out attempt: Should fail with clear error
   - Marker transaction: Should fail with clear error

### WS6: CI Enforcement

**Files:**
- `.husky/pre-commit-rpc-lint.sh` - Pre-commit hook
- `.github/workflows/migration-lint.yml` - GitHub Action

**Lint Rule:**
- Detect `CREATE OR REPLACE FUNCTION rpc_*`
- Require `PERFORM set_rls_context` in same file
- Block commit/PR if missing

### WS7: Documentation and Closure

**Updates:**
- `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` - Add Phase 1A completion changelog
- Mark ISSUE-5FE4A689 as resolved in Memori
- Update SEC-005 if pit_boss constraints differ from spec

## Execution Order

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1: RPC Self-Injection (Parallel)                          │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                │
│ │   WS1   │ │   WS2   │ │   WS3   │ │   WS4   │                │
│ │Financial│ │ Loyalty │ │  Table  │ │ Casino  │                │
│ │  (1)    │ │   (7)   │ │  (5)    │ │  (2)    │                │
│ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘                │
│      └───────────┴───────────┴───────────┘                      │
│                         │                                        │
│                    Gate: npm run db:types                        │
├─────────────────────────────────────────────────────────────────┤
│ Phase 2: Testing                                                 │
│                    ┌─────────┐                                   │
│                    │   WS5   │                                   │
│                    │  Tests  │                                   │
│                    └────┬────┘                                   │
│                         │                                        │
│                    Gate: npm test                                │
├─────────────────────────────────────────────────────────────────┤
│ Phase 3: CI and Documentation                                    │
│              ┌─────────┐ ┌─────────┐                            │
│              │   WS6   │ │   WS7   │                            │
│              │   CI    │ │  Docs   │                            │
│              └────┬────┘ └────┬────┘                            │
│                   └───────────┘                                  │
│                         │                                        │
│                    Gate: npm run build                           │
└─────────────────────────────────────────────────────────────────┘
```

## Migration File Structure

**Single atomic migration:** `YYYYMMDDHHMMSS_prd015_adr015_phase1a_complete.sql`

```sql
-- PRD-015: ADR-015 Phase 1A Remediation
-- Issue: ISSUE-5FE4A689
-- Authority: ADR-015, SEC-005 v1.2.0

-- =============================================================================
-- DOMAIN 1: FINANCIAL TRANSACTIONS (WS1)
-- =============================================================================
-- rpc_create_financial_txn with pit_boss support

-- =============================================================================
-- DOMAIN 2: LOYALTY & COMP SYSTEM (WS2 - 7 RPCs)
-- =============================================================================

-- =============================================================================
-- DOMAIN 3: TABLE MANAGEMENT (WS3 - 5 RPCs)
-- =============================================================================

-- =============================================================================
-- DOMAIN 4: CASINO OPERATIONS (WS4 - 2 RPCs)
-- =============================================================================
```

## Validation Gates

| Gate | Command | Validates |
|------|---------|-----------|
| `schema-validation` | `npm run db:types` | Types generate without error |
| `type-check` | `npm run type-check` | No TypeScript errors |
| `test-pass` | `npm test -- --testPathPattern="rls-pooling"` | All RLS tests pass |
| `build` | `npm run build` | Production build succeeds |

## Rollback Strategy

1. Keep original RPC definitions in rollback migration
2. Test rollback in staging before production deploy
3. Rollback is safe - functions only, no data changes

## Success Criteria

- [ ] 19/19 RPCs contain `PERFORM set_rls_context()` (100% compliance)
- [ ] pit_boss can create buy-in transactions
- [ ] pit_boss cannot create cash-out or marker transactions
- [ ] Load test: 100 req/s for 60s with zero failures
- [ ] Isolation test: 10 casinos, zero cross-tenant leakage
- [ ] CI linting blocks non-compliant RPC migrations
- [ ] ADR-015 changelog updated
- [ ] ISSUE-5FE4A689 resolved
