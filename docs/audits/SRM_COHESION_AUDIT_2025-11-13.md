# Service Responsibility Matrix (SRM) Cohesion Audit

**Audit Date**: 2025-11-13
**Document Audited**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v3.0.2-PATCHED)
**Auditor**: Claude Code
**Status**: CRITICAL ISSUES FOUND

## Executive Summary

The SRM contains **3 critical contradictions**, **12 vague statements**, and **8 cohesion issues** that compromise its effectiveness as a canonical reference. The most significant issue is the **mixing of CURRENT and TARGET states** without clear separation, making it unclear which parts of the document represent implemented vs. planned architecture.

**Risk Level**: 🔴 HIGH - Document claims CANONICAL status but contains aspirational content

---

## 1. CRITICAL CONTRADICTIONS

### 1.1 Chip Custody "Non-Monetary" Contradiction

**Severity**: 🔴 HIGH
**Location**: Lines 1456, 1496, 1512

**Issue**:
- Line 1456 states: "Capture operational custody of chips... **without storing monetary ledgers**"
- Line 1468-1469: "Does Not Own: **Finance: monetary ledgers**"
- BUT Line 1496: `amount_cents int not null` in `table_fill`
- AND Line 1512: `amount_cents int not null` in `table_credit`

**Contradiction**: If chip custody is "non-monetary," why does it track `amount_cents`? The boundary between TableContext (custody) and Finance (monetary) is blurred.

**Recommendation**:
- Clarify that TableContext tracks physical chip movement with monetary metadata
- Finance owns the reconciliation and accounting ledger
- Add explicit statement: "TableContext records custody events WITH monetary values but does NOT own financial reconciliation"

---

### 1.2 CURRENT vs TARGET State Confusion

**Severity**: 🔴 CRITICAL
**Location**: Lines 568-572, 620-627, 685-802, 1002-1005

**Issue**:
- Line 568: "**⚠️ TARGET STATE (requires migration - staff.user_id not yet added)**"
- Line 920: "⚠️ **Pending**: `user_id` auth linkage"
- Line 1002-1005: Schema shows `user_id` as **commented out** (PENDING)

**BUT**:
- Lines 620-627: ALL RLS examples assume `staff.user_id` exists
- Lines 685-802: All RLS policy templates use TARGET STATE syntax
- Line 624: `auth.uid() = (select user_id from staff...)` - **CANNOT WORK** if column doesn't exist

**Contradiction**: Document claims to be CANONICAL but describes a future state. RLS policies shown cannot be deployed in current schema.

**Recommendation**:
1. Create TWO sections: "Current State RLS" and "Target State RLS (Post-Migration)"
2. Add header warnings to ALL target-state examples
3. Add migration tracking: "Migration Status: ⚠️ NOT YET APPLIED"
4. Include current workaround RLS patterns for teams using the SRM today

---

### 1.3 Gaming Day Authority Duplication

**Severity**: 🟡 MEDIUM
**Location**: Lines 897, 1939-1941, 2048

**Issue**:
- Line 897: CasinoService is "**Root temporal authority & global policy**"
- Line 1939-1941: Finance has its OWN `set_fin_txn_gaming_day()` trigger
- Line 2048: MTL has "Gaming day calculation logic (trigger-based)"

**Contradiction**: Multiple services independently compute gaming_day instead of consuming from a single temporal authority.

**Recommendation**:
- Define CasinoService as the ONLY source of gaming day computation
- Other services should call `casino.compute_gaming_day(ts, casino_id)` RPC
- OR: Accept distributed computation but clarify that CasinoService owns the **policy** (start time), not the **computation**

---

## 2. VAGUE STATEMENTS

### 2.1 Event Integration Mechanism Undefined

**Severity**: 🟡 MEDIUM
**Location**: Lines 1348, 1358, 1773

**Issue**:
- Line 1348: "Consumes `floor_layout.activated` events"
- Line 1358: "TableContext **ingestion job** listens for `floor_layout.activated` events"
- Line 1773: "TableContext **listens** and updates `gaming_table` state"

**Vagueness**: THREE different terms used - "consumes," "ingestion job," "listens" - but NO specification of:
- Event bus technology (Supabase Realtime? Postgres NOTIFY? Background worker?)
- Retry mechanism
- Ordering guarantees
- Failure handling

