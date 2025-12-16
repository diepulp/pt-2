# PT-2 Auth/RLS Migration & Transition Strategy Analysis

**Date:** 2025-12-14
**Perspective:** Migration Safety & Execution Risk
**Context:** Two tracks for resolving RLS pooling incompatibility
**Reference:** `AUTH_RLS_REMEDIATION_PROPOSAL_20251214.md`

---

## Executive Summary

### The Strategic Question

PT-2 has 116 RLS policies with a fundamental architecture mismatch: session variable injection (requires transaction wrapping) vs. JWT claims (native pooling compatibility). Two remediation tracks exist:

- **Track A (Patch):** Make every RPC self-sufficient within its transaction
- **Track B (Overhaul):** Migrate all RLS to JWT-only, eliminate session variables

### Migration Safety Verdict

| Track | Migration Complexity | Incremental? | Rollback Strategy | Timeline | MVP Safe? |
|-------|---------------------|--------------|-------------------|----------|-----------|
| **Track A (Patch)** | **LOW** | ✅ Yes | ✅ Per-RPC rollback | **2-3 days** | ✅ **YES** |
| **Track B (Overhaul)** | **MEDIUM-HIGH** | ⚠️ Partial | ⚠️ All-or-nothing per table | **1-2 weeks** | ⚠️ **POST-MVP** |

**Recommendation:** **Track A for MVP** (fixes P0/P1 issues in 2-3 days), **Track B as strategic Phase 3** (1-2 weeks post-MVP after production validation).

---

## Current State: The Mismatch

### What We Have (Actual Numbers)

| Component | Count | Status |
|-----------|-------|--------|
| **RLS Policies** | 116 active | 56% compliant (65 policies) |
| **RPCs** | 22 total | 14 DEFINER, 8 INVOKER |
| **Bounded Contexts** | 8 domains | 7/8 compliant, 1/8 broken (Loyalty) |
| **Self-Injecting RPCs** | 4 (rating slip) | ✅ Pooling-safe |
| **JWT-Only RPCs** | 8 (loyalty, finance) | ✅ Pooling-safe |
| **External-Context RPCs** | 7 (floor, table) | ❌ **At-risk** |
| **Broken Policies** | 13 (loyalty) | ❌ **P0 issue** |

### The Pattern Conflict

**Session Variables (Current Primary):**
```sql
-- Requires SET LOCAL in SAME transaction as query
casino_id = current_setting('app.casino_id', true)::uuid
```

**JWT Claims (Desired End-State):**
```sql
-- Works across pooled connections, no transaction coupling
casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
```

**Hybrid (ADR-015 Pattern C - Current Transitional):**
```sql
-- Falls back to JWT if session context missing
casino_id = COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)
```

---

## Track A: Patch (Self-Injection Pattern)

### What It Is

Make every SECURITY DEFINER RPC **self-sufficient** by calling `set_rls_context()` at function start, using JWT as fallback for context derivation.

### Migration Complexity: LOW

**Scope:**
- 7 RPCs need self-injection (floor layout: 2, table context: 5)
- 5 RPCs need complete hybrid pattern (loyalty RPCs missing COALESCE)
- 13 policies already fixed (loyalty - deployed 2025-12-14)

**Work Breakdown:**

| Task | Effort | Risk | Dependencies |
|------|--------|------|--------------|
| P0: Verify loyalty fix deployed | 30 min | LOW | Migration `20251214195201` already run |
| P0: Production guard on service client | 10 min | LOW | None |
| P1: Self-inject financial RPCs (3) | 3-4 hours | LOW | Rating slip pattern proven |
| P1: Self-inject floor layout RPCs (2) | 2 hours | LOW | Same pattern |
| P1: Complete hybrid in loyalty RPCs (5) | 2-3 hours | LOW | Straightforward COALESCE addition |
| P1: Update rating slip RPC hybrid (4) | 2 hours | LOW | Already self-inject, just add COALESCE |
| Testing + validation | 3 hours | MEDIUM | Integration test suite |
| **TOTAL** | **13-16 hours** | **LOW** | **2-3 days elapsed** |

### Can It Be Done Incrementally? ✅ YES

**Incremental Path:**

1. **Day 1 AM:** P0 fixes (loyalty verification + production guard) - **1 hour**
2. **Day 1 PM:** Financial RPCs self-injection (highest risk) - **4 hours**
3. **Day 2 AM:** Floor layout + loyalty RPC hybrid completion - **5 hours**
4. **Day 2 PM:** Rating slip RPC hybrid completion + testing - **5 hours**
5. **Day 3:** Integration testing + scanner validation - **3 hours**

