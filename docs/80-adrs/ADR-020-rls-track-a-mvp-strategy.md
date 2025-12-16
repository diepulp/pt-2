# ADR-020: RLS Track A Hybrid Strategy for MVP

**Status:** Accepted
**Date:** 2025-12-15
**Owner:** Architecture
**Decision type:** Architecture + Security
**Supersedes:** None
**Related:** ADR-015, SEC-001, SEC-002

---

## Context

### The Situation

PT-2 has two viable RLS architecture paths:

- **Track A (Hybrid):** `set_rls_context` RPC per request + RLS policies using `COALESCE(current_setting('app.casino_id'), jwt.app_metadata.casino_id)` + `auth.uid() IS NOT NULL`

- **Track B (JWT-only):** Remove `set_rls_context`, RLS policies use only `auth.jwt() -> 'app_metadata' ->> 'casino_id'`

An 8-agent analysis was conducted to evaluate both tracks. The analysis identified Track B as the superior long-term architecture (simpler, Supabase-native, fewer moving parts), but also identified Track A as lower-risk for MVP.

### The Real Scale

PT-2 serves a small casino operation:
- ~ 13 gaming tables
- ~ 10-15 concurrent users maximum

At this scale:
- Performance differences between Track A and Track B are negligible
- Connection pooling concerns are theoretical, not practical
- The primary risk is **rework**, not performance

### The Core Problem

Migrating to Track B requires rewriting 116 RLS policies across 15 tables. This is the same magnitude of work that has caused repeated delays and regressions. The question is not "which is better?" but "when is the right time to migrate?"

---

## Decision

### Track A is the MVP architecture. Track B migration requires prerequisites.

**For MVP, lock in Track A hybrid as "current truth":**

1. `set_rls_context` RPC called per request
2. RLS policies use: `COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)`
3. All policies include `auth.uid() IS NOT NULL`
4. SECURITY DEFINER RPCs self-inject context (per ADR-015 Phase 1A)

**Track B migration prerequisites (all must be true):**

1. Real users exist and are actively using the system
2. RLS has been stable in production for months (not weeks)
3. Automated scanning and testing is robust enough to catch regressions
4. There is genuine capacity with no higher-priority work

---

## MVP Requirements

### Phase 0: P0 Bug Fix (Complete)

- [x] Fix Loyalty JWT path: `auth.jwt() -> 'app_metadata' ->> 'casino_id'`
- [x] Migration deployed: `20251214195201_adr015_prd004_loyalty_rls_fix.sql`

### Phase 1: ADR-015 Compliance (Required for MVP)

- [x] ADR-015 scanner reports 0 issues (scanner fixed 2025-12-15; 63 were false positives from single-line regex)
- [ ] Verify all SECURITY DEFINER RPCs have self-injection (scanner checks this, manual verification needed)
- [ ] Write execution spec (EXEC-RLS-001) for remaining hardening work

### High-Value Tests (Required for MVP)

- [ ] Cross-casino denial tests (User A cannot see Casino B data)
- [ ] Role boundary tests (dealer vs pit boss vs admin permissions)
- [ ] Pooling sanity tests (same behavior under Supavisor)

**After completing Phase 0, Phase 1, and tests: RLS is good enough for MVP.**

---

## Post-MVP Validation (Phase 2)

When real users exist:

- Monitor JWT sync reliability (does the trigger fire consistently?)
- Track token refresh timing (are claims ever stale?)
- Verify zero cross-tenant incidents in audit_log

This is observational work, not engineering work. No code changes required.

---

## Track B Migration (Phase 3 - Not Scheduled)

Track B is the correct end-state architecture. It is simpler, Supabase-native, and has fewer failure modes.

However, Phase 3 is a **full rewrite of 116 RLS policies**. This work will NOT be scheduled until:

1. Phase 2 validation shows JWT claims are reliable in production
2. The system has been stable for months
3. Automated tooling can validate the migration
4. There is genuine capacity (not fighting fires elsewhere)

