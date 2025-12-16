# Auth/RLS Migration Strategy - Executive Summary

**Date:** 2025-12-14
**Prepared for:** PT-2 Technical Leadership
**Prepared by:** System Architect (Migration & Transition Specialist)

---

## The Problem (One Sentence)

PT-2's authentication architecture mixes session variables (transaction-coupled) with JWT claims (pooling-compatible), creating intermittent failures under Supabase's connection pooling.

---

## Two Paths Forward

### Track A: Patch (Self-Injection Pattern)
- **What:** Make each RPC self-sufficient by injecting context within its own transaction
- **Time:** 2-3 days
- **Risk:** Low (proven pattern)
- **MVP Safe:** ✅ Yes
- **Result:** Hybrid RLS (dual-path: session vars + JWT)

### Track B: Overhaul (JWT-Only Pattern)
- **What:** Migrate all RLS policies to use ONLY JWT claims, eliminate session variables
- **Time:** 1-2 weeks
- **Risk:** Medium (system-wide changes)
- **MVP Safe:** ⚠️ No (post-MVP recommended)
- **Result:** JWT-only RLS (single source of truth)

---

## Recommendation

**Phased Approach: Track A → Track B**

1. **Week 1:** Execute Track A (fix P0/P1 issues, ship MVP with hybrid RLS)
2. **Week 2-3:** Production validation (collect JWT sync metrics, validate reliability)
3. **Week 4-5:** Execute Track B (migrate to JWT-only after validation)

**Why This Works:**
- ✅ MVP ships on time (Track A completes in 2-3 days)
- ✅ Production data informs Track B (real JWT sync reliability metrics)
- ✅ Fallback option (stay on Track A if Track B fails)
- ✅ Minimal risk (incremental approach with safety nets)

---

## Risk Comparison

| Dimension | Track A | Track B | Phased |
|-----------|---------|---------|--------|
| **Migration Time** | 2-3 days | 1-2 weeks | 5 weeks total |
| **Rollback Time** | 5 min/RPC | 2-4 hours/context | 5 min (Track A) |
| **Cross-Tenant Leak Risk** | Low (proven) | Medium (new) | Low (hybrid fallback) |
| **Performance Risk** | Very Low | Medium | Low (validated) |
| **MVP Impact** | None | Delays MVP | None (Track A first) |
| **Technical Debt** | Dual-path | None | None (after Track B) |

**Verdict:** Phased approach minimizes risk while achieving clean end-state.

---

## What Gets Fixed

### Current State (Broken)
- ❌ 51/116 RLS policies non-compliant (44% failure rate)
- ❌ 7 RPCs rely on external context (pooling vulnerability)
- ❌ 13 Loyalty policies with wrong JWT path (P0 bug)
- ❌ Dual-path ambiguity (session vars vs. JWT - which is source of truth?)

### After Track A (MVP Ready)
- ✅ 116/116 RLS policies compliant (100%)
- ✅ 22/22 RPCs pooling-safe (self-inject OR JWT-only)
- ✅ All P0/P1 issues resolved
- ⚠️ Dual-path remains (technical debt)

### After Track B (Clean Architecture)
- ✅ JWT-only RLS (single source of truth)
- ✅ Perfect pooling compatibility
- ✅ Simplified middleware (no context injection)
- ✅ Supabase-native pattern

---

## Cost-Benefit Analysis

### Track A: Patch

**Costs:**
- 2-3 days engineering effort (18 hours)
- Accepts dual-path technical debt
- Eventual need for Track B (if architectural clarity desired)

**Benefits:**
- ✅ MVP ships on time
- ✅ Low risk (proven pattern, fast rollback)
- ✅ Incremental deployment (per-RPC)
- ✅ Immediate P0/P1 issue resolution

**ROI:** High (fixes critical bugs, unblocks MVP)

---

### Track B: Overhaul

**Costs:**
- 1-2 weeks engineering effort (64 hours)
- Higher risk (system-wide changes)
- Complex rollback (per-context multi-table)
- Delays MVP if done upfront

**Benefits:**
- ✅ Eliminates dual-path complexity
- ✅ Perfect pooling compatibility
- ✅ Architectural clarity (single source of truth)
- ✅ Supabase-native pattern (long-term maintainability)

**ROI:** High (long-term), but requires production validation first

---

### Phased: Track A → Track B

**Costs:**
- 5 weeks total timeline (Track A: 1 week, Validation: 2 weeks, Track B: 2 weeks)
- Two migration efforts (but staged)

**Benefits:**
- ✅ MVP ships fast (Track A in Week 1)
- ✅ Production data informs Track B (reduces risk)
- ✅ Fallback option (stay on Track A if needed)
- ✅ Clean end-state (Track B after validation)