**Each RPC migration is independent:**
- ✅ Can deploy one RPC at a time
- ✅ No dependency chain (each RPC self-contained)
- ✅ Rollback = revert single RPC function (no schema changes)

### Rollback Strategy: ✅ EXCELLENT

**Per-RPC Rollback:**

```sql
-- If rpc_request_table_fill causes issues after self-injection patch:
CREATE OR REPLACE FUNCTION rpc_request_table_fill(...)
RETURNS ...
AS $$
BEGIN
  -- Restore original implementation (no self-injection)
  -- Validation still present, just relies on external context
  ...
END;
$$;
```

**Characteristics:**
- ✅ **Granular:** One function at a time, no cascading impact
- ✅ **Fast:** ~5 minutes to revert single RPC
- ✅ **Safe:** Original validation logic remains (no security regression)
- ✅ **Zero downtime:** Can revert during business hours

**Rollback Testing:** Create rollback SQL for each RPC before deploying patch.

### Validation Strategy

**Per-Migration Validation (Real-time):**

1. **Unit Test:** Each RPC with/without session context
   ```typescript
   test('rpc_request_table_fill works without external context', async () => {
     // No set_rls_context() call
     const { error } = await supabase.rpc('rpc_request_table_fill', {...});
     expect(error).toBeNull(); // Should self-inject and succeed
   });
   ```

2. **Integration Test:** Multi-RPC workflow (e.g., fill + snapshot)
   ```typescript
   test('table fill + snapshot atomic workflow', async () => {
     await supabase.rpc('rpc_request_table_fill', {...});
     await supabase.rpc('rpc_log_table_inventory_snapshot', {...});
     // Both should self-inject independently
   });
   ```

3. **Pooling Simulation:** Force connection pool churn
   ```typescript
   test('RPC survives pooled connection changes', async () => {
     // Execute RPC 100 times rapidly (force pool rotation)
     const results = await Promise.all(
       Array(100).fill(null).map(() => supabase.rpc('rpc_...'))
     );
     expect(results.every(r => !r.error)).toBe(true);
   });
   ```

4. **Scanner Verification:**
   ```bash
   bash scripts/adr015-rls-scanner.sh
   # Target: 0 issues in non-superseded migrations
   ```

**Production Validation (Post-Deployment):**

- Monitor RPC error rates (baseline vs. post-patch)
- Audit log attribution checks (casino_id, actor_id correctness)
- Cross-tenant isolation smoke test (Casino A cannot see Casino B data)

### Timeline: 2-3 Days

**Critical Path:**

```
Day 1: P0 fixes + financial RPCs (critical audit path) - 5 hours
Day 2: Floor/loyalty/rating slip RPCs - 10 hours
Day 3: Testing + validation + scanner update - 3 hours
---
Total: 18 hours = 2-3 days with buffer
```

**MVP Safe?** ✅ **YES**

- Can complete before feature freeze
- Low risk (proven pattern, 4 RPCs already using it)
- Incremental deployment reduces blast radius
- Fast rollback if issues arise

### What Stays Dual-Path

After Track A, the system uses **hybrid RLS** (Pattern C):

- ✅ Policies check session vars **OR** JWT (whichever is present)
- ✅ RPCs self-inject session vars from JWT fallback
- ⚠️ Still two code paths to maintain (session + JWT)
- ⚠️ Architectural ambiguity remains (which is "source of truth"?)

**Technical Debt:** Track A patches the immediate issue but does **NOT** eliminate the dual-path complexity.

---

## Track B: Overhaul (JWT-Only)

### What It Is

Eliminate session variable dependency entirely. All RLS policies use **ONLY** JWT claims. No `current_setting()` calls, no `set_rls_context()` RPC.

### Migration Complexity: MEDIUM-HIGH

**Scope:**
- **116 RLS policies** to convert (65 already use hybrid, need JWT-only)
- **22 RPCs** to audit (remove `set_rls_context()` calls)
- **8 service files** to update (no `injectRLSContext()` middleware)
- **All API routes/server actions** to verify (ensure user JWT present)

**Work Breakdown:**