**Recommendation**:
- Add section: "Event System Architecture"
- Specify: Supabase Realtime channels OR Postgres NOTIFY/LISTEN
- Define retry policy for event consumption failures
- Document ordering and idempotency requirements

---

### 2.2 "Gaming Day Temporal Authority" Unclear

**Severity**: 🟢 LOW
**Location**: Line 70, 569, 897

**Issue**: Term "temporal authority" used without definition. What does TableContext consume from Casino?

**Recommendation**: Define as "CasinoService provides `gaming_day_start_time` and `timezone`; consumers read via `casino_settings` FK or RPC"

---

### 2.3 RLS Role Names Not Defined

**Severity**: 🟡 MEDIUM
**Location**: Lines 1621, 1661

**Issue**:
- Line 1621: "`accounting_read`, `cage_read`, `compliance_read` **(as appropriate)**"
- Line 1661: "`layout_reviewer` role"

**Vagueness**: These roles are referenced but NEVER defined in `staff_role` enum (line 999 only shows `dealer`, `pit_boss`, `admin`)

**Recommendation**:
- Add complete role taxonomy to SRM
- OR: Clarify these are future roles pending migration
- OR: Map to existing roles (e.g., "accounting_read = admin with accounting permission")

---

### 2.4 "Service Factories" Pattern Not Defined

**Severity**: 🟡 MEDIUM
**Location**: Lines 18, 871, 953

**Issue**: "Service factories" mentioned 6+ times but NEVER defined. What is a service factory?

**Recommendation**: Add example:
```typescript
// Service Factory Pattern
export function createLoyaltyService(supabase: SupabaseClient<Database>) {
  return {
    issueReward: (params) => supabase.rpc('rpc_issue_mid_session_reward', params),
    getBalance: (playerId, casinoId) => /* ... */
  };
}
```

---

### 2.5 KPI Thresholds Missing

**Severity**: 🟢 LOW
**Location**: Line 1638

**Issue**: "Time-to-fill; fills/credits per table/shift" mentioned as KPIs but NO thresholds or SLAs defined

**Recommendation**: Add SLA targets (e.g., "p95 fill request: < 5 minutes")

---

### 2.6 "CQRS-Light" Pattern Undefined

**Severity**: 🟢 LOW
**Location**: Lines 871, 1862-1865

**Issue**: "CQRS-light pattern" mentioned but what makes it "light"?

**Recommendation**: Define criteria:
- Same database (not separate read/write DBs)
- Projection delay acceptable (< 5s)
- Read models materialized via periodic jobs (not event sourcing)

---

### 2.7 Projection Cadence Not Specified

**Severity**: 🟡 MEDIUM
**Location**: Lines 873, 1864

**Issue**:
- Line 873: "Projection cadence and ownership are documented **per service section**"
- Line 1864: RatingSlip projection runs "every **≤5s**"
- BUT: No cadence specified for Finance, Loyalty, MTL projections

**Recommendation**: Add projection cadence table for ALL services with read models

---

### 2.8 Circular FK References Not Addressed

**Severity**: 🟢 LOW
**Location**: Lines 1825, 902

**Issue**:
- `rating_slip` has FK to `visit_id` (line 1825)
- Visit service "aggregates rating_slips" (line 902)
- Potential circular dependency not discussed

**Recommendation**: Clarify that FK is one-directional; aggregation is read-only query, not schema dependency

---

### 2.9 "Compliance Roles" Not Enumerated

**Severity**: 🟡 MEDIUM
**Location**: Lines 740, 1621, 2062

**Issue**: "Compliance roles" referenced multiple times but never listed

**Recommendation**: Define `compliance_analyst`, `aml_officer`, `ctr_reviewer` in role taxonomy

---

### 2.10 Outbox Worker Implementation Missing

**Severity**: 🟡 MEDIUM
**Location**: Lines 878, 1851-1852, 1945-1946

**Issue**: Outbox pattern described (loyalty_outbox, finance_outbox) but worker implementation not specified:
- Language/runtime?
- Polling interval?
- Concurrency model?
- Dead-letter threshold?

**Recommendation**: Add reference implementation or link to worker service specification

---

