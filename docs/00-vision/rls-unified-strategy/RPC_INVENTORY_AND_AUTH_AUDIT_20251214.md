# PT-2 RPC Inventory & Authorization Audit

**Date:** 2025-12-14
**Auditor:** Backend Developer Agent
**Scope:** RPC inventory, service layer patterns, authorization architecture
**Context:** `AUTH_ARCH_GAPS_FINDINGS_AND_REMEDIATIONS.md` (GAP 3, GAP 4 validation)

---

## Executive Summary

**Total RPCs:** 22
**Security Modes:** 14 SECURITY DEFINER, 8 SECURITY INVOKER
**Pooling Compatibility:** 12 compliant (4 self-inject + 8 JWT-only), 7 at-risk (external context), 3 n/a (read-only/system)
**High-Risk RPCs:** 3 (financial chip movement - audit critical)
**Overall Posture:** **GOOD** with targeted remediation needed

### Key Findings

1. ✅ **GAP 3 (SECURITY DEFINER bypass):** MITIGATED
   - All SECURITY DEFINER RPCs validate `casino_id` explicitly
   - No blind trust or missing authorization checks
   - Rating slip RPCs (4) self-inject context for pooling safety

2. ✅ **GAP 4 (RPCs as trust boundaries):** COMPLIANT
   - All mutating RPCs have explicit role gates
   - Idempotency patterns in place
   - Audit logging present in DEFINER functions

3. ⚠️ **GAP 1 (Pooling context loss):** PARTIALLY ADDRESSED
   - 4 RPCs self-inject (rating slip lifecycle)
   - 8 RPCs use JWT-only (loyalty service - best practice)
   - **7 RPCs rely on external context** (floor layout + table context) ← REMEDIATION NEEDED

---

## RPC Inventory by Category

### 1. Rating Slip Lifecycle (SECURITY DEFINER, Self-Injecting)

| RPC | Risk | Pattern | Notes |
|-----|------|---------|-------|
| `rpc_start_rating_slip` | LOW | Hybrid (self-inject) | ✅ Calls `set_rls_context()` internally |
| `rpc_pause_rating_slip` | LOW | Hybrid (self-inject) | ✅ FOR UPDATE locking |
| `rpc_resume_rating_slip` | LOW | Hybrid (self-inject) | ✅ Atomic pause interval closure |
| `rpc_close_rating_slip` | LOW | Hybrid (self-inject) | ✅ Terminal state + duration calc |

**Status:** ✅ FULLY COMPLIANT with ADR-015 Phase 1A
**Migration:** `20251213190000_adr015_fix_rpc_context_injection.sql`
**Pattern:** Call `set_rls_context(p_actor_id, p_casino_id, v_staff_role)` at function start, then validate context matches parameters.

---

### 2. Loyalty Service (SECURITY INVOKER, JWT-First)

| RPC | Risk | Roles | Notes |
|-----|------|-------|-------|
| `rpc_accrue_on_close` | LOW | pit_boss, admin | Base accrual on slip close |
| `rpc_redeem` | LOW | pit_boss, cashier, admin | Comp issuance + overdraw logic |
| `rpc_manual_credit` | LOW | pit_boss, admin | Service recovery (cashier excluded) |
| `rpc_apply_promotion` | LOW | pit_boss, admin | Campaign bonus points |
| `rpc_reconcile_loyalty_balance` | LOW | admin | Drift detection (admin-only) |
| `rpc_get_player_ledger` | LOW | authenticated | Read-only, RLS enforced |
| `evaluate_session_reward_suggestion` | LOW | authenticated | Read-only preview |

**Status:** ✅ FULLY COMPLIANT (exemplary Pattern A implementation)
**Migration:** `20251213010000_prd004_loyalty_rpcs.sql`
**Best Practices:**
- SECURITY INVOKER forces RLS reliance (no bypass risk)
- Explicit role gates with tiered authorization (e.g., overdraw requires higher role)
- Row-level locking (`FOR UPDATE`) for concurrency safety
- Business uniqueness constraints (one accrual per slip)

---

### 3. Table Context / Chip Custody (SECURITY DEFINER, External Context)