| Task | Effort | Risk | Dependencies |
|------|--------|------|--------------|
| Audit JWT claim sync reliability | 4 hours | MEDIUM | `sync_staff_jwt_claims` trigger validation |
| Convert 65 hybrid policies to JWT-only | 6-8 hours | MEDIUM | Bulk find/replace with validation |
| Test each bounded context (8 domains) | 8 hours | HIGH | Cross-tenant isolation critical |
| Remove `set_rls_context()` from 14 RPCs | 3 hours | LOW | Straightforward deletion |
| Remove `injectRLSContext()` from middleware | 2 hours | LOW | API surface cleanup |
| Service client production guard audit | 2 hours | MEDIUM | Ensure service role never on user path |
| Integration test suite overhaul | 6 hours | HIGH | Rewrite all RLS tests for JWT-only |
| Production monitoring + rollback prep | 4 hours | HIGH | No easy rollback (see below) |
| **TOTAL** | **35-39 hours** | **MEDIUM-HIGH** | **1-2 weeks elapsed** |

### Can It Be Done Incrementally? ⚠️ PARTIAL

**Per-Table Incremental (Possible):**

```sql
-- Phase 1: Convert player table to JWT-only
DROP POLICY player_select_enrolled ON player;
CREATE POLICY player_select_enrolled_jwt ON player
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player.id
        AND pc.casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Phase 2: Convert player_casino table to JWT-only
-- ... (similar)

-- Phase 3: Convert visit table to JWT-only
-- ... (similar)
```

**Constraints:**
- ✅ Can migrate one **bounded context** at a time (e.g., Player domain, then Loyalty, then Floor)
- ⚠️ Within a context, must migrate **all tables together** (foreign key relationships)
- ❌ **Cannot have hybrid state** per table (either session OR JWT, not both)

**Why Not Fully Incremental?**

If `player_casino` uses JWT-only but `player` uses hybrid, queries joining both tables may fail:

```sql
-- Query: Get player with casino enrollment
SELECT p.*, pc.status
FROM player p
JOIN player_casino pc ON pc.player_id = p.id
-- player policy: checks current_setting('app.casino_id')
-- player_casino policy: checks auth.jwt() -> 'app_metadata' ->> 'casino_id'
-- If session context missing, player rows filtered out, join returns empty
```

**Migration Strategy (Per-Context Atomicity):**

1. Casino context (2 tables) - **Day 1-2**
2. Player/Visit context (3 tables) - **Day 3-4**
3. Rating Slip context (2 tables) - **Day 5-6**
4. Floor Layout context (5 tables) - **Day 7-8**
5. Finance/MTL context (4 tables) - **Day 9-10**
6. Loyalty context (3 tables) - **Day 11-12** (already partially JWT-compliant)
7. Table/Chip context (4 tables) - **Day 13-14**

**Risk:** 7-14 days of progressive migration with **partial rollback complexity** (see below).

### Rollback Strategy: ⚠️ COMPLEX

**Rollback Characteristics:**

- ⚠️ **Per-context rollback:** Must revert entire bounded context, not individual tables
- ⚠️ **Schema changes required:** Policies are schema objects (DROP/CREATE)
- ⚠️ **Downtime risk:** Policy recreation may briefly expose data
- ⚠️ **Testing overhead:** Each rollback requires full regression suite

**Rollback Procedure (Example: Player Context):**

```sql
-- Rollback migration: Restore hybrid policies for player domain

-- 1. Drop JWT-only policies
DROP POLICY IF EXISTS player_select_enrolled_jwt ON player;
DROP POLICY IF EXISTS player_casino_select_jwt ON player_casino;
DROP POLICY IF EXISTS visit_select_jwt ON visit;

-- 2. Recreate hybrid policies (Pattern C)
CREATE POLICY player_select_enrolled ON player
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player.id
        AND pc.casino_id = COALESCE(
          NULLIF(current_setting('app.casino_id', true), '')::uuid,
          (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
        )
    )
  );
-- ... (repeat for 8 more policies)

-- 3. Restore injectRLSContext() middleware for this domain
-- (Code change in services/player/*.ts)

-- 4. Re-run integration tests for player domain
```

**Rollback Time:** ~2-4 hours per context (migration + testing)

**Why Complex?**

- Not just code revert (schema state changed)
- Must test rollback path **before** migration (no "git revert" safety net)
- Multi-table contexts have foreign key constraints (order matters)

### Validation Strategy

**Pre-Migration Validation (Critical):**

1. **JWT Claim Sync Reliability Test:**
   ```typescript
   test('JWT claims update within 1 minute of role change', async () => {
     await updateStaff(staffId, { role: 'admin' });
     await waitFor(60_000); // Max token refresh time
     const token = await getAuthToken();
     const claims = decodeJWT(token);
     expect(claims.app_metadata.staff_role).toBe('admin');
   });
   ```