### 2.11 "Authorized Roles" Lists Inconsistent

**Severity**: 🟢 LOW
**Location**: Multiple locations

**Issue**:
- Line 737: Visit write = "Pit boss, admin"
- Line 742: RatingSlip write = "Telemetry service" (not a role?)
- Line 741: TableContext write = "Pit boss, admin"

**Vagueness**: What is "Telemetry service"? Is it a service key (forbidden per line 604) or a role?

**Recommendation**: Clarify that RatingSlip writes go through RPC (no direct writes) or define `telemetry_ingest` role

---

### 2.12 CI Validation Scripts Not Provided

**Severity**: 🟡 MEDIUM
**Location**: Lines 261-277, 537-548, 770-780

**Issue**: Multiple references to CI validation scripts that don't exist:
- `scripts/validate-srm-ownership.js` (line 274)
- `scripts/validate-dto-fields.js` (line 275)
- `scripts/validate-error-taxonomy.js` (line 540)
- `scripts/validate-rls-policies.js` (line 772)

**Recommendation**: Either implement these scripts or mark as "TODO" to avoid false confidence

---

## 3. COHESION ISSUES

### 3.1 Idempotency Key Naming Inconsistency

**Severity**: 🟡 MEDIUM
**Location**: Lines 1197, 1502, 1911, 2085

**Issue**: Same pattern, different names:
- Loyalty: `idempotency_key` (line 1197)
- Finance: `idempotency_key` (line 1911)
- MTL: `idempotency_key` (line 2085)
- TableContext fills/credits: `request_id` (line 1502)

**Cohesion Problem**: Inconsistent naming makes pattern recognition harder

**Recommendation**: Standardize on `idempotency_key` everywhere OR document why TableContext uses `request_id`

---

### 3.2 RPC Naming Convention Inconsistent

**Severity**: 🟢 LOW
**Location**: Lines 1226, 1542, 1563, 1596, 1955

**Issue**: No consistent verb prefix:
- `rpc_issue_mid_session_reward` (issue)
- `rpc_log_table_inventory_snapshot` (log)
- `rpc_request_table_fill` (request)
- `rpc_create_financial_txn` (create)

**Recommendation**: Standardize on CRUD verbs or domain verbs:
- Mutations: `rpc_create_*`, `rpc_update_*`, `rpc_delete_*`
- Domain actions: `rpc_issue_*`, `rpc_approve_*`, `rpc_activate_*`

---

### 3.3 Read-Only Access Enforcement Unclear

**Severity**: 🟡 MEDIUM
**Location**: Lines 1890, 2052

**Issue**:
- Line 1890: Finance references Visit (FK) as "read-only"
- Line 2052: MTL references casino_settings as "READ-ONLY via database trigger"

**Cohesion Problem**: How is "read-only" enforced? RLS? Application layer? Trust?

**Recommendation**: Define enforcement mechanism:
- RLS denies writes from non-owning services
- OR: Foreign key constraints prevent writes
- OR: Application-layer contract (least secure)

---

### 3.4 Event Payload Schema Not Centralized

**Severity**: 🟡 MEDIUM
**Location**: Lines 315-340, 1631-1632, 1772

**Issue**: Event payloads defined inline per service:
- Line 316-327: RatingSlip events
- Line 329-340: Loyalty events
- Line 1632: TableContext events
- Line 1772: FloorLayout events

**Cohesion Problem**: No central event schema registry; hard to validate consistency

**Recommendation**: Create `EVENT_CATALOG.md` with all event schemas in one place

---

### 3.5 Audit Log Shape Mentioned But Not Defined

**Severity**: 🟡 MEDIUM
**Location**: Lines 19, 1635

**Issue**:
- Line 19: "canonical audit shape `{ts, actor_id, casino_id, domain, action, dto_before, dto_after, correlation_id}`"
- Line 1037-1045: `audit_log` table has DIFFERENT schema: `{id, casino_id, domain, actor_id, action, details, created_at}`

**Cohesion Problem**: Declared canonical shape doesn't match actual schema

**Recommendation**: Update schema to match canonical shape OR update canonical shape to match schema

---

### 3.6 Dealer Role Semantics Added Late

**Severity**: 🟢 LOW
**Location**: Lines 1008-1033

