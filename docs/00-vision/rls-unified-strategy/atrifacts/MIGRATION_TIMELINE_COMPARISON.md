# Migration Timeline Comparison: Track A vs Track B

**Visual decision aid for PT-2 auth/RLS remediation strategy**

---

## Track A: Patch (Self-Injection) - 2-3 Days

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          TRACK A: PATCH                                 │
│                     (Self-Injection Pattern)                            │
└─────────────────────────────────────────────────────────────────────────┘

DAY 1: P0 Critical Fixes (5 hours)
├─ 09:00-09:30  Verify loyalty RLS fix deployed ✓
├─ 09:30-09:40  Add production guard (createServiceClient) ✓
├─ 09:40-10:00  Update ADR-015 scanner config ✓
├─ 10:00-10:15  Run scanner validation ✓
│
├─ 10:30-12:30  rpc_request_table_fill self-injection ✓
├─ 12:30-14:00  rpc_request_table_credit self-injection ✓
└─ 14:00-15:30  rpc_log_table_drop self-injection ✓

    ┌────────────────────────────────────┐
    │ MILESTONE: Financial RPCs Safe     │
    │ Can pause here if needed           │
    └────────────────────────────────────┘

DAY 2: Floor Layout + Loyalty RPCs (10 hours)
├─ 09:00-11:00  rpc_create_floor_layout self-injection ✓
├─ 11:00-12:00  rpc_activate_floor_layout self-injection ✓
│
├─ 13:00-14:30  Loyalty RPCs: Add COALESCE (5 RPCs) ✓
├─ 14:30-16:00  Rating slip RPCs: Add COALESCE (4 RPCs) ✓
└─ 16:00-18:00  Integration tests (pooling safety) ✓

    ┌────────────────────────────────────┐
    │ MILESTONE: All RPCs Pooling-Safe   │
    │ Can pause here if needed           │
    └────────────────────────────────────┘

DAY 3: Validation + Deployment (3 hours)
├─ 09:00-10:00  E2E test suite run ✓
├─ 10:00-11:00  Scanner final validation ✓
├─ 11:00-11:30  Production deployment ✓
└─ 11:30-12:00  Production smoke tests ✓

┌─────────────────────────────────────────────────────────────────────────┐
│ ✓ TRACK A COMPLETE                                                      │
│ Total: 18 hours / 2-3 days elapsed                                      │
│ System State: HYBRID RLS (Pattern C) - MVP READY                        │
└─────────────────────────────────────────────────────────────────────────┘