2. **Service Role Leakage Detection:**
   ```typescript
   test('User endpoints never use service role', async () => {
     // Mock service role client
     const serviceClient = createServiceClient();
     await expect(
       api.post('/api/v1/rating-slips', {...}, { client: serviceClient })
     ).rejects.toThrow('SECURITY_VIOLATION');
   });
   ```

**Per-Context Migration Validation:**

1. **Bounded Context Isolation:**
   ```typescript
   describe('Player context JWT-only migration', () => {
     test('Casino A staff cannot see Casino B players', async () => {
       const casinoA = createClient(/* casino_a JWT */);
       const casinoB = createClient(/* casino_b JWT */);

       const { data: playersA } = await casinoA.from('player').select('*');
       const { data: playersB } = await casinoB.from('player').select('*');

       // No cross-tenant leakage
       expect(playersA.every(p => p.casino_id === 'casino-a')).toBe(true);
       expect(playersB.every(p => p.casino_id === 'casino-b')).toBe(true);
     });
   });
   ```

2. **Pooling Stress Test:**
   ```typescript
   test('JWT-only policies survive connection pool churn', async () => {
     // Hammer endpoint to force pool rotation
     const results = await Promise.all(
       Array(1000).fill(null).map(() => api.get('/api/v1/players'))
     );
     expect(results.every(r => r.status === 200)).toBe(true);
   });
   ```

3. **Role Change Propagation:**
   ```typescript
   test('Role change blocks unauthorized actions', async () => {
     const staff = await createStaff({ role: 'pit_boss' });
     const token = await getAuthToken(staff);

     // Demote to dealer
     await updateStaff(staff.id, { role: 'dealer' });
     await waitFor(60_000); // Token refresh

     // Admin-only action should fail
     await expect(
       api.post('/api/admin/floor-layouts', {}, { token })
     ).rejects.toThrow('FORBIDDEN');
   });
   ```

**Production Validation (Post-Migration):**

- Monitor RLS policy violation errors (should be zero)
- Audit log completeness (all actions attributed)
- Performance regression check (JWT policies may have different query plans)
- Token refresh latency monitoring (role changes may have 1-60s delay)

### Timeline: 1-2 Weeks

**Critical Path:**

```
Week 1:
  Day 1-2: JWT sync validation + Casino context migration - 12 hours
  Day 3-4: Player/Visit context migration - 12 hours
  Day 5: Integration testing + rollback prep - 8 hours

Week 2:
  Day 6-7: Rating Slip + Floor Layout contexts - 12 hours
  Day 8-9: Finance/MTL + Loyalty contexts - 12 hours
  Day 10: Table/Chip context + final validation - 8 hours
---
Total: 64 hours = 8 days elapsed (1.5 weeks with buffer)
```

**MVP Safe?** ⚠️ **NO (Post-MVP Recommended)**

- 1-2 weeks exceeds typical MVP runway
- High risk (all-or-nothing per context)
- Rollback complexity increases incident response time
- JWT token refresh latency may surprise users (role changes delayed)

### What Gets Eliminated

After Track B, the system is **JWT-first/JWT-only**:

- ✅ No `current_setting()` in policies (single source of truth)
- ✅ No `set_rls_context()` RPC (middleware simplified)
- ✅ No dual-path maintenance (one code path)
- ✅ Perfect connection pooling compatibility
- ⚠️ JWT token freshness dependency (role changes require re-login or refresh)

**Benefit:** Architectural clarity, reduced complexity, Supabase-native pattern.

---

## Comparative Analysis

### Migration Complexity Matrix

| Dimension | Track A (Patch) | Track B (Overhaul) |
|-----------|-----------------|---------------------|
| **Lines of Code Changed** | ~200 (12 functions) | ~1000+ (116 policies + middleware) |
| **Files Modified** | 2-3 migration files | 11+ migration files + 8 service files |
| **Schema Objects Changed** | 12 RPCs (functions) | 116 policies (schema DDL) |
| **Test Files Affected** | 3-4 integration tests | 20+ test files (all RLS tests) |
| **Deployment Steps** | 1 migration per RPC | 7 migrations (per-context) |
| **Rollback Steps** | 1 function per RPC | 1 migration per context (multi-table) |

### Risk Assessment