| RPC | Risk | Remediation Needed | Notes |
|-----|------|-------------------|-------|
| `rpc_request_table_fill` | **HIGH** | ✅ Add self-injection | Chip movement audit |
| `rpc_request_table_credit` | **HIGH** | ✅ Add self-injection | Chip movement audit |
| `rpc_log_table_drop` | **HIGH** | ✅ Add self-injection | Revenue calc dependency |
| `rpc_log_table_inventory_snapshot` | MEDIUM | ✅ Add self-injection | Reconciliation support |
| `rpc_update_table_status` | MEDIUM | ✅ Add self-injection | Status transition |

**Status:** ⚠️ PARTIALLY COMPLIANT (validate context but do NOT self-inject)
**Migration:** `20251212080915_sec006_rls_hardening.sql`
**Issue:** Rely on `withServerAction` middleware to call `set_rls_context()` before RPC. Under transaction pooling, context may not persist if RPC gets different connection.
**Risk:** Financial audit trail attribution errors, potential security gap if context lost.

---

### 4. Floor Layout Service (SECURITY DEFINER, External Context)

| RPC | Risk | Remediation Needed | Notes |
|-----|------|-------------------|-------|
| `rpc_create_floor_layout` | MEDIUM | ✅ Add self-injection | Multi-table insert |
| `rpc_activate_floor_layout` | MEDIUM | ✅ Add self-injection | Idempotent activation |

**Status:** ⚠️ PARTIALLY COMPLIANT
**Migration:** `20251212080915_sec006_rls_hardening.sql`
**Issue:** Same as table context - rely on external context injection.

---

### 5. Financial Transactions (SECURITY INVOKER, JWT-First)

| RPC | Risk | Roles | Notes |
|-----|------|-------|-------|
| `rpc_create_financial_txn` | LOW | cashier, admin | Buy-in/cash-out |

**Status:** ✅ FULLY COMPLIANT
**Migration:** `20251211172516_adr015_financial_rpc_hardening.sql`
**Pattern:** SECURITY INVOKER with triple validation:
1. `casino_id` match (SET LOCAL → JWT fallback)
2. `actor_id` match
3. Staff lookup: `staff.user_id = auth.uid()` AND `role IN ('cashier', 'admin')`

**Best Practice:** Comprehensive identity validation prevents impersonation.

---

### 6. Infrastructure / System Functions

| RPC | Security Mode | Purpose | Risk |
|-----|---------------|---------|------|
| `set_rls_context` | DEFINER | Transaction-wrapped context injection | LOW |
| `compute_gaming_day` | DEFINER | Pure calculation (timestamp → gaming day) | LOW |
| `sync_staff_jwt_claims` | DEFINER | Update auth metadata (trigger-called) | LOW |

**Notes:**
- `set_rls_context`: Core infrastructure, no business logic
- `compute_gaming_day`: Stateless calculation, no auth needed
- `sync_staff_jwt_claims`: System function, not user-facing

---

## Service Layer Analysis

### RPC Call Pattern

**Location:** `services/{domain}/crud.ts`
**Method:** Direct `supabase.rpc()` calls
**Example:**
```typescript
const { data, error } = await supabase.rpc("rpc_start_rating_slip", {
  p_casino_id: casinoId,
  p_actor_id: actorId,
  p_visit_id: input.visit_id,
  // ...
});
```

### Context Injection Pattern

**Middleware:** `withServerAction` wrapper (used by API routes and server actions)
**Flow:**
1. Extract auth context: `getAuthContext(supabase)` → validates `auth.uid()` → staff lookup
2. Inject RLS context: `injectRLSContext()` → calls `set_rls_context` RPC
3. Execute handler with context active
4. Audit log + envelope wrapping

**File:** `/home/diepulp/projects/pt-2/lib/server-actions/with-server-action-wrapper.ts`

### Multi-RPC Workflows

| Workflow | RPCs | Pooling Safe? | Notes |
|----------|------|---------------|-------|
| Close slip → Accrue points | `rpc_close_rating_slip` → `rpc_accrue_on_close` | ✅ YES | Both validate independently (self-inject + JWT) |
| Table fill → Inventory snapshot | `rpc_request_table_fill` → `rpc_log_table_inventory_snapshot` | ❌ NO | Both rely on external context (risk if lost) |

**Remediation Option:** Create wrapper RPC `rpc_fill_and_snapshot()` to execute both in single transaction.

### Error Handling

**Pattern:** `mapDatabaseError()` in each service's `crud.ts`
**Purpose:** Map Postgres error codes (23505, 23503, PGRST116) and RPC exceptions to domain errors
**Example:**
```typescript
if (message.includes("LOYALTY_INSUFFICIENT_BALANCE")) {
  return new DomainError("INSUFFICIENT_BALANCE", "Insufficient loyalty points balance");
}
```
**Benefit:** Raw database errors never leak to API consumers.

