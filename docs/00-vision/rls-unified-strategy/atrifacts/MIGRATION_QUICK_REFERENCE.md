# Migration Strategy Quick Reference Card

**Quick decision guide for PT-2 auth/RLS remediation**

---

## TL;DR

**Problem:** RLS policies fail under connection pooling (session vars don't persist)

**Solution:** Choose your path based on timeline and risk tolerance

| Track | Time | Risk | MVP Safe | End State |
|-------|------|------|----------|-----------|
| **A (Patch)** | 2-3 days | LOW | ✅ YES | Hybrid RLS |
| **B (Overhaul)** | 1-2 weeks | MEDIUM | ⚠️ NO | JWT-only |
| **Phased (A→B)** | 5 weeks | LOW | ✅ YES | JWT-only |

**Recommended:** Phased approach (Track A for MVP, Track B post-MVP)

---

## Decision Tree

```
START: How much time until MVP?
│
├─ <1 week
│  └─ Track A only
│     └─ Accept hybrid RLS as end-state
│
├─ 1-2 weeks
│  └─ Phased (Track A Week 1, validate Week 2)
│     └─ Decide on Track B after validation
│
├─ 2-3 weeks
│  └─ Phased (Track A Week 1, Track B Week 2-3)
│     └─ Ship MVP with clean architecture
│
└─ Post-MVP (stable production)
   └─ Phased (Track A immediate, Track B after 2-3 week validation)
      └─ Production metrics inform Track B
```

---

## Track Comparison (At a Glance)

### Track A: Patch (Self-Injection)

**What:** Add `PERFORM set_rls_context(...)` to start of each RPC

**Effort:** 18 hours (12 RPCs × ~1.5 hours each)

**Rollback:** 5 minutes per RPC (just revert function)

**Pros:**
- ✅ Fast (2-3 days)
- ✅ Low risk (proven pattern)
- ✅ Incremental (per-RPC deployment)
- ✅ MVP safe

**Cons:**
- ❌ Dual-path technical debt
- ❌ Eventual need for Track B (if architectural clarity desired)

**Best For:** MVP urgency, risk-averse teams, small teams

---

### Track B: Overhaul (JWT-Only)

**What:** Remove all `current_setting()` from policies, use only `auth.jwt()`

**Effort:** 64 hours (116 policies + 22 RPCs + middleware)

**Rollback:** 2-4 hours per context (multi-table schema DDL)

**Pros:**
- ✅ Clean architecture (single source of truth)
- ✅ Perfect pooling compatibility
- ✅ Eliminates technical debt

**Cons:**
- ❌ Slow (1-2 weeks)
- ❌ Medium risk (system-wide changes)
- ❌ Complex rollback
- ❌ Not MVP safe (delays launch)

**Best For:** Post-MVP, architectural clarity priority, large teams

---

### Phased: Track A → Track B

**What:** Do Track A first (MVP), then Track B post-MVP (clean architecture)

**Effort:** 82 hours total (Track A: 18h, Validation: 0h, Track B: 64h)

**Rollback:**
- Track A: 5 min per RPC
- Track B: 2-4 hours per context (but Track A fallback available)

**Pros:**
- ✅ MVP ships fast (Track A Week 1)
- ✅ Production data informs Track B (reduces risk)
- ✅ Clean end-state (Track B after validation)
- ✅ Safety net (can stay on Track A if Track B fails)

**Cons:**
- ⚠️ Two migration efforts (staged over 5 weeks)
- ⚠️ Longer total timeline

**Best For:** MOST teams (combines speed + safety + clean architecture)

---

## Risk Levels

```
Track A:  ███░░░░░░░ 30%  LOW
Track B:  ██████░░░░ 60%  MEDIUM
Phased:   ███░░░░░░░ 30%  LOW (avg across 5 weeks)
```

**Why Phased is Low Risk:**
- Track A proven pattern (4 RPCs already use it)
- 2-week validation reduces Track B risk
- Fallback to Track A if Track B fails

---

## Rollback Speed

```
Track A:  ████████░░ 5 min per RPC
Track B:  ███░░░░░░░ 2-4 hours per context
Phased:   ████████░░ 5 min (Track A), 2-4h (Track B with fallback)
```

---

## Timeline Visual

```
TRACK A ONLY
─────────────────────────────────────
W1: ████ Track A complete → MVP ✅
W2+: Hybrid RLS indefinitely

TRACK B ONLY
─────────────────────────────────────
W1-2: ████████ Track B migration
W3: MVP delayed ⚠️

PHASED (RECOMMENDED)
─────────────────────────────────────
W1: ████ Track A → MVP ✅
W2-3: ░░░░ Validate (no code changes)
W4-5: ████████ Track B → Clean arch ✅
```

---

## Cost-Benefit (Quick View)

| Metric | Track A | Track B | Phased |
|--------|---------|---------|--------|
| **Time to MVP** | 3 days | 2 weeks | 3 days ✅ |
| **Total Time** | 3 days | 2 weeks | 5 weeks |
| **Engineering Hours** | 18h | 64h | 82h |
| **Technical Debt** | HIGH ❌ | NONE ✅ | NONE ✅ |
| **Rollback Complexity** | LOW ✅ | MEDIUM ⚠️ | LOW ✅ |
| **MVP Risk** | LOW ✅ | HIGH ❌ | LOW ✅ |

**Winner:** Phased (best time-to-MVP + clean end-state + low risk)

---

## What Gets Fixed

### Current State (Broken)
```
RLS Compliance:  ███████░░░░░░░░░ 56% (65/116 policies)
RPC Safety:      ██████░░░░░░░░░░ 55% (12/22 pooling-safe)
Loyalty Policies: ░░░░░░░░░░░░░░░ 0% (all broken - P0)
```

### After Track A
```
RLS Compliance:  ████████████████ 100% ✅
RPC Safety:      ████████████████ 100% ✅
Loyalty Policies: ████████████████ 100% ✅
Architecture:    ████████░░░░░░░░ Hybrid (dual-path)
```

### After Track B
```
RLS Compliance:  ████████████████ 100% ✅
RPC Safety:      ████████████████ 100% ✅
Loyalty Policies: ████████████████ 100% ✅
Architecture:    ████████████████ JWT-only (clean) ✅
```

---

## Success Criteria (Checklist)

### Track A Complete (24 Hours)
- [ ] ADR-015 scanner: 0 issues
- [ ] All 22 RPCs pooling-safe
- [ ] Loyalty endpoint: 200 status
- [ ] Production guard: service client blocked
- [ ] Error rate: ≤ baseline
- [ ] Query latency: ±5% baseline

### Track B Complete (7 Days)
- [ ] All 116 policies JWT-only
- [ ] Cross-tenant isolation: 100%
- [ ] Performance regression: <10%
- [ ] JWT claim freshness: <1% stale
- [ ] No production incidents

---

## When to Choose What

### Choose Track A If:
- ✅ MVP in <2 weeks
- ✅ Team size: 1-2 engineers
- ✅ Risk tolerance: LOW
- ✅ Comfortable with technical debt

### Choose Track B If:
- ✅ Post-MVP (1+ month runway)
- ✅ Team size: 3+ engineers
- ✅ JWT sync proven reliable (99%+)
- ✅ Architecture clarity > velocity

### Choose Phased If:
- ✅ MVP in 2-3 weeks
- ✅ Want clean end-state but can't risk MVP
- ✅ Have capacity to validate in production
- ✅ Want safety net (fallback if Track B fails)

**Most teams → Phased**

---

## Rollback Scenarios

### Track A: Single RPC Failure
```
1. Identify failed RPC (check logs)
2. Revert function (CREATE OR REPLACE)
3. Test (integration test for that RPC)
4. Monitor (5 minutes)
Time: 5-10 minutes
```

### Track B: Context Failure
```
1. Halt migration (stop further contexts)
2. Revert migration (DROP/CREATE policies)
3. Restore service layer (git revert)
4. Test (cross-tenant isolation suite)
5. Monitor (2 hours extended)
Time: 2-4 hours
```

---

## Red Flags (When to Rollback)

### Track A
- ❌ Error rate >1% (baseline: 0.01%)
- ❌ Audit log attribution errors
- ❌ Integration tests fail

**Action:** Rollback that RPC immediately

### Track B
- ❌ Cross-tenant data leak detected
- ❌ Error rate >5%
- ❌ Query latency >20% regression
- ❌ JWT claim sync <95% success

**Action:** Rollback entire context, halt migration

---

## Monitoring (Critical Metrics)

### During Migration
```
Error Rate:      Target: ≤ 0.01% (baseline)
Query Latency:   Target: ±10% baseline
Attributions:    Target: 100% correct
Cross-Tenant:    Target: 0 violations
```

### Post-Migration (24h for Track A, 7d for Track B)
```
RLS Violations:  Target: 0
JWT Freshness:   Target: <1% stale (Track B only)
Performance:     Target: <10% regression
Incidents:       Target: 0
```

---

## Resource Requirements

| Resource | Track A | Track B | Phased |
|----------|---------|---------|--------|
| **Engineers** | 2 | 2-3 | 2 |
| **Time** | 2-3 days | 1-2 weeks | 5 weeks |
| **Staging** | Required | Required | Required |
| **Prod Window** | Business hours | Off-hours | Mixed |

---

## Next Steps (If Approved)

### Week 1 (Track A)
```
Day 1 AM:  P0 fixes (loyalty + production guard) - 1h
Day 1 PM:  Financial RPCs (3) - 4h
Day 2:     Floor/loyalty/rating slip RPCs (11) - 10h
Day 3:     Testing + deployment - 3h
```

### Week 2-3 (Validation)
```
Monitor:   JWT claim sync latency
Monitor:   RLS policy performance
Collect:   Audit log data
Decide:    Proceed to Track B?
```

### Week 4-5 (Track B - If Approved)
```
Pre-flight: Rollback scripts + staging dry-run
Migrate:    7 contexts over 9 days
Validate:   Cross-tenant + performance
Complete:   Remove session var infrastructure
```

---

## Documentation Links

1. **Detailed Analysis:** `MIGRATION_TRANSITION_STRATEGY_ANALYSIS_20251214.md`
2. **Visual Timeline:** `MIGRATION_TIMELINE_COMPARISON.md`
3. **Rollback Playbook:** `MIGRATION_RISK_ROLLBACK_PLAYBOOK.md`
4. **Executive Summary:** `MIGRATION_EXECUTIVE_SUMMARY.md`

---

## Final Recommendation

```
┌────────────────────────────────────────────────────────┐
│ RECOMMENDED: PHASED APPROACH (Track A → Track B)       │
├────────────────────────────────────────────────────────┤
│ Week 1: Execute Track A (fix P0/P1, ship MVP)          │
│ Week 2-3: Production validation (collect metrics)      │
│ Week 4-5: Execute Track B (clean architecture)         │
│                                                        │
│ Benefits:                                              │
│ ✓ MVP ships on time                                   │
│ ✓ Low risk (proven pattern first)                     │
│ ✓ Production data informs Track B                     │
│ ✓ Safety net (fallback to Track A)                    │
│ ✓ Clean end-state (JWT-only)                          │
└────────────────────────────────────────────────────────┘
```

---

**Print this page for quick reference during planning meetings.**

---

**Last Updated:** 2025-12-14
**Status:** Ready for approval