| Risk Category | Track A | Track B |
|---------------|---------|---------|
| **Cross-Tenant Leakage** | LOW (proven pattern) | MEDIUM (new pattern, must validate) |
| **Service Downtime** | VERY LOW (no schema changes) | LOW (policy recreation brief) |
| **Data Loss** | NONE (no data changes) | NONE (no data changes) |
| **Regression Bugs** | LOW (isolated changes) | MEDIUM (system-wide changes) |
| **Performance Regression** | VERY LOW (same query plans) | MEDIUM (JWT policies may differ) |
| **Rollback Failure** | VERY LOW (simple revert) | MEDIUM (multi-step rollback) |
| **Production Incident** | LOW (per-RPC blast radius) | MEDIUM (per-context blast radius) |

### Incremental Deployment Comparison

| Capability | Track A | Track B |
|------------|---------|---------|
| **Per-Function Incremental?** | ✅ YES (12 RPCs independently) | ❌ NO (must group by context) |
| **Pause Mid-Migration?** | ✅ YES (any time) | ⚠️ PARTIAL (between contexts only) |
| **A/B Test New Pattern?** | ✅ YES (one RPC at a time) | ❌ NO (all-or-nothing per table) |
| **Canary Deployment?** | ✅ YES (low-risk RPC first) | ⚠️ PARTIAL (low-risk context first) |
| **Feature Flag Possible?** | ✅ YES (per-RPC flag) | ❌ NO (schema-level change) |

### Rollback Comparison

| Scenario | Track A Rollback | Track B Rollback |
|----------|------------------|------------------|
| **Single RPC Issue** | 5 min (revert function) | N/A (not granular enough) |
| **Context-Wide Issue** | 15 min (revert 2-5 RPCs) | 2-4 hours (revert policies + middleware + tests) |
| **Production Incident** | Fast (single function) | Slow (multi-table DDL) |
| **Rollback Testing** | Unit test per RPC | Full regression per context |
| **Rollback Confidence** | HIGH (proven pattern) | MEDIUM (complex procedure) |

### Validation Effort

| Test Category | Track A | Track B |
|---------------|---------|---------|
| **Unit Tests** | 12 tests (per RPC) | 116 tests (per policy) |
| **Integration Tests** | 8 tests (workflows) | 56 tests (cross-tenant isolation) |
| **Pooling Simulation** | 12 tests (per RPC) | 8 tests (per context) |
| **Production Smoke Tests** | 4 tests (critical paths) | 8 tests (per context) |
| **Performance Benchmarks** | 2 tests (chip custody) | 8 tests (all contexts) |
| **Total Validation Time** | ~8 hours | ~24 hours |

---

## Phased Migration Plan (Recommended: Track A → Track B)

### Phase 1: MVP Stabilization (Track A) - Week 1

**Goal:** Fix P0/P1 issues, ship MVP with hybrid RLS.

**Day 1 (P0 Critical Fixes):**
- ✅ Verify loyalty RLS fix deployed (`20251214195201`)
- ✅ Add production guard to `createServiceClient()` (block service role in prod)
- ✅ Update ADR-015 scanner superseded list
- ✅ Run scanner, verify 0 issues in active migrations

**Day 2-3 (P1 Pooling Safety):**
- ✅ Self-inject financial RPCs (3): `rpc_request_table_fill`, `rpc_request_table_credit`, `rpc_log_table_drop`
- ✅ Self-inject floor layout RPCs (2): `rpc_create_floor_layout`, `rpc_activate_floor_layout`
- ✅ Complete hybrid pattern in loyalty RPCs (5): Add COALESCE+JWT fallback
- ✅ Complete hybrid pattern in rating slip RPCs (4): Add COALESCE+JWT fallback
- ✅ Integration tests: Pooling safety suite for all updated RPCs

**Validation Gate:**
- [ ] ADR-015 scanner: 0 issues
- [ ] Integration tests: 100% pass
- [ ] Loyalty endpoint: `GET /api/v1/rating-slips/{id}/modal-data` returns 200
- [ ] Production guard: `createServiceClient()` throws in NODE_ENV=production

**Outcome:** MVP ships with **hybrid RLS (Pattern C)**, all 22 RPCs pooling-safe.

---

### Phase 2: Production Validation (No Migration) - Week 2-3

**Goal:** Validate hybrid pattern under real load, collect metrics for Track B decision.

**Week 2-3 Actions:**
- Monitor JWT claim sync latency (role changes → token refresh)
- Monitor RLS policy performance (session vars vs. JWT paths)
- Collect audit logs (attribution correctness)
- Identify JWT-only candidates (low token refresh sensitivity)

**Metrics to Collect:**