Rollback Capability: Per-RPC (5 minutes each)
Risk Level: LOW ██░░░░░░░░ 20%
MVP Safe: ✓ YES
```

---

## Track B: Overhaul (JWT-Only) - 1-2 Weeks

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        TRACK B: OVERHAUL                                │
│                      (JWT-Only Pattern)                                 │
└─────────────────────────────────────────────────────────────────────────┘

WEEK 1: Foundation + High-Traffic Contexts
├─ DAY 1-2: Pre-Migration Validation (12 hours)
│  ├─ JWT claim sync reliability audit
│  ├─ Rollback script creation (all 7 contexts)
│  ├─ Staging environment dry-run
│  ├─ Performance baseline capture
│  └─ Monitoring dashboard setup
│
├─ DAY 3: Casino Context Migration (4 hours)
│  ├─ 2 tables, 8 policies → JWT-only
│  ├─ Integration tests (cross-tenant isolation)
│  ├─ 30-minute production monitoring
│  └─ Rollback prep (ready if needed)
│
│      ⚠️ CRITICAL: Cannot pause mid-context
│      ⚠️ Must complete all 2 tables together
│
├─ DAY 4-5: Player/Visit Context Migration (12 hours)
│  ├─ 3 tables, 9 policies → JWT-only
│  ├─ HIGH RISK: Most traffic goes here
│  ├─ Extended monitoring (2 hours)
│  └─ Rollback rehearsal (if any issues)
│
│      ⚠️ CRITICAL: Join queries across tables
│      ⚠️ All 3 tables must migrate together
│
└─ END OF WEEK 1 STATUS:
   ├─ 2/7 contexts migrated (Casino, Player/Visit)
   ├─ 17/116 policies JWT-only (15%)
   ├─ Remaining: 5 contexts, 99 policies
   └─ Can pause here (low-risk) OR continue

    ┌────────────────────────────────────┐
    │ DECISION POINT                     │
    │ - Any JWT sync issues? → PAUSE     │
    │ - Cross-tenant leaks? → ROLLBACK   │
    │ - All green? → CONTINUE            │
    └────────────────────────────────────┘

WEEK 2: Remaining Contexts
├─ DAY 6-7: Finance/MTL + Table/Chip (12 hours)
│  ├─ Finance: 4 tables, 8 policies (AUDIT CRITICAL)
│  ├─ Table/Chip: 4 tables, 12 policies
│  └─ Extended monitoring (financial context)
│
├─ DAY 8-9: Rating Slip + Floor Layout (12 hours)
│  ├─ Rating Slip: 2 tables, 6 policies
│  ├─ Floor Layout: 5 tables, 18 policies (complex)
│  └─ Workflow validation (close + restart)
│
├─ DAY 10: Loyalty Context Migration (6 hours)
│  ├─ 3 tables, 13 policies → JWT-only
│  ├─ Already 50% JWT-compliant (less risk)
│  └─ Loyalty endpoint smoke test
│
└─ DAY 11: Post-Migration Cleanup (8 hours)
   ├─ Remove set_rls_context() RPC
   ├─ Remove injectRLSContext() middleware
   ├─ Update SEC-001 documentation
   ├─ Final integration test sweep
   └─ Performance regression check

┌─────────────────────────────────────────────────────────────────────────┐
│ ✓ TRACK B COMPLETE                                                      │
│ Total: 64 hours / 8-10 days elapsed                                     │
│ System State: JWT-ONLY (Pattern A) - CLEAN END-STATE                    │
└─────────────────────────────────────────────────────────────────────────┘

Rollback Capability: Per-Context (2-4 hours each)
Risk Level: MEDIUM ██████░░░░ 60%
MVP Safe: ⚠️ NO (post-MVP recommended)
```

---

## Phased Approach: Track A → Track B (Recommended)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   PHASED APPROACH (RECOMMENDED)                         │
│               Track A for MVP, Track B Post-MVP                         │
└─────────────────────────────────────────────────────────────────────────┘

WEEK 1: MVP Stabilization (Track A)
├─ DAY 1-3: Execute Track A migration (see timeline above)
│  └─ Output: MVP ships with hybrid RLS ✓
│
└─ MILESTONE: MVP LAUNCH 🚀
   System State: HYBRID RLS (functional, pooling-safe)

WEEK 2-3: Production Validation (No Migration)
├─ Monitor JWT claim sync latency
├─ Monitor RLS policy performance
├─ Collect audit log attribution data
├─ Identify JWT-only candidates
│
└─ DECISION GATE: Proceed to Track B?
   ├─ ✓ JWT sync reliable (99%+) → YES
   ├─ ⚠️ JWT sync flaky → NO (investigate)
   └─ ✓ No pooling issues → YES

WEEK 4-5: JWT-Only Migration (Track B)
├─ Execute Track B migration (see timeline above)
│  └─ Output: System is JWT-only, single source of truth ✓
│
└─ MILESTONE: ARCHITECTURAL SIMPLIFICATION COMPLETE ✓
   System State: JWT-ONLY (clean end-state)

┌─────────────────────────────────────────────────────────────────────────┐
│ ✓ PHASED APPROACH COMPLETE                                              │
│ Total: 5 weeks (1 week Track A + 2 weeks validation + 2 weeks Track B)  │
│ Benefits: MVP ships fast, production data informs Track B               │
└─────────────────────────────────────────────────────────────────────────┘

Risk Level: LOW ███░░░░░░░ 30% (hybrid fallback if Track B fails)
MVP Safe: ✓ YES (Track A completes Week 1)
Strategic Win: ✓ YES (Track B eliminates dual-path complexity)
```

---

## Risk Timeline Visualization

```
TRACK A: Patch (Self-Injection)
─────────────────────────────────────────────────────────────────
Risk Level by Day:

DAY 1:  ███░░░░░░░ 30%  (Financial RPCs - moderate risk)
DAY 2:  ██░░░░░░░░ 20%  (Floor/Loyalty - low risk, proven pattern)
DAY 3:  █░░░░░░░░░ 10%  (Testing/validation only)