---

## Gap Validation

### GAP 3: SECURITY DEFINER Bypass Risk

**Status:** ✅ MITIGATED

**Findings:**
- ✅ All SECURITY DEFINER RPCs have explicit `casino_id` validation
- ✅ No RPC skips authorization checks
- ✅ Rating slip RPCs (4) self-inject context via `set_rls_context()`
- ⚠️ Floor layout + table context RPCs (7) validate context but do NOT self-inject

**High-Risk RPCs:**
1. `rpc_request_table_fill` - chip movement audit trail
2. `rpc_request_table_credit` - chip movement audit trail
3. `rpc_log_table_drop` - feeds revenue calculations

**Why High-Risk:** Pooling context loss could cause:
- Attribution errors (wrong casino/actor in audit log)
- Security gap (if validation relies on missing context)
- Financial reconciliation drift

**Remediation:** Add self-injection pattern (see Recommendations section)

---

### GAP 4: RPCs as Trust Boundaries

**Status:** ✅ COMPLIANT

**Findings:**
- ✅ All user-facing RPCs validate `casino_id` explicitly
- ✅ All mutating RPCs have role gates (`pit_boss`, `admin`, `cashier`)
- ✅ Read-only RPCs rely on RLS (`SECURITY INVOKER`)
- ✅ Idempotency keys used for write operations
- ✅ Audit logging present in SECURITY DEFINER RPCs

**Best Practices Observed:**
- SECURITY INVOKER preferred for new services (loyalty, finance)
- Tiered authorization (e.g., overdraw requires higher role than normal redemption)
- Row-level locking for concurrency (`FOR UPDATE`)
- Business uniqueness constraints (one accrual per slip, one promotion per campaign)

---

## Recommendations

### P0 - CRITICAL

**Title:** Add self-injection to financial chip movement RPCs
**RPCs Affected:**
- `rpc_request_table_fill`
- `rpc_request_table_credit`
- `rpc_log_table_drop`

**Rationale:** These RPCs feed financial audit trail and revenue calculations. Pooling context loss could cause attribution errors or security gaps.

**Implementation:**
```sql
-- Add at top of each function body (after DECLARE)
BEGIN
  -- Extract staff role (fallback to JWT if not in SET LOCAL)
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text,
    'pit_boss'
  );

  -- Self-inject context
  PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);

  -- Extract and validate (same as rpc_start_rating_slip)
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

  -- Continue with original logic...
END;
```

**Validation:** Integration test calling RPC twice in different transactions.

**Estimated Effort:** 2-3 hours (straightforward pattern replication)

---

### P1 - HIGH

**Title:** Add self-injection to floor layout RPCs
**RPCs Affected:**
- `rpc_create_floor_layout`
- `rpc_activate_floor_layout`

**Rationale:** Floor layout changes are infrequent but operationally critical. Pooling risk lower than financial RPCs but still present.

**Implementation:** Same pattern as P0 recommendation.

---

**Title:** Add self-injection to table inventory snapshot RPC
**RPC Affected:**
- `rpc_log_table_inventory_snapshot`

**Rationale:** Inventory snapshots support chip reconciliation. Mis-attributed snapshots could cause accounting drift.

---

### P2 - MEDIUM

**Title:** Migrate SECURITY DEFINER RPCs to SECURITY INVOKER where possible
**Rationale:** ADR-015 Phase 3 goal - JWT-first/JWT-only enforcement. SECURITY INVOKER forces explicit RLS reliance.

**Candidates:**
- `rpc_update_table_status` (simple status update - likely can be INVOKER)

**Blockers:**
- Floor layout RPCs insert into multiple tables (may need DEFINER for cross-table atomicity)
- Chip custody RPCs write audit records (may need DEFINER for audit table access)

**Next Steps:** Audit each DEFINER RPC to determine if INVOKER + RLS sufficient.

---

**Title:** Document RPC wrapper pattern for multi-step workflows
**Rationale:** GAP 1 remediation option - wrapper RPCs eliminate multi-transaction pooling risk.

**Example:** `rpc_close_and_accrue(slip_id)` wraps close + accrual in single transaction.

**Trade-off:** Reduces flexibility (forces specific workflow) but guarantees atomicity.

**Decision Needed:** Architect decision on when to use wrapper vs. idempotent separate calls.