| Metric | Purpose | Target |
|--------|---------|--------|
| RLS context injection errors | Detect pooling issues | 0 per day |
| JWT claim sync lag | Role change propagation time | <60 seconds p95 |
| Cross-tenant isolation violations | Security regression | 0 ever |
| RPC self-injection overhead | Performance cost | <10ms p95 |
| Service role usage in prod | Security boundary enforcement | 0 (blocked) |

**Decision Point (End of Week 3):**

- **If JWT claim sync reliable + no pooling issues:** Proceed to Track B (Phase 3)
- **If JWT claim sync flaky OR pooling issues persist:** Pause, investigate root cause

---

### Phase 3: JWT-Only Migration (Track B) - Week 4-5 (Post-MVP)

**Goal:** Eliminate session variable dependency, simplify to single auth path.

**Pre-Migration (Week 4, Day 1):**
- [ ] Audit `sync_staff_jwt_claims` trigger reliability (99.9%+ success rate)
- [ ] Create rollback scripts for all 7 bounded contexts
- [ ] Dry-run migration on staging environment
- [ ] Performance benchmark baseline (query latency per context)

**Per-Context Migration (Week 4-5, Day 2-10):**

| Context | Tables | Policies | Effort | Risk | Order |
|---------|--------|----------|--------|------|-------|
| Casino | 2 | 8 | 4h | LOW | 1st (foundational) |
| Player/Visit | 3 | 9 | 6h | MEDIUM | 2nd (high traffic) |
| Finance/MTL | 4 | 8 | 6h | HIGH | 3rd (audit critical) |
| Table/Chip | 4 | 12 | 6h | MEDIUM | 4th (operational) |
| Rating Slip | 2 | 6 | 4h | MEDIUM | 5th (workflow) |
| Floor Layout | 5 | 18 | 8h | LOW | 6th (infrequent) |
| Loyalty | 3 | 13 | 6h | LOW | 7th (already JWT-heavy) |

**Migration Pattern (Per Context):**

```bash
# 1. Deploy migration (JWT-only policies)
npx supabase migration up

# 2. Verify in database
psql -c "SELECT policyname, qual FROM pg_policies WHERE tablename IN ('player', 'player_casino', 'visit');"

# 3. Run integration tests (cross-tenant isolation)
npm test -- player.integration.test.ts

# 4. Deploy service layer changes (remove injectRLSContext for this context)
git push

# 5. Monitor production (30 minutes)
# - RLS errors: should be 0
# - Query latency: should be ±10% baseline
# - Audit logs: should show correct attributions

# 6. If issues: Rollback
npx supabase migration down
git revert HEAD
npm test -- player.integration.test.ts
```

**Post-Migration Cleanup (Week 5, Day 11):**
- [ ] Remove `set_rls_context()` RPC (no longer needed)
- [ ] Remove `injectRLSContext()` from middleware (no longer called)
- [ ] Update SEC-001 documentation (JWT-only canonical pattern)
- [ ] Archive ADR-015 (mission complete)

**Validation Gate:**
- [ ] All 116 policies use JWT-only (no `current_setting()`)
- [ ] All 22 RPCs work without session context
- [ ] Performance regression <10% (query latency)
- [ ] Cross-tenant isolation 100% (zero leakage)
- [ ] Token refresh latency <60s p95

**Outcome:** System is **JWT-only**, single source of truth, perfect pooling compatibility.

---

## Decision Framework

### When to Choose Track A (Patch)