**ROI:** Highest (combines speed + safety + clean architecture)

---

## Decision Matrix

### Choose Track A Only If:
- MVP deadline within 1-2 weeks
- Team capacity <2 engineers
- Low risk tolerance (production stability critical)
- Comfortable with dual-path technical debt (may stay indefinitely)

### Choose Track B Only If:
- Post-MVP timeline (1+ month runway)
- Team capacity 3+ engineers
- JWT claim sync proven reliable (99%+ uptime)
- Architecture clarity valued over velocity

### Choose Phased Approach If:
- ✅ MVP deadline 2-3 weeks out
- ✅ Want clean end-state but can't risk MVP
- ✅ Have capacity to validate in production before Track B
- ✅ Want safety net (fallback to Track A if Track B fails)

**Most teams should choose: Phased**

---

## Timeline Comparison

```
TRACK A ONLY (MVP Focus)
Week 1: ██████████ Track A complete → MVP ships
Week 2+: Stay on hybrid RLS indefinitely

TRACK B ONLY (High Risk)
Week 1-2: ████████████████████ Track B migration
Week 3: MVP ships (delayed)

PHASED (Recommended)
Week 1: ██████████ Track A complete → MVP ships
Week 2-3: ░░░░░░░░░░░░░░░░░░░░ Production validation
Week 4-5: ████████████████████ Track B migration → Clean architecture
```

**Winner:** Phased approach ships MVP on time AND achieves clean end-state.

---

## Key Metrics

### Track A Success Criteria (24 Hours)
- [ ] ADR-015 scanner: 0 issues
- [ ] All 22 RPCs pooling-safe
- [ ] Loyalty endpoint: 200 status
- [ ] Error rate: ≤ baseline
- [ ] Query latency: ±5% baseline

### Track B Success Criteria (7 Days)
- [ ] All 116 policies JWT-only
- [ ] Cross-tenant isolation: 100% (0 violations)
- [ ] Performance regression: <10%
- [ ] JWT claim freshness: <1% stale
- [ ] No production incidents

---

## Rollback Procedures

### Track A Rollback (5 Minutes)
```sql
-- Revert single RPC function
CREATE OR REPLACE FUNCTION rpc_[name](...) AS $$
  -- Restore original implementation
  -- (Validation logic unchanged, just remove self-injection)
END;
$$;
```
**Risk:** Very Low (per-RPC, no schema changes)

### Track B Rollback (2-4 Hours)
```sql
-- Revert entire context (multi-table)
DROP POLICY [table]_jwt ON [table];
CREATE POLICY [table]_hybrid ON [table] ... -- Restore hybrid
-- Repeat for all tables in context
```
**Risk:** Medium (per-context, schema DDL)

**Phased Advantage:** If Track B fails, system still works (Track A functional).

---

## Resource Requirements

### Track A
- **Engineers:** 2 (1 primary, 1 reviewer)
- **Time:** 2-3 days (18 hours)
- **Staging:** Required for testing
- **Production Window:** Low-risk (can deploy business hours)

### Track B
- **Engineers:** 2-3 (1 primary, 1 reviewer, 1 on-call monitor)
- **Time:** 1-2 weeks (64 hours)
- **Staging:** Required for dry-run
- **Production Window:** Medium-risk (off-hours deployment recommended)

### Phased
- **Engineers:** 2 (same team, staged work)
- **Time:** 5 weeks total (82 hours over 5 weeks)
- **Staging:** Required for both tracks
- **Production Window:** Low-risk (Track A business hours, Track B off-hours)

---

## Open Questions & Risks

### Track A
1. **Question:** How long should we stay on hybrid RLS?
   - **Answer:** Indefinitely acceptable if Track B never executes. Hybrid RLS is functional.

2. **Risk:** Dual-path maintenance burden
   - **Mitigation:** Document canonical pattern (ADR-015 Pattern C), enforce via scanner

### Track B
1. **Question:** What if JWT claim sync is unreliable in production?
   - **Answer:** Stay on Track A (hybrid RLS). Do NOT force Track B.

2. **Risk:** Token refresh latency (role changes delayed)
   - **Mitigation:** Monitor token refresh p95, alert if >60s

3. **Risk:** Cross-tenant data leakage during migration
   - **Mitigation:** Per-context rollback, extensive cross-tenant testing

### Phased
1. **Question:** What if Track B fails after Track A complete?
   - **Answer:** Stay on Track A indefinitely. MVP already shipped, no urgency.

2. **Risk:** Team fatigue (two migrations)
   - **Mitigation:** 2-week break between Track A and Track B for validation