Cumulative Risk: LOW
Rollback Complexity: VERY LOW (per-RPC revert)
```

```
TRACK B: Overhaul (JWT-Only)
─────────────────────────────────────────────────────────────────
Risk Level by Context Migration:

Casino:        ████░░░░░░ 40%  (Foundational - if fails, everything fails)
Player/Visit:  ████████░░ 80%  (HIGH TRAFFIC - cross-tenant critical)
Finance/MTL:   ██████░░░░ 60%  (AUDIT CRITICAL - attribution must be perfect)
Table/Chip:    █████░░░░░ 50%  (Operational - pooling stress)
Rating Slip:   ████░░░░░░ 40%  (Workflow - close+restart atomic)
Floor Layout:  ███░░░░░░░ 30%  (Infrequent - low risk)
Loyalty:       ██░░░░░░░░ 20%  (Already 50% JWT - lowest risk)

Cumulative Risk: MEDIUM-HIGH (60%)
Rollback Complexity: MEDIUM (per-context multi-table DDL)
```

```
PHASED: Track A → Track B
─────────────────────────────────────────────────────────────────
Risk Level by Week:

WEEK 1:  ███░░░░░░░ 30%  (Track A - proven pattern)
WEEK 2-3: ░░░░░░░░░░ 0%   (Production validation - no changes)
WEEK 4:  ████████░░ 80%  (Track B high-traffic contexts)
WEEK 5:  ████░░░░░░ 40%  (Track B low-traffic contexts)

Cumulative Risk: LOW-MEDIUM (30% avg)
Rollback Complexity: LOW (Track A proven, Track B has fallback)

Safety Net: If Track B fails, system remains on Track A (functional)
```

---

## Deployment Flexibility Comparison

### Track A: Highly Flexible

```
┌────────────────────────────────────────────────────────────┐
│ RPC 1 │ RPC 2 │ RPC 3 │ RPC 4 │ ... │ RPC 12 │            │
│  ✓    │  ✓    │  ✓    │  ⏸️    │ ... │  ⏸️     │            │
└────────────────────────────────────────────────────────────┘
         │       │       └─ Can pause here (mid-migration OK)
         │       └─ Can rollback RPC 3 only (5 minutes)
         └─ Can deploy RPC 2 without RPC 1 (independent)

✓ Per-RPC deployment
✓ Pause at any point
✓ A/B test (one RPC at a time)
✓ Canary (low-risk RPC first)
✓ Feature flag (per-RPC toggle)
```

### Track B: Constrained Flexibility

```
┌────────────────────────────────────────────────────────────┐
│ Context 1 │ Context 2 │ Context 3 │ ... │ Context 7 │     │
│  ✓✓✓✓✓    │  ✓✓✓      │  ⏸️⏸️⏸️⏸️  │ ... │  ⏸️⏸️⏸️    │     │
└────────────────────────────────────────────────────────────┘
   │          │           └─ Can pause here (between contexts)
   │          └─ CANNOT pause mid-context (all-or-nothing)
   └─ Context 1 = 2 tables + 8 policies (atomic unit)