**Issue**: Dealer role clarification added as exception instead of integrated into role taxonomy

**Cohesion Problem**: Feels like a patch rather than core design

**Recommendation**: Move dealer semantics to Casino Service role taxonomy section (near line 999)

---

### 3.7 FloorLayout vs TableContext Boundary Unclear

**Severity**: 🟡 MEDIUM
**Location**: Lines 1646, 1776-1777, 1348

**Issue**:
- FloorLayout owns "table slot placements" (line 1776)
- TableContext owns "Gaming tables" (line 899)
- How do slots map to actual tables?

**Recommendation**: Add explicit mapping:
- FloorLayout owns **design-time** slot definitions
- TableContext owns **runtime** table instances
- Activation event triggers slot → table assignment

---

### 3.8 Policy Evaluation vs Issuance Split Not Enforced

**Severity**: 🟢 LOW
**Location**: Line 1847

**Issue**: Line 1847 describes pure `evaluate_mid_session_reward_policy()` function but:
- No schema for this function
- No enforcement that issuance RPCs call it
- Could be violated by future developers

**Recommendation**: Add SQL function definition or mark as application-layer contract

---

## 4. SUMMARY STATISTICS

| Category | Count | Severity Breakdown |
|----------|-------|-------------------|
| **Contradictions** | 3 | 🔴 Critical: 1, 🔴 High: 1, 🟡 Medium: 1 |
| **Vague Statements** | 12 | 🟡 Medium: 7, 🟢 Low: 5 |
| **Cohesion Issues** | 8 | 🟡 Medium: 5, 🟢 Low: 3 |
| **Total Issues** | **23** | **Critical: 1, High: 1, Medium: 13, Low: 8** |

---

## 5. RECOMMENDED ACTIONS (Priority Order)

### Priority 1: CRITICAL (Do Immediately)

1. **Separate Current from Target State** (Contradiction 1.2)
   - Create "Current State" and "Target State (Post-Security-Migration)" sections
   - Add migration tracking table showing what's implemented vs planned
   - Update all RLS examples with clear state labels

### Priority 2: HIGH (Do This Sprint)

2. **Clarify Chip Custody Monetary Boundary** (Contradiction 1.1)
   - Add explicit statement about custody WITH monetary metadata
   - Document Finance vs TableContext responsibility split

3. **Define Event System Architecture** (Vague 2.1)
   - Specify technology (Supabase Realtime vs Postgres NOTIFY)
   - Document retry/failure semantics

4. **Standardize Idempotency Pattern** (Cohesion 3.1)
   - Pick one naming convention
   - Apply consistently across all services

### Priority 3: MEDIUM (Do Next Sprint)

5. **Complete Role Taxonomy** (Vague 2.3, 2.9, 2.11)
   - Define ALL roles referenced in RLS policies
   - Add role permission matrix

6. **Fix Audit Log Schema Mismatch** (Cohesion 3.5)
   - Align declared shape with actual schema
   - Generate migration if needed

7. **Document Service Factory Pattern** (Vague 2.4)
   - Add code example
   - Link to implementation guide

8. **Centralize Event Schemas** (Cohesion 3.4)
   - Create EVENT_CATALOG.md
   - Link from SRM

### Priority 4: LOW (Backlog)

9. **Add RPC Naming Convention** (Cohesion 3.2)
10. **Define CQRS-Light Criteria** (Vague 2.6)
11. **Add KPI Thresholds** (Vague 2.5)
12. **Implement CI Validation Scripts** (Vague 2.12)

---

## 6. CONCLUSION

The SRM is **functionally useful** but **not truly canonical** in its current state due to:

1. **Mixing aspirational and current architecture** without clear boundaries
2. **Undefined integration patterns** (events, service factories, read-only enforcement)
3. **Inconsistent naming conventions** that reduce pattern recognition

**Overall Grade**: **B-** (Useful reference, needs tightening)

**Recommendation**: Address Priority 1-2 items before marking document as "CANONICAL." Current status should be "**CANONICAL (with exceptions)**" or "**REFERENCE (migration in progress)**"

---

**Next Steps**:
1. Review this audit with architecture team
2. Assign owners to Priority 1-2 items
3. Create tracking issues in project management system
4. Schedule follow-up audit after fixes applied
