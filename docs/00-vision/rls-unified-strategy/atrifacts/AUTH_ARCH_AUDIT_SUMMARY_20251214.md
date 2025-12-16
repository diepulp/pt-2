# PT-2 Authentication Architecture Audit Summary

**Date:** 2025-12-14
**Auditor:** Claude System Architect Sub-agent
**Scope:** System-wide auth architecture per ADR-015 and AUTH_ARCH_GAPS_FINDINGS_AND_REMEDIATIONS.md

**Related Documents:**
- Full JSON Report: `/home/diepulp/projects/pt-2/docs/issues/AUTH_ARCH_AUDIT_REPORT_20251214.json`
- Gap Findings: `docs/issues/AUTH_ARCH_GAPS_FINDINGS_AND_REMEDIATIONS.md`
- ADR-015: `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
- RLS Investigation: `docs/issues/RLS-INVESTIGATION-FINDINGS-20251214.md`

---

## Executive Summary

**Overall Posture:** TRANSITIONAL_WITH_ACTIVE_RISKS
**Maturity Level:** Level 2 - Defined (transitioning to Level 3 - Managed)

PT-2's authentication architecture is in a **transition state** between legacy session-variable-based RLS (Pattern B) and modern JWT-first authorization (Pattern A). ADR-015 Phases 1 and 2 have successfully mitigated connection pooling issues for the rating slip service, but **architectural debt remains** in the form of dual auth mechanisms, ungoverned service client usage, and inconsistent RPC security patterns.

### Key Findings

✅ **What's Working:**
- ADR-015 Phase 1/2 successfully deployed (transaction-wrapped RLS context + JWT backfill)
- Rating slip RPCs hardened with self-injection + Template 5 validation
- FloorLayoutService RLS policies compliant per SEC-006
- Audit logging present in core RPCs (rating slip, floor layout)

⚠️ **Active Risks:**
- **P0 CRITICAL:** Service client (`createServiceClient()`) ungoverned; RLS bypass risk
- **P0 ACTIVE:** 63 RLS policy anti-patterns causing production 500 errors (loyalty service)
- **P1 HIGH:** SECURITY DEFINER RPCs inconsistently validated; privilege escalation surface
- **P2 MEDIUM:** Audit coverage gaps (service client ops, dev mode, failed authz checks)

❌ **Blockers to JWT-Only Migration (Phase 3):**
- Dev mode pattern incompatible with JWT-only (uses service client with no JWT)
- Role/casino changes require re-login (UX friction from token refresh)

---

## Gap Validation Results

| Gap | Status | Validation | Priority |
|-----|--------|------------|----------|
| **GAP 1: Sticky Context with Pooling** | PARTIALLY_REMEDIATED | ✅ CONFIRMED | P1 |
| **GAP 2: Execution Identity Ambiguity** | ACTIVE_VULNERABILITY | ✅ CONFIRMED | **P0** |
| **GAP 3: SECURITY DEFINER Bypass** | PARTIALLY_GOVERNED | ✅ CONFIRMED | P1 |
| **GAP 4: RPC Trust Boundaries** | INCONSISTENT | ✅ CONFIRMED | P1 |
| **GAP 5: Implicit Context Magic** | DESIGN_CHOICE | ✅ ACKNOWLEDGED | P2 |
| **GAP 6: Audit Observability** | PARTIAL_COVERAGE | ✅ CONFIRMED | P2 |

### GAP 1: Sticky Context Assumption (Connection Pooling)

**Status:** PARTIALLY_REMEDIATED

**Evidence:**
- ✅ `set_rls_context()` RPC wraps SET LOCAL in single transaction (Phase 1)
- ✅ Rating slip RPCs self-inject context (Phase 1A)
- ❌ FloorLayoutService, PlayerFinancialService, TableContextService lack self-injection
- ❌ Multi-step workflows outside rating slip still vulnerable

**Current Mitigation:** Transaction-wrapped `set_rls_context()` ensures context persists within pooled connection transaction.

**Remaining Risk:** Cross-RPC workflows in non-rating-slip services susceptible to context loss.

**Affected Bounded Contexts:**
- FloorLayoutService (rpc_create_floor_layout, rpc_activate_floor_layout)
- PlayerFinancialService (rpc_create_financial_txn)
- LoyaltyService (rpc_issue_mid_session_reward - verification needed)
- TableContextService (chip custody RPCs)

---

### GAP 2: Execution Identity Ambiguity (Service Role vs User JWT)

**Status:** ACTIVE_VULNERABILITY ⚠️ **P0 CRITICAL**

**Evidence:**
```typescript
// lib/server-actions/middleware/auth.ts (lines 32-42)
if (isDevAuthBypassEnabled()) {
  ctx.rlsContext = DEV_RLS_CONTEXT;
  ctx.supabase = createServiceClient(); // ❌ BYPASSES RLS
  return next();
}
```

**Security Implications:**
- User actions in dev mode execute with postgres role (auth.uid() returns NULL)
- Service client accessible via `createServiceClient()` with no governance
- No audit trail when service client used (actor_id missing)
- Risk of service client leaking into production code paths

**Current State:**
- **Dev mode:** Service role client used when `DEV_AUTH_BYPASS=true` (default)
- **Production:** Real user JWT required, but service client still accessible
- **No ESLint rule** preventing service client import in user-path code

**Recommended Mitigation:**
1. Add ESLint `no-restricted-imports` rule for `lib/supabase/service.ts`
2. Refactor dev mode to use anon client + seeded session token
3. Document service-path vs user-path execution boundaries

---

### GAP 3: SECURITY DEFINER Bypass RLS

**Status:** PARTIALLY_GOVERNED

**Evidence:**
- ✅ ADR-018 governance implemented (SRM v4.4.0 reference)
- ✅ Rating slip RPCs (4 functions) hardened with Template 5 context validation
- ✅ FloorLayout RPCs (2 functions) hardened per SEC-006
- ❌ Chip custody RPCs lack ADR-018 compliance audit
- ❌ PlayerFinancialService RPC validation status unknown
- ❌ LoyaltyService RPC validation status unknown

**SECURITY DEFINER Inventory:**
- **Total Functions:** ~15-20 estimated
- **Migrations with SECURITY DEFINER:** 10 identified
- **Hardened RPCs:** 8 confirmed (rating slip: 4, floor layout: 2, set_rls_context: 1, sync_staff_jwt_claims: 1)

**RLS Bypass Risk:** SECURITY DEFINER functions can read/write without RLS unless explicitly validated. ADR-018 Template 5 pattern mitigates but not universally applied.

**Recommended Action:** Audit all SECURITY DEFINER RPCs; apply Template 5 validation to 100% of user-path functions.

---

### GAP 4: RPCs Not Treated as Trust Boundaries

**Status:** INCONSISTENT

**Current Patterns:**
- **Pattern A (self-sufficient):** Rating slip RPCs self-inject + validate within single transaction ✅
- **Pattern B (trust middleware):** `set_rls_context()` trusts withServerAction to provide correct values ⚠️
- **Pattern C (mixed):** Some RPCs validate, some don't - inconsistent trust model ❌

**Evidence:**
```sql
-- Rating slip RPC (lines 66-73 in 20251213190000_adr015_fix_rpc_context_injection.sql)
IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
  RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
    p_casino_id, v_context_casino_id;