When eventually executed, Phase 3 is a time-boxed cleanup project, not an existential re-architecture.

---

## Rationale

### Why Not Track B Now?

| Factor | Reality |
|--------|---------|
| Performance | Irrelevant at 10-15 users |
| Scalability | Will never reach hypothetical limits |
| Simplicity | Track A is manageable with existing tooling (scanner, templates) |
| Risk | Track B migration = 116 policy rewrites = high regression risk |
| Timeline | MVP is the priority; Track B delays shipping |

### Why Track A is Acceptable

- ADR-015 scanner validates compliance automatically
- Template 5 (Pattern C hybrid) is standardized and documented
- SECURITY DEFINER RPCs self-inject context (no pooling gaps)
- JWT fallback provides safety net if `set_rls_context` fails
- Both tracks achieve equivalent tenant isolation when implemented correctly

### The Real Lesson

The analysis found Track B "wins" on 8 of 13 evaluation criteria. But those criteria included speculative performance numbers and theoretical scale concerns that don't apply to PT-2's actual usage.

At 13 tables and 10-15 users, the winning criterion is: **which approach ships faster with fewer regressions?** That's Track A.

---

## Consequences

### Positive

- **MVP ships faster:** No 116-policy rewrite blocking launch
- **Lower regression risk:** Incremental fixes, not wholesale replacement
- **Pragmatic:** Decisions based on actual scale, not hypothetical growth
- **Reversible:** Track B migration remains an option when conditions warrant

### Negative

- **Technical debt:** Track A is more complex than Track B
- **Maintenance burden:** Developers must understand hybrid pattern
- **Deferred simplification:** The "right" architecture is postponed

### Neutral

- ADR-015 compliance work still required (63 issues)
- Scanner and template tooling must be maintained
- Phase 2 monitoring adds operational overhead (minimal)

---

## Verification

### MVP Readiness Checklist

- [x] ADR-015 scanner reports 0 issues (fixed 2025-12-15)
- [x] All SECURITY DEFINER RPCs self-inject context (scanner validates; verified 2025-12-16)
- [x] Cross-casino denial tests passing (PRD-010 WS3 - 2025-12-16)
- [ ] Role boundary tests passing (NOT STARTED - deferred per PRD-010 scope)
- [x] Pooling sanity tests passing (existing rls-pooling-safety tests)
- [x] No P0/P1 RLS bugs open (casino table RLS + mtl_audit_note denial policies deployed)
- [x] Execution spec (PRD-010 EXECUTION-SPEC) written and approved

### Phase 3 Prerequisites Checklist (Future)

- [ ] Real users active for 3+ months
- [ ] Zero cross-tenant incidents in production
- [ ] JWT sync failure rate < 0.01%
- [ ] Automated migration validation tooling exists
- [ ] No higher-priority work competing for capacity

---

## References

- [ADR-015: RLS Connection Pooling Strategy](./ADR-015-rls-connection-pooling-strategy.md)
- [AUTH_RLS_EXTERNAL_REFERENCE_OVERVIEW.md](../20-architecture/AUTH_RLS_EXTERNAL_REFERENCE_OVERVIEW.md) - External validation from AWS, Supabase, Crunchy Data
- [Unified Strategy Analysis](../00-vision/rls-unified-strategy/AUTH_RLS_UNIFIED_STRATEGY_20251214.md)
- [SEC-001: RLS Policy Matrix](../30-security/SEC-001-rls-policy-matrix.md)
- [OVER_ENGINEERING_GUARDRAIL.md](../70-governance/OVER_ENGINEERING_GUARDRAIL.md)

---

## Changelog

- 2025-12-15: Initial ADR created based on 8-agent analysis and user review
  - Corrected speculative performance claims
  - Established Track A as MVP architecture
  - Track B gated on concrete prerequisites
  - Defined MVP completion criteria