---

### P3 - LOW

**Title:** Add service role monitoring to detect identity leakage (GAP 2)
**Rationale:** Ensure user-path operations never execute with service role JWT.

**Implementation:** Middleware check for `auth.uid()` presence. Log warning if service role detected in user-facing endpoint.

**Validation:** Observability query: Count requests by (endpoint, role, auth_method).

---

**Title:** Standardize RPC error messages for consistent service layer mapping
**Rationale:** Service layer `mapDatabaseError()` relies on message text matching. Fragile if messages change.

**Proposal:** Define error code enum in Postgres (e.g., `'LOYALTY_INSUFFICIENT_BALANCE'`) and return via SQLSTATE or metadata field.

**Benefit:** Type-safe error mapping, no string parsing.

---

## Next Artifacts

1. **ADR-020: RPC Authorization Patterns**
   - Codify SECURITY DEFINER vs INVOKER decision tree
   - When to self-inject vs JWT-only
   - Wrapper RPC vs separate calls guidance

2. **Migration: SEC-007 Self-Injection Patch**
   - Apply `set_rls_context()` to 7 remaining SECURITY DEFINER RPCs
   - Estimated effort: 2-4 hours

3. **Test Suite: RPC Pooling Safety**
   - Integration tests for multi-transaction RPC sequences
   - Verify context isolation and persistence
   - Reference: `lib/supabase/__tests__/rls-pooling-safety.integration.test.ts`

4. **RPC Inventory Dashboard**
   - Queryable interface for ops team
   - Filter by security_mode, risk_level, authorization_pattern
   - Format: Web UI or CLI query tool over JSON inventory

---

## Compliance Summary

| Area | Status | Notes |
|------|--------|-------|
| **ADR-015 Phase 1A** | PARTIALLY COMPLIANT | Rating slip (4/4) ✅, Table context (0/7) ⚠️, Loyalty (8/8) ✅ |
| **GAP 3 (DEFINER bypass)** | MITIGATED | All RPCs validate casino_id, no blind trust |
| **GAP 4 (Trust boundaries)** | COMPLIANT | Explicit authorization in all mutating RPCs |
| **GAP 5 (Implicit context)** | PARTIALLY ADDRESSED | 4 self-inject, 8 JWT-only, 7 external-context |
| **Overall Security Posture** | **GOOD** | Targeted remediation needed for 7 SECURITY DEFINER RPCs |

---

## Appendix: Pattern Reference

### Pattern A: JWT-First (SECURITY INVOKER)

**Used by:** Loyalty service, financial service
**Characteristics:**
- `SECURITY INVOKER` - RLS policies enforced
- Context from `auth.jwt() -> 'app_metadata'`
- Explicit role gates in function body
- No `SET LOCAL` dependency

**Example:** `rpc_accrue_on_close`

**Pros:**
- No pooling issues (JWT always available)
- Forces explicit RLS design
- Cleaner separation of concerns

**Cons:**
- Requires JWT claims to be populated (relies on `sync_staff_jwt_claims` trigger)

---

### Pattern B: Self-Injection (SECURITY DEFINER)

**Used by:** Rating slip lifecycle
**Characteristics:**
- `SECURITY DEFINER` - can bypass RLS if needed
- Calls `set_rls_context()` at function start
- Validates context matches parameters
- Falls back to JWT if `SET LOCAL` missing

**Example:** `rpc_start_rating_slip`

**Pros:**
- Pooling-safe (context injected in same transaction)
- Can perform cross-table operations
- Backward compatible (works with or without middleware)

**Cons:**
- More complex (self-injection boilerplate)
- DEFINER mode requires careful audit

---

### Pattern C: External Context (SECURITY DEFINER) ⚠️

**Used by:** Floor layout, table context (current state)
**Characteristics:**
- `SECURITY DEFINER` - can bypass RLS
- Validates context from `SET LOCAL` → JWT fallback
- Does NOT call `set_rls_context()` internally
- Relies on middleware to inject context before call

**Example:** `rpc_create_floor_layout`

**Pros:**
- Simpler than self-injection (less boilerplate)

**Cons:**
- **Pooling risk:** If RPC gets different connection, `SET LOCAL` missing
- Validation may fail or succeed with stale JWT
- Requires discipline in caller (must call via `withServerAction`)

**Recommendation:** Migrate to Pattern B (self-injection) for pooling safety.

---

**End of Report**