⚠️ Per-context deployment (not per-table)
⚠️ Pause only between contexts (not mid-context)
❌ A/B test (schema changes too broad)
⚠️ Canary (low-risk context first)
❌ Feature flag (schema-level, not app-level)
```

---

## Decision Matrix (Quick Reference)

| Scenario | Track A | Track B | Phased |
|----------|---------|---------|--------|
| **MVP in 1 week** | ✅ BEST | ❌ NO | ⚠️ PARTIAL |
| **MVP in 2 weeks** | ✅ YES | ⚠️ RISKY | ✅ BEST |
| **MVP in 3+ weeks** | ✅ SAFE | ✅ POSSIBLE | ✅ BEST |
| **Post-MVP (stable)** | ⚠️ DEBT | ✅ BEST | ✅ BEST |
| **Small team (1-2)** | ✅ BEST | ❌ NO | ⚠️ SLOW |
| **Large team (3+)** | ✅ SAFE | ✅ YES | ✅ BEST |
| **Low risk tolerance** | ✅ BEST | ❌ NO | ✅ YES |
| **High risk tolerance** | ⚠️ OK | ✅ YES | ⚠️ OK |
| **Need fast rollback** | ✅ BEST | ❌ NO | ✅ YES |
| **Want clean end-state** | ❌ NO | ✅ BEST | ✅ BEST |

**Legend:**
- ✅ BEST = Optimal choice for this scenario
- ✅ YES = Good choice, acceptable
- ✅ SAFE = Safe choice, conservative
- ⚠️ PARTIAL = Possible with caveats
- ⚠️ RISKY = High risk, not recommended
- ⚠️ OK = Acceptable but not ideal
- ⚠️ SLOW = Feasible but slow
- ❌ NO = Not recommended, too risky

---

## Recommended Path by Timeline

### If MVP in 1 Week
```
RECOMMENDED: Track A only
RATIONALE: Only path that completes in time
TIMELINE: 2-3 days
OUTPUT: Hybrid RLS (functional)
DEFER: Track B to post-MVP
```

### If MVP in 2 Weeks
```
RECOMMENDED: Phased (Track A Week 1, validate Week 2)
RATIONALE: Track A completes fast, leaves option for Track B
TIMELINE: Week 1 = Track A, Week 2 = production validation
OUTPUT: Hybrid RLS (functional), ready for Track B post-MVP
BENEFIT: Can start Track B Week 2 if aggressive, or defer
```

### If MVP in 3+ Weeks
```
RECOMMENDED: Phased (Track A Week 1, Track B Week 2-3)
RATIONALE: Time for both, phased reduces risk
TIMELINE: Week 1 = Track A, Week 2-3 = Track B
OUTPUT: JWT-only (clean end-state)
BENEFIT: MVP ships with clean architecture
```

### If Post-MVP (Stable Production)
```
RECOMMENDED: Phased (Track A immediate, Track B after 2-week validation)
RATIONALE: Production data informs Track B (JWT sync reliability)
TIMELINE: Week 1 = Track A, Week 2-3 = validation, Week 4-5 = Track B
OUTPUT: JWT-only (clean end-state)
BENEFIT: Real-world JWT sync metrics reduce Track B risk
```

---

## Success Metrics by Track

### Track A Success Criteria

```
┌─────────────────────────────────────────────────────────────┐
│ TRACK A COMPLETE (Hybrid RLS)                               │
├─────────────────────────────────────────────────────────────┤
│ ✓ ADR-015 scanner: 0 issues                                 │
│ ✓ All 22 RPCs pooling-safe (self-inject OR JWT-only)        │
│ ✓ Loyalty endpoint: GET /api/.../modal-data returns 200     │
│ ✓ Production guard: createServiceClient() throws in prod    │
│ ✓ Integration tests: 100% pass (pooling safety suite)       │
│ ✓ E2E tests: Rating slip + loyalty workflows pass           │
│ ✓ Scanner compliance: 116/116 policies (100%)               │
└─────────────────────────────────────────────────────────────┘

MVP READY: ✓ YES
Technical Debt: Dual-path RLS (session vars + JWT)
Follow-up: Track B recommended post-MVP
```

### Track B Success Criteria

```
┌─────────────────────────────────────────────────────────────┐
│ TRACK B COMPLETE (JWT-Only)                                 │
├─────────────────────────────────────────────────────────────┤
│ ✓ All 116 policies JWT-only (no current_setting())          │
│ ✓ All 22 RPCs work without session context                  │
│ ✓ Cross-tenant isolation: 100% (zero leakage)               │
│ ✓ Performance regression: <10% (query latency)              │
│ ✓ Token refresh latency: <60s p95                           │
│ ✓ JWT claim sync: 99.9%+ success rate                       │
│ ✓ RLS errors: 0 in production (7 days)                      │
│ ✓ Audit logs: 100% attribution correctness                  │
└─────────────────────────────────────────────────────────────┘

MVP READY: ⚠️ NO (post-MVP recommended)
Technical Debt: ELIMINATED (single source of truth)
Architectural State: CLEAN (Supabase-native pattern)
```

---

**End of Timeline Comparison**

*Use this visual guide to make informed migration decisions based on your MVP timeline and risk tolerance.*