END IF;
```
✅ Explicit validation

```sql
-- set_rls_context RPC (20251209183033_adr015_rls_context_rpc.sql)
PERFORM set_config('app.actor_id', actor_id::text, true);
PERFORM set_config('app.casino_id', casino_id::text, true);
```
❌ No validation - trusts caller

**Risk:** RPCs without parameter validation can be exploited if middleware bypassed or parameters spoofed.

**Recommendation:** Standardize on Template 5 pattern (ADR-018) for ALL SECURITY DEFINER RPCs.

---

### GAP 5: Over-Reliance on Implicit Context (Magic Variables)

**Status:** DESIGN_CHOICE_WITH_MIGRATION_PATH

**Evidence:**
- `current_setting('app.casino_id')` still primary pattern in hybrid policies
- JWT fallback exists but is secondary (COALESCE pattern)
- **63 RLS policy anti-patterns** found by `adr015-rls-scanner.sh` (per RLS-INVESTIGATION-FINDINGS-20251214.md)
- Migration to JWT-first deferred to ADR-015 Phase 3

**Complexity Drivers:**
```sql
-- Hybrid Pattern C (used in 50+ policies)
casino_id = COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,  -- Session variable
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid       -- JWT fallback
)
```

**Cognitive Load:**
- Two parallel auth mechanisms (SET LOCAL + JWT)
- NULLIF wrappers required to prevent empty string casting errors
- Easy to get wrong (63 broken policies in recent PRD-004 work)

**JWT-First Blockers:**
- Requires token refresh on role/casino changes (user friction)
- Dev mode auth bypass pattern incompatible (service client has no JWT)
- Migration effort across 50+ RLS policies

**Recommendation:** Execute ADR-015 Phase 3 post-MVP; resolve blockers (dev mode JWT compatibility, token refresh UX).

---

### GAP 6: Audit/Observability Not First-Class

**Status:** PARTIAL_COVERAGE

**Evidence:**
```sql
-- Rating slip RPC audit (lines 109-122 in rpc_start_rating_slip)
INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
VALUES (
  p_casino_id, 'rating_slip', p_actor_id, 'start',
  jsonb_build_object('rating_slip_id', v_result.id, ...)
);
```
✅ Present in rating slip RPCs

**Coverage Gaps:**
| Gap Area | Impact |
|----------|--------|
| Service role operations | No actor_id (auth.uid() is NULL) |
| Dev mode operations | No attribution (DEV_RLS_CONTEXT injected but not logged) |
| RPC failures | No audit of failed authorization checks |
| Cross-context calls | No trace of which service called which RPC |

**Audit Quality:**
- **actor_id:** Present when authenticated, NULL when service role ❌
- **casino_id:** Always present (enforced by RLS) ✅
- **correlation_id:** Supported but not universally tracked ⚠️
- **request_id:** Not consistently captured ❌

**Recommendation:** Make audit logging mandatory in ADR-018; add system actor for service-path operations.

---

## Risk Matrix

### Critical Risks (P0)

#### RISK-001: Service Client Leakage into Production User-Path
- **Gap:** GAP 2
- **Likelihood:** Medium | **Impact:** Critical
- **Attack Scenario:** Developer adds `createServiceClient()` call to expedite feature; user actions executed as postgres role, bypassing RLS
- **Current Controls:** None (warning comment only)
- **Mitigation:** ESLint rule to ban service client imports outside system-path

#### RISK-003: RLS Policy Syntax Errors Under Connection Pooling
- **Gap:** GAP 1, GAP 5
- **Likelihood:** High | **Impact:** Medium
- **Status:** ACTIVE (production 500 errors)
- **Evidence:** 63 anti-patterns found; missing NULLIF wrappers cause UUID casting errors
- **Mitigation:** Hotfix migration `20251214195201_adr015_prd004_loyalty_rls_fix.sql` deployed; scanner added to CI

---

### High Risks (P1)

#### RISK-002: SECURITY DEFINER RPC Privilege Escalation
- **Gap:** GAP 3
- **Likelihood:** Low | **Impact:** High
- **Attack Scenario:** Authenticated user crafts RPC call with spoofed casino_id; RPC executes without validation
- **Current Controls:** ADR-018 governance for rating slip and floor layout (partial coverage)
- **Mitigation:** Audit all SECURITY DEFINER RPCs; apply Template 5 to 100%

#### RISK-004: Multi-Step Workflow Context Loss
- **Gap:** GAP 1
- **Likelihood:** Medium | **Impact:** Medium
- **Attack Scenario:** Workflow with multiple RPC calls fails intermittently; wrong tenant data returned
- **Current Controls:** Transaction-wrapped set_rls_context() helps but doesn't solve cross-RPC workflows
- **Mitigation:** RPC self-injection pattern for all multi-step workflows

#### RISK-005: Audit Attribution Gaps
- **Gap:** GAP 6
- **Likelihood:** High | **Impact:** Medium
- **Attack Scenario:** Security incident requires audit trail; service role operations untraceable
- **Current Controls:** Partial audit logging in some RPCs
- **Mitigation:** Mandatory audit logging in ADR-018; system actor pattern

---

## Architectural Debt

### DEBT-001: Dual Auth Mechanism Complexity
- **Cost:** High (every new policy requires careful COALESCE construction; 63 anti-patterns found)
- **Benefit of Fix:** Single source of truth (JWT-only); simpler policies; better pooling performance
- **Migration Effort:** High (50+ policies to rewrite)
- **Timeline:** Post-MVP (ADR-015 Phase 3)

### DEBT-002: Inconsistent RPC Security Patterns
- **Cost:** Medium (security gaps emerge when new RPCs added without Template 5)
- **Benefit of Fix:** Defense in depth; explicit trust boundaries
- **Migration Effort:** Medium (audit all SECURITY DEFINER RPCs)
- **Timeline:** Next sprint (P1)

### DEBT-003: Service Client Governance Gap
- **Cost:** Critical (accidental RLS bypass risk)
- **Benefit of Fix:** Prevent privilege escalation; enforce least-privilege
- **Migration Effort:** Low (ESLint rule + dev mode refactor)
- **Timeline:** Immediate (P0)

### DEBT-004: Audit Logging Not First-Class
- **Cost:** High (compliance gaps; forensics impossible for service-path)
- **Benefit of Fix:** Full attribution; compliance readiness
- **Migration Effort:** Medium (update all RPCs + system actor)
- **Timeline:** Pre-production hardening

---

## Migration Path to JWT-Only (ADR-015 Phase 3)

### Is RPC Self-Injection Sustainable?

**Verdict:** SUSTAINABLE_SHORT_TERM ✅

**Rationale:** RPC self-injection (Phase 1A) solves immediate pooling issues and is defensible as defense-in-depth. However, it perpetuates dual-mechanism complexity (SET LOCAL + JWT). Long-term sustainability requires migration to JWT-only (Phase 3).

**Trade-offs:**

✅ **Pros:**
- Fixes connection pooling context loss immediately
- Works with existing middleware (minimal refactor)
- Explicit validation at RPC boundary (defense in depth)

❌ **Cons:**
- Every RPC must self-inject (boilerplate and cognitive load)
- Still relies on session variables (architectural complexity)
- Doesn't solve dev mode service client issue

**Recommendation:** Continue RPC self-injection for new RPCs in short term; prioritize JWT-only migration for long-term simplification.

---

### JWT-Only Migration Feasibility

**Verdict:** FEASIBLE_WITH_BLOCKERS_RESOLVED ✅

**Effort Estimate:** 4-6 weeks (2 sprints) to resolve blockers + migrate policies
**Risk Level:** Medium (requires careful rollout with feature flags; regression risk on RLS policies)

**Blockers:**

#### BLOCK-001: Dev Mode Incompatible with JWT-Only
- **Problem:** DEV_AUTH_BYPASS uses service client which has no JWT; JWT-only policies would break
- **Resolution:** Use anon client + seeded dev user with JWT claims
- **Effort:** Medium (2-3 days)
- **Priority:** Required for Phase 3

#### BLOCK-002: Role/Casino Change Requires Re-login
- **Problem:** JWT claims only update on token refresh; changing role requires logout
- **Resolution:** Trigger client-side token refresh via Supabase SDK
- **Effort:** Low (1 day)
- **Priority:** Required for Phase 3

**Recommendation:** Prioritize blocker resolution in next sprint; execute Phase 3 migration post-MVP.

---

### Bounded Contexts at Risk

| Bounded Context | Risk Level | Reason |
|-----------------|------------|--------|
| **LoyaltyService** | ⚠️ HIGH (recently mitigated) | 63 RLS anti-patterns found in PRD-004; hotfix deployed |
| **FloorLayoutService** | ⚠️ MEDIUM | RPCs have validation but not self-injection |
| **PlayerFinancialService** | ⚠️ MEDIUM | RPC validation status unknown |
| **TableContextService** | ⚠️ MEDIUM | Chip custody RPCs lack governance audit |

---

## Immediate Action Items (P0)

### 1. Implement Service Client Governance (CRITICAL)
**Owner:** Security/Platform team
**Timeline:** This sprint

**Actions:**
```json
{
  "eslint_rule": {
    "no-restricted-imports": {
      "paths": [
        {
          "name": "lib/supabase/service",
          "message": "Service client bypasses RLS. Only import from system-path (lib/jobs/*, scripts/*, migrations/*)."
        }
      ]
    }
  }
}
```
- Refactor `DEV_AUTH_BYPASS` to use anon client + seeded session
- Document service-path vs user-path boundaries

**Success Criteria:**
- ESLint fails if service.ts imported from `app/` or `services/` directories
- Dev mode uses authenticated session (not service client)
- Security review approves service client usage policy

---

### 2. Complete RLS Policy Remediation (ACTIVE INCIDENT)
**Owner:** Platform team
**Timeline:** This sprint

**Actions:**
- Apply ADR-015 Pattern C to all 63 anti-pattern instances from scanner
- Run `bash scripts/adr015-rls-scanner.sh` until 0 violations
- Add scanner to CI/CD pipeline
- Update SEC-001 with anti-pattern examples

**Success Criteria:**
- adr015-rls-scanner.sh reports 0 anti-patterns
- `GET /api/v1/rating-slips/{id}/modal-data` returns 200 with loyalty data
- All E2E tests pass
- CI blocks merges with RLS anti-patterns

---

## Short-Term Action Items (P1)

### 3. Audit and Harden All SECURITY DEFINER RPCs
**Owner:** Security team
**Timeline:** Next 2 sprints

**Actions:**
- Inventory all SECURITY DEFINER functions (~15-20 estimated)
- For each RPC: verify Template 5 compliance (casino_id mismatch check)
- Add audit_log writes to all user-path RPCs
- Update ADR-018 with mandatory requirements

**Success Criteria:**
- 100% of SECURITY DEFINER RPCs have explicit authorization checks
- Inventory table exists in `docs/30-security/` with compliance status
- All user-path RPCs write audit entries

---

### 4. Standardize Audit Logging as First-Class Contract
**Owner:** Platform team
**Timeline:** Next 2 sprints

**Actions:**
- Update ADR-018: Audit logging mandatory for SECURITY DEFINER RPCs
- Add `audit_log_helper()` function for consistent format
- Implement system actor for service-path operations
- Add correlation_id tracking across all code paths

**Success Criteria:**
- Every SECURITY DEFINER RPC writes audit_log entry
- Service client operations logged with system actor_id
- correlation_id present in all audit entries
- Audit coverage report shows 100%

---

## Medium-Term Roadmap (P2 - Post-MVP)

### 5. Execute ADR-015 Phase 3 (JWT-First Migration)
**Owner:** Platform team
**Timeline:** 2-3 months post-MVP

**Actions:**
1. Resolve BLOCK-001 (dev mode JWT compatibility)
2. Resolve BLOCK-002 (token refresh UX)
3. Rewrite 50+ RLS policies to use `auth.jwt()` as primary
4. Deprecate `set_rls_context()` RPC and `withRLS` middleware
5. Remove COALESCE(current_setting...) patterns

**Success Criteria:**
- All user-path operations use JWT exclusively
- SET LOCAL only used for admin/migration tasks
- RLS policy templates simplified (no COALESCE)
- Performance benchmarks show improvement

---

## Long-Term Vision (P3 - 6+ months)

### 6. Deprecate SET LOCAL Pattern Entirely
**Timeline:** 6+ months

**Deliverables:**
- Remove `set_rls_context()` RPC (no longer needed)
- Remove `withRLS` middleware (JWT-only, no session variable injection)
- Simplified RLS policy templates (auth.jwt() only)

**Success Criteria:**
- `current_setting('app.*')` appears in 0 RLS policies
- All policies use `auth.jwt() -> 'app_metadata'` exclusively
- Performance benchmarks show improvement (fewer RPCs per request)

---

## Conclusion

**Is the current architecture sustainable?**

**Short-term (MVP):** ✅ YES
- RPC self-injection + hybrid policies are defensible
- ADR-015 Phase 1/2 successfully mitigates pooling issues
- Patch approach sufficient for MVP timeline

**Long-term (Production):** ⚠️ WITH CAVEATS
- Dual auth mechanism (SET LOCAL + JWT) introduces complexity and error surface
- 63 RLS anti-patterns demonstrate fragility of hybrid approach
- Service client governance gap is critical security vulnerability
- JWT-only migration path is clear but requires blocker resolution

**Recommended Strategy:**
1. **Immediate (P0):** Fix service client governance + complete RLS policy remediation
2. **Short-term (P1):** Harden all SECURITY DEFINER RPCs + standardize audit logging
3. **Post-MVP (P2):** Execute ADR-015 Phase 3 (JWT-first migration)
4. **Long-term (P3):** Deprecate SET LOCAL entirely; simplify to JWT-only

**Overall Assessment:** PT-2's auth architecture is in a **controlled transition** with clear remediation paths. The current hybrid approach is sustainable for MVP but should be considered **architectural debt** requiring post-MVP resolution.

---

**Next Steps:**
1. Review this audit with security/platform teams
2. Prioritize P0 action items for current sprint
3. Create tracking issues for P1/P2 items
4. Update ADR-015 with blocker resolution plans
5. Add RLS scanner to CI/CD pipeline

**Full JSON report available at:** `/home/diepulp/projects/pt-2/docs/issues/AUTH_ARCH_AUDIT_REPORT_20251214.json`