**Indicators:**
- ✅ MVP deadline within 1-2 weeks
- ✅ Team capacity <2 engineers
- ✅ Low risk tolerance (production stability critical)
- ✅ Need incremental deployment (pause/resume mid-migration)
- ✅ Fast rollback critical (5-minute RTO requirement)
- ✅ Limited testing capacity (can't re-test 116 policies)

**Trade-off:** Accepts dual-path technical debt for speed + safety.

---

### When to Choose Track B (Overhaul)

**Indicators:**
- ✅ Post-MVP (1+ month runway)
- ✅ Team capacity 3+ engineers
- ✅ JWT claim sync proven reliable in production (99%+ uptime)
- ✅ Architecture clarity valued over short-term velocity
- ✅ Performance optimization priority (eliminate RPC overhead)
- ✅ Long-term maintenance cost reduction (single path)

**Trade-off:** Higher upfront investment for cleaner end-state.

---

### When to Do Both (Recommended)

**Phased Approach:**

1. **Week 1 (Track A):** Fix P0/P1, ship MVP with hybrid RLS
2. **Week 2-3 (Validation):** Collect production metrics, validate JWT sync
3. **Week 4-5 (Track B):** Migrate to JWT-only if metrics green

**Why This Works:**
- ✅ MVP ships on time (Track A in 2-3 days)
- ✅ Production data informs Track B (real JWT sync reliability)
- ✅ Team learns hybrid pattern before eliminating it (muscle memory)
- ✅ Rollback risk minimized (Track A proven before Track B)

**Risk Mitigation:**
- If Track B migration fails, system still works (hybrid RLS functional)
- If JWT sync unreliable, stay on Track A indefinitely (no forced migration)

---

## Validation Checklists

### Track A Pre-Deployment Checklist

**P0 (Day 1):**
- [ ] Loyalty RLS fix verified in database (`SELECT policyname, qual FROM pg_policies WHERE tablename = 'loyalty_ledger';`)
- [ ] Production guard added to `createServiceClient()` (throws in NODE_ENV=production)
- [ ] ADR-015 scanner updated (superseded migrations list)
- [ ] Scanner run: 0 issues in active migrations

**P1 (Day 2-3):**
- [ ] Financial RPCs self-inject (3): `rpc_request_table_fill`, `rpc_request_table_credit`, `rpc_log_table_drop`
- [ ] Floor layout RPCs self-inject (2): `rpc_create_floor_layout`, `rpc_activate_floor_layout`
- [ ] Loyalty RPCs complete hybrid (5): COALESCE+JWT fallback
- [ ] Rating slip RPCs complete hybrid (4): COALESCE+JWT fallback
- [ ] Integration tests pass (pooling safety suite)

**Validation:**
- [ ] All 22 RPCs have self-injection OR JWT-only pattern
- [ ] Loyalty endpoint returns 200 (`GET /api/v1/rating-slips/{id}/modal-data`)
- [ ] Scanner: 0 issues
- [ ] E2E tests: Rating slip + loyalty workflows pass

---

### Track B Pre-Migration Checklist

**Pre-Flight (Before Any Migration):**
- [ ] JWT claim sync trigger validated (99.9%+ success rate over 1 week)
- [ ] Rollback scripts created for all 7 contexts
- [ ] Staging environment dry-run (all contexts migrated + tested)
- [ ] Performance baseline captured (query latency per context)
- [ ] Monitoring dashboards configured (RLS errors, cross-tenant violations)

**Per-Context Migration Checklist (Repeat for Each of 7 Contexts):**

1. **Pre-Deploy:**
   - [ ] Rollback script tested in staging
   - [ ] Integration tests green in staging
   - [ ] Team on-call (30-minute monitoring window)

2. **Deploy:**
   - [ ] Migration applied (`npx supabase migration up`)
   - [ ] Database policies verified (correct JWT path, no `current_setting()`)
   - [ ] Service layer deployed (remove `injectRLSContext()` for this context)

3. **Validate:**
   - [ ] Integration tests pass (cross-tenant isolation)
   - [ ] RLS errors: 0 in 30 minutes
   - [ ] Query latency: ±10% baseline
   - [ ] Audit logs: correct attributions

4. **Rollback If Needed:**
   - [ ] Migration reverted (`npx supabase migration down`)
   - [ ] Service layer reverted (`git revert HEAD`)
   - [ ] Integration tests pass (hybrid pattern restored)
   - [ ] Incident report created (root cause analysis)

---

## Recommendations

### For MVP (Immediate)

**Use Track A (Patch):**

1. **Day 1:** P0 fixes (loyalty verification + production guard) - 1 hour
2. **Day 2:** Financial RPCs self-injection (highest risk) - 4 hours
3. **Day 3:** Floor/loyalty/rating slip RPCs + testing - 10 hours

**Total: 15 hours = 2 days with buffer**

**Rationale:**
- ✅ Low risk (proven pattern, 4 RPCs already using it)
- ✅ Fast (2-3 days)
- ✅ Incremental (per-RPC deployment)
- ✅ Fast rollback (5 minutes per RPC)
- ✅ MVP ships with hybrid RLS (functional end-state)

---

### For Post-MVP (Strategic)

**Transition to Track B (JWT-Only):**

1. **Week 2-3:** Production validation (collect metrics, validate JWT sync)
2. **Week 4:** Pre-migration prep (rollback scripts, staging dry-run)
3. **Week 5:** Per-context migration (7 contexts over 9 days)

**Total: 3 weeks post-MVP**

**Rationale:**
- ✅ Eliminates dual-path complexity
- ✅ Simplifies to Supabase-native pattern
- ✅ Perfect pooling compatibility
- ✅ Informed by production data (real JWT sync reliability)

---

### Decision Matrix

| Scenario | Recommendation |
|----------|---------------|
| **MVP in 1-2 weeks** | ✅ Track A only |
| **MVP in 3+ weeks** | ✅ Track A → Track B (phased) |
| **Post-MVP (stable production)** | ✅ Track B (after 2-3 week validation) |
| **High risk tolerance** | ⚠️ Track B (with robust testing) |
| **Low risk tolerance** | ✅ Track A (stay on hybrid indefinitely if needed) |
| **Small team (<2 engineers)** | ✅ Track A only |
| **Large team (3+ engineers)** | ✅ Track A → Track B (parallel work) |

---

## Appendix: Migration Scripts

### Track A: RPC Self-Injection Template

```sql
-- Migration: 20251215_XXXXXX_adr015_[context]_rpc_self_injection.sql

CREATE OR REPLACE FUNCTION rpc_[function_name](
  p_casino_id uuid,
  p_actor_id uuid,
  -- ... other params
) RETURNS [return_type]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_staff_role text;
BEGIN
  -- ========================================
  -- ADR-015 Pattern B: Self-Injection
  -- ========================================

  -- Derive context with JWT fallback
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text,
    'pit_boss'  -- Default if both missing (should never happen)
  );

  -- Self-inject context for this transaction
  PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);

  -- Validate context matches parameters
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_CASINO_CONTEXT: No casino_id in session or JWT';
  END IF;

  IF v_context_casino_id IS DISTINCT FROM p_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;

  -- ========================================
  -- Original Business Logic
  -- ========================================

  -- ... (existing function body)

END;
$$;

COMMENT ON FUNCTION rpc_[function_name] IS
  'ADR-015 Pattern B: Self-injecting SECURITY DEFINER RPC. Derives context from JWT if session vars missing. Pooling-safe.';
```

---

### Track B: JWT-Only Policy Template

```sql
-- Migration: 20251216_XXXXXX_adr015_jwt_only_[context]_policies.sql

-- ============================================================================
-- Drop hybrid policies (Pattern C)
-- ============================================================================

DROP POLICY IF EXISTS [table]_select ON [table];
DROP POLICY IF EXISTS [table]_insert ON [table];
DROP POLICY IF EXISTS [table]_update ON [table];

-- ============================================================================
-- Create JWT-only policies (Pattern A)
-- ============================================================================

CREATE POLICY [table]_select_jwt ON [table]
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

COMMENT ON POLICY [table]_select_jwt ON [table] IS
  'ADR-015 Pattern A: JWT-only casino-scoped read. No session variables required. Pooling-safe.';

CREATE POLICY [table]_insert_jwt ON [table]
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text IN ('pit_boss', 'admin')
  );

COMMENT ON POLICY [table]_insert_jwt ON [table] IS
  'ADR-015 Pattern A: JWT-only with role gate. Only pit_boss/admin can insert.';

CREATE POLICY [table]_update_jwt ON [table]
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text IN ('pit_boss', 'admin')
  );

COMMENT ON POLICY [table]_update_jwt ON [table] IS
  'ADR-015 Pattern A: JWT-only with role gate. Only pit_boss/admin can update.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================

NOTIFY pgrst, 'reload schema';
```

---

## Conclusion

**Migration safety analysis complete.**

### Key Findings

1. **Track A (Patch) is MVP-safe:** 2-3 days, low risk, incremental, fast rollback
2. **Track B (Overhaul) is post-MVP strategic:** 1-2 weeks, medium risk, complex rollback
3. **Phased approach recommended:** Track A for MVP, Track B after production validation

### Recommended Path

```
Week 1: Track A (P0/P1 fixes) → MVP ships with hybrid RLS
Week 2-3: Production validation → Collect JWT sync metrics
Week 4-5: Track B (JWT-only) → Eliminate dual-path complexity
```

### Success Criteria

**Track A Complete:**
- [ ] ADR-015 scanner: 0 issues
- [ ] All 22 RPCs pooling-safe
- [ ] Loyalty endpoint: 200 status
- [ ] Production guard: service role blocked

**Track B Complete:**
- [ ] All 116 policies JWT-only
- [ ] Zero `current_setting()` calls
- [ ] Cross-tenant isolation: 100%
- [ ] Performance regression: <10%

---

**End of Analysis**

*Prepared by System Architect sub-agent, 2025-12-14*