---

## Recommendation Rationale

### Why Phased Approach Wins

**For Business:**
- ✅ MVP ships on time (Track A in Week 1)
- ✅ Minimal risk (proven pattern first)
- ✅ Optionality (can defer Track B if needed)

**For Engineering:**
- ✅ Production data informs architecture (real JWT sync reliability)
- ✅ Clean end-state (Track B eliminates technical debt)
- ✅ Safety net (hybrid RLS fallback if Track B fails)

**For Operations:**
- ✅ Incremental risk (Track A low-risk, Track B after validation)
- ✅ Fast rollback (Track A: 5 min, Track B: per-context if fails)
- ✅ No big-bang migration (phased over 5 weeks)

---

## Next Steps

### Immediate (This Week)
1. **Decision:** Approve phased approach (Track A → Track B)
2. **Schedule:** Assign Track A to Week 1 (2-3 days)
3. **Prepare:** Review rollback procedures, test in staging

### Week 1 (Track A Execution)
1. **Day 1:** P0 fixes (loyalty verification, production guard)
2. **Day 2-3:** P1 fixes (self-inject 7 RPCs, complete hybrid in 9 RPCs)
3. **Day 3 PM:** Deploy to production, 24-hour monitoring

### Week 2-3 (Production Validation)
1. **Monitor:** JWT claim sync latency (<60s p95?)
2. **Monitor:** RLS policy performance (baseline comparison)
3. **Collect:** Audit log attribution data (100% correct?)
4. **Decision:** Proceed to Track B? (If JWT sync reliable, yes)

### Week 4-5 (Track B Execution - If Approved)
1. **Pre-flight:** Create rollback scripts, dry-run in staging
2. **Migrate:** Per-context migration (7 contexts over 9 days)
3. **Validate:** Cross-tenant isolation, performance regression
4. **Complete:** Remove session variable infrastructure, update docs

---

## Approval Required

**Requesting approval for:**

- [ ] **Phased Approach** (Track A → Track B)
- [ ] **Week 1 execution** of Track A (2-3 days)
- [ ] **Week 2-3 production validation** (monitoring only, no code changes)
- [ ] **Conditional Week 4-5 execution** of Track B (pending validation results)

**Alternative options if phased NOT approved:**

- [ ] **Track A only** (ship MVP with hybrid RLS, defer Track B indefinitely)
- [ ] **Track B only** (delay MVP by 1-2 weeks, ship with JWT-only from start)

---

## Success Definition

### MVP Launch Success (End of Week 1)
- ✅ All P0/P1 auth/RLS issues resolved
- ✅ Loyalty endpoint functional (modal-data returns 200)
- ✅ ADR-015 scanner: 0 issues
- ✅ Production stable (24h green, no rollbacks)
- ✅ MVP ships on schedule

### Architectural Clarity Success (End of Week 5)
- ✅ JWT-only RLS (single source of truth)
- ✅ No session variable dependency
- ✅ Perfect pooling compatibility
- ✅ Cross-tenant isolation: 100% (production validated)
- ✅ Technical debt eliminated

---

## Conclusion

**The phased approach (Track A → Track B) is the optimal path:**

1. **Fixes critical bugs fast** (Track A in 2-3 days)
2. **Ships MVP on time** (no delays)
3. **Validates JWT reliability** (production metrics inform Track B)
4. **Achieves clean architecture** (Track B post-MVP)
5. **Provides safety net** (can stay on Track A if Track B fails)

**Recommended Decision:** Approve phased approach, execute Track A in Week 1.

---

## Appendix: Supporting Documents

1. **Detailed Analysis:** `MIGRATION_TRANSITION_STRATEGY_ANALYSIS_20251214.md`
   - Full migration complexity breakdown
   - Incremental deployment strategies
   - Rollback procedures
   - Timeline estimates

2. **Visual Timeline:** `MIGRATION_TIMELINE_COMPARISON.md`
   - Side-by-side track comparison
   - Risk visualization
   - Deployment flexibility analysis

3. **Operational Playbook:** `MIGRATION_RISK_ROLLBACK_PLAYBOOK.md`
   - Per-RPC/per-context rollback procedures
   - Monitoring & alerting strategies
   - Incident response playbook
   - Testing templates

4. **Current State:** `AUTH_RLS_REMEDIATION_PROPOSAL_20251214.md`
   - Unified remediation strategy
   - Gap validation matrix
   - Prioritized action plan

---

**Prepared by:** System Architect (Sub-agent)
**Date:** 2025-12-14
**Status:** Ready for leadership review and approval

---

**Contact:** [Your team's contact info]
**Questions:** [Link to discussion thread/Slack channel]
