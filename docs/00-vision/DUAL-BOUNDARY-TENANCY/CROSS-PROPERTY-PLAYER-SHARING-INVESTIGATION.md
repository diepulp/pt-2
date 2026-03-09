# Cross-Property Player Data Sharing — Investigation Synthesis Report

**Date:** 2026-03-09
**Status:** Investigation Complete (with Operational Addendum)
**Triggered by:** Business requirement — club members registered at Casino A should be visible across all properties under the same company umbrella
**Investigation Team:** 4 domain experts (RLS/Security, Data Model, Service Layer, Migration Feasibility)
**Addendum:** [`cross-property-player-sharing-addendum(2).md`](cross-property-player-sharing-addendum(2).md) — Operational scope, enrollment policy (Option B), scanner deferral, UX states

---

## Executive Summary

**Verdict: Technically feasible. Medium-High effort. No architectural dead-ends.**

PT-2's player identity model is already global (`player` table has no `casino_id`), and the `player_casino` junction table supports multi-property enrollment. The blocking factors are all in the **isolation layer**: RLS policies, context derivation, and service queries all hard-scope to a single `casino_id` with no company-level awareness.

The `company` entity — designed as the parent of casinos — is fully orphaned: the table exists, the FK exists, but zero rows are ever created. This is the foundational gap.

| Dimension | Current State | Required State |
|-----------|--------------|----------------|
| Company table | Empty (0 rows, never populated) | Populated during bootstrap |
| RLS context | `app.casino_id` only | + `app.company_id` |
| Staff binding | 1:1 with casino | 1:N via junction table |
| RLS policies | Casino-scoped (116 policies) | Dual-mode: casino OR company |
| Player identity | Global (correct) | No change needed |
| Operational data | Casino-scoped writes | Casino-scoped writes + company-scoped reads |

**Estimated delivery: 4 phases over 20-26 weeks (full), or 3-4 weeks for Phase 1 foundation only.**

---

## 1. What Already Works (Favorable Architecture)

The investigation revealed that PT-2's data model is better positioned for this than expected:

1. **Player is already global** — The `player` table has no `casino_id` column. A single player row can be enrolled at multiple casinos via the `player_casino` composite-key junction table. This is the correct design per ADR-022 v7.1.

2. **Company schema exists** — `company` table with `casino.company_id` FK is in the baseline migration. The relationship `Company → Casino(s) → Player(s)` is modeled; it's just never populated.

3. **RLS Pattern C is extensible** — The hybrid pattern (`COALESCE(session_var, jwt_claim)`) can be extended to include `app.company_id` without changing the pattern's fundamental structure.

4. **Pool tenancy supports this** — ADR-023's Pool model (shared schema, single Supabase project) means all company data lives in the same database. No cross-project federation needed.

5. **Append-only ledgers are safe** — Finance, loyalty, and compliance ledgers are already immutable. Company-scoped reads don't compromise ledger integrity since writes remain casino-scoped.

---

## 2. What Blocks Cross-Property Access (7 Barriers)

| # | Barrier | Severity | Root Cause |
|---|---------|----------|------------|
| B1 | Company table is empty | P0 | `rpc_bootstrap_casino` never creates company rows |
| B2 | No `app.company_id` in RLS context | P0 | `set_rls_context_from_staff()` only derives `casino_id` |
| B3 | Staff are single-casino bound | P0 | `staff.casino_id` is NOT NULL 1:1 FK; no junction table |
| B4 | All 116 RLS policies are casino-only | P0 | Policies use `casino_id = app.casino_id` exclusively |
| B5 | Service queries explicit casino filter | P1 | CRUD methods pass `casino_id` in `.eq()` calls |
| B6 | RPCs validate single-casino context | P1 | `set_rls_context_from_staff()` returns one casino |
| B7 | ADR-024 INV-8 forbids `casino_id` as RPC input | P1 | Cross-casino RPCs need a sanctioned parameter pattern |

---

## 3. Data Sharing Taxonomy

The investigation established clear boundaries for what should be shared vs isolated:

### Shared (Company-Level Reads)

| Data | Tables | Rationale |
|------|--------|-----------|
| Player profile | `player` | Already global; name, DOB, demographics |
| Enrollment history | `player_casino` | Which properties, when enrolled |
| Visit history (read-only) | `visit` | Cross-property activity timeline |
| Loyalty balance (aggregated) | `player_loyalty` | Company-wide points summary |
| Financial summary (aggregated) | `player_financial_transaction` | Total buy-ins/cash-outs across properties |

### Isolated (Casino-Scoped, Never Shared)

| Data | Tables | Rationale |
|------|--------|-----------|
| Rating slip telemetry | `rating_slip` | Casino-specific game settings, house edge |
| Individual loyalty entries | `loyalty_ledger` | Casino-specific reward policies, accrual rates |
| Individual financial txns | `player_financial_transaction` | Casino-specific gaming day, compliance |
| MTL/AML entries | `mtl_entry` | Jurisdictional compliance, per-property audit trail |
| Promo coupons | `promo_coupon` | Casino-specific redemption rules |
| Staff observations | `player_note`, `player_tag` | Casino-specific operational context |

### Design Principle

> **Reads cross the company boundary. Writes never do.**
>
> Staff at Casino B can see that a player visited Casino A and has X loyalty points there. Staff at Casino B cannot issue rewards at Casino A or modify Casino A's records.

### Operational Scope (per Addendum)

The near-term target is **manual patron lookup + prompted local activation**, not scanner-level card interoperability. See [Addendum](cross-property-player-sharing-addendum(2).md) for full details.

**In scope:** Manual staff-initiated patron lookup across sister properties, prompted local activation at the current property (Option B), local instantiation for gaming action.

**Out of scope:** Card scanner / swipe interoperability, physical card credential unification, automatic cross-property enrollment on first use, any cross-property mutation of another casino's live operational records.

**Enrollment Policy — Option B (Prompted Local Activation):**
A patron discovered through company-scoped lookup is **not automatically playable** at the current property. Staff must explicitly confirm local activation before gaming action begins. This preserves a visible decision point and keeps local enrollment auditable.

**Three UX States During Lookup:**

| State | Condition | Staff Action |
|-------|-----------|-------------|
| **A — Found, active locally** | `player_casino` row exists for current casino | Proceed directly to local gaming workflow |
| **B — Found across company, not active locally** | Player exists but no local enrollment | UI presents "Activate at this property"; confirmation creates local enrollment |
| **C — Not found** | No matching global player | Fall back to standard new-patron onboarding |

**Local Instantiation Means:**
- Confirm or create Casino B enrollment (`player_casino` row)
- Create Casino B visit / session context
- Create Casino B operational rows for gaming action
- Optionally surface company-level read-only summaries for hosting context

**Local Instantiation Does NOT Mean:**
- Mutating Casino A's visit or rating slip
- Reusing another property's live operational rows as shared mutable state
- Issuing or editing Casino A's rewards / loyalty / compliance records

> Cross-property visibility is a **recognition capability**. Gaming action remains a **local operational capability**.

---

## 4. Proposed RLS Pattern: Company-Scoped Reads

The RLS Security investigator designed a dual-mode pattern that preserves backward compatibility:

```sql
-- Template: Company-Scoped Read + Casino-Scoped Write
CREATE POLICY player_casino_read_company ON player_casino
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      -- Path 1: Same casino (existing behavior, unchanged)
      casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      OR
      -- Path 2: Same company (NEW — cross-property reads)
      (
        NULLIF(current_setting('app.company_id', true), '')::uuid IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM casino c
          WHERE c.id = player_casino.casino_id
          AND c.company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
        )
      )
    )
  );

-- Writes remain casino-scoped (no company fallback)
CREATE POLICY player_casino_insert_same_casino ON player_casino
  FOR INSERT WITH CHECK (
    casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
  );
```

**Key properties:**
- Single-casino users see no behavioral change (Path 1 matches as before)
- Company context is additive (Path 2 only activates when `app.company_id` is set)
- Write policies are untouched — casino-scoped enforcement preserved
- `app.company_id` is derived server-side (not spoofable), consistent with ADR-024

---

## 5. Phased Implementation Strategy

### Phase 1: Foundation (3-4 weeks) — Complexity: M

**Goal:** Company entity exists, context includes `company_id`, all casinos backfilled.

| Deliverable | Type | Notes |
|-------------|------|-------|
| Extend `rpc_bootstrap_casino` with optional company params | Migration | Backward-compatible (params default NULL) |
| Backfill all existing casinos with company rows | Migration | One company per casino initially |
| Amend `set_rls_context_from_staff()` to derive `app.company_id` | Migration | JOIN casino → company for derivation |
| Update `lib/supabase/rls-context.ts` | Code | Return `companyId` from RPC |
| Update bootstrap form UI | Code | Add optional "Company Name" field |

**ADR impact:** ADR-024 amendment (add `company_id` to return type + SET LOCAL)
**Risk:** Low — additive changes, backward-compatible defaults
**Gate:** All casinos have non-null `company_id` (query audit)

### Phase 2: Multi-Casino Staff Access (4-6 weeks) — Complexity: L

**Goal:** Staff can access multiple casinos under same company via junction table + tenant picker.

| Deliverable | Type | Notes |
|-------------|------|-------|
| Create `staff_casino_access` junction table | Migration | PK: (staff_id, casino_id), access_level enum |
| Backfill from existing `staff.casino_id` | Migration | Preserve all current assignments |
| Amend `set_rls_context_from_staff(p_selected_casino_id)` | Migration | Tenant picker support with company validation |
| Build tenant picker UI | Code | Dashboard header dropdown; hidden for single-casino users |
| Add `rpc_get_accessible_casinos()` | Migration | List casinos staff can access |

**ADR impact:** ADR-024 INV-8 amendment (allow `p_selected_casino_id` with company validation)
**Risk:** High — context derivation becomes more complex; tenant picker UX
**Gate:** Multi-casino staff can switch tenants; single-casino users unaffected

### Phase 3: Company-Scoped RLS (5-7 weeks) — Complexity: XL

**Goal:** All RLS policies support company-scoped reads; cross-property player data visible.

| Deliverable | Type | Notes |
|-------------|------|-------|
| Rewrite player-domain policies (8-10 tables) | Migration | Dual-mode: casino OR company |
| Add company-scoped read views | Migration | `v_player_company_profile`, `v_company_loyalty_summary` |
| Add composite indexes for company JOINs | Migration | Performance: `casino(company_id)` index |
| Comprehensive RLS integration tests | Tests | Both single-casino and cross-company paths |
| SEC-001 policy matrix update | Docs | Document new company-scoped templates |

**ADR impact:** ADR-023 guardrail amendment, SEC-002 dual-boundary model
**Risk:** CRITICAL — one policy mistake blocks all users. Requires 4-agent pre-deployment review, shadow policies, staged rollout.
**Gate:** RLS audit passes; 72-hour production soak with 0 unexpected denials

### Phase 4: Service Layer & API (5-7 weeks) — Complexity: L

**Goal:** All services, routes, and UI support company-scoped queries.

| Deliverable | Type | Notes |
|-------------|------|-------|
| Add company-scoped CRUD methods to all services | Code | `getVisitsAcrossCompany()`, `getBalanceAcrossCompany()`, etc. |
| New API route handlers for cross-company endpoints | Code | `/api/v1/company/[id]/players/[pid]/summary` |
| New React Query hooks | Code | `usePlayerVisitsAcrossCompany()`, etc. |
| Player profile company view | Code | Tab: "This Casino" vs "Across Company" |
| Company-level loyalty/financial dashboards | Code | Aggregated views with per-property breakdown |

**Risk:** Medium — contained to application layer; TypeScript catches most errors
**Gate:** E2E tests pass for both single-casino and cross-property scenarios

---

## 6. ADR Impact Summary

| ADR | Amendment Scope | Key Change |
|-----|----------------|------------|
| **ADR-023** (Multi-Tenancy) | Guardrail 1 | Add company as secondary boundary alongside casino |
| **ADR-024** (Context Derivation) | INV-8 + return type | Add `company_id` to RPC return; allow `p_selected_casino_id` |
| **ADR-030** (Auth Hardening) | D1 return value | Extend to include `company_id` in authoritative context |
| **ADR-040** (Identity Provenance) | Category B expansion | Allow cross-casino staff refs within company boundary |
| **ADR-015** (Connection Pooling) | Pattern C | Add `app.company_id` to hybrid pattern |
| **SEC-001** (Policy Matrix) | Coverage criteria | Add company-scoped policy templates |
| **SEC-002** (Security Model) | Boundary model | Elevate company from metadata to secondary boundary |

**No contradictions.** All amendments are additive/clarifying. The current ADR stack was designed with extensibility in mind.

---

## 7. Risk Assessment (Consolidated)

### P0 Risks (Must mitigate before implementation)

| Risk | Phase | Mitigation |
|------|-------|------------|
| RLS policy blocks all users | 3 | Atomic deployment; shadow policies; 4-agent review; staged rollout |
| Cross-company data leak | 3 | Comprehensive RLS audit; Supabase audit logs; extended soak test |
| Staff multi-casino role ambiguity | 2 | Define explicit role-to-company-casino mapping rules pre-Phase-2 |

### P1 Risks (Require guardrails)

| Risk | Phase | Mitigation |
|------|-------|------------|
| JWT claims staleness for `company_id` | 1-2 | Derive from RPC (authoritative), not JWT; add trigger on staff reassignment |
| Company-scoped query performance | 3-4 | Composite indexes; pagination; materialized views for aggregation |
| Backward compatibility gap | 1+3 | Never deploy Phase 3 without Phase 1 complete; atomic changeset |
| Silo escape hatch incompatibility | 3 | Disable cross-company features for Silo-deployed customers; feature flag |

### P2 Risks (Manageable via policy)

| Risk | Phase | Mitigation |
|------|-------|------------|
| Audit trail complexity | 3 | Add `is_cross_company_access` flag to audit_log |
| Gaming day calculation mismatch | 4 | Preserve `casino_id` + `gaming_day` in all aggregations |
| Loyalty balance aggregation confusion | 4 | Keep per-casino balances; aggregation is view-only, never writeable |

---

## 8. Blast Radius Summary

| Layer | Files Modified | Files Created | Estimated LOC |
|-------|---------------|---------------|---------------|
| Migrations (DDL + RLS) | 0 | 11 | ~1,500 |
| Service Layer | 10-15 | 5-8 | ~1,200 |
| API Routes | 5-8 | 8-12 | ~800 |
| Hooks / React Query | 5-8 | 6-10 | ~600 |
| UI Components | 8-12 | 3-5 | ~800 |
| Tests | 5-8 | 15-20 | ~2,000 |
| Documentation | 8-10 | 2-3 | ~500 |
| **Total** | **~45-60** | **~50-70** | **~7,400** |

---

## 9. Cross-Property Audit Expectations (per Addendum)

Because cross-property lookup expands visibility, local activation should be auditable as a first-class event.

**Minimum audit payload:**
- Actor staff ID
- Home casino ID (staff's assigned property)
- Selected casino ID (property where action occurs)
- Target player ID
- Action type (`company_lookup`, `local_activation`)
- Timestamp
- Reason / trigger where applicable

This is especially important because Option B introduces a deliberate staff confirmation step that must leave an audit trail.

---

## 10. Scanner Deferral & Future-Proofing (per Addendum)

Card scanner support is deferred and **not** required for the current manual-lookup rollout. However, the architecture must avoid assumptions that would make scanner adoption painful later.

**Core principle:** A scanner should be introduced later as **another lookup input**, not as a different business workflow.

**Architectural guidance:**
1. **Keep lookup method separate from patron identity** — A card number is a credential/lookup key, not the canonical player identity
2. **Keep activation separate from lookup UI** — Local activation is an explicit action, not a side effect inside the search screen
3. **Do not fuse discovery, activation, and gameplay start** — These remain distinct steps: resolve patron → determine local status → activate if needed → create local records
4. **Preserve Option B semantics** — Scanner success should not automatically imply local play authorization unless business policy deliberately changes

**Interface shape to preserve** (conceptual, not exact naming):
- `resolvePatron(input)` — identity resolution from any source
- `getLocalPatronStatus(playerId, casinoId)` — enrollment check
- `activatePatronLocally(playerId, casinoId, actorId)` — explicit activation
- `startLocalGamingSession(playerId, casinoId, ...)` — casino-scoped session creation

If these concerns stay separated, scanner support can be added later with minimal disruption.

---

## 11. Recommendations

### Recommended Path: Phase 1 Now, Phases 2-4 Post-MVP

**Rationale:** Phase 1 (3-4 weeks) resolves the P1 company orphan gap, establishes the foundation for cross-property features, and is fully backward-compatible. Phases 2-4 represent significant effort and should be committed only when the business case is confirmed.

| Action | Timeline | Decision Gate |
|--------|----------|---------------|
| **Phase 1: Company Bootstrap + Context** | Next sprint | Architecture approval |
| **Phase 2: Multi-Casino Staff** | Post-MVP Q2 | Product + Security approval |
| **Phase 3: Company-Scoped RLS** | Post-MVP Q2-Q3 | Security audit + 4-agent review |
| **Phase 4: Service Layer + UI** | Post-MVP Q3 | Full go/no-go |

### Immediate Next Steps

1. **ADR-041 Draft** — Formalize cross-property player sharing as an architectural decision (new ADR)
2. **PRD-050 Draft** — Product requirements for cross-property player visibility
3. **Phase 1 Sprint Planning** — Bootstrap RPC amendment + company backfill + context extension
4. **Security Review** — 2-agent review of this report + gap documents alignment

### Architectural Guardrails for Implementation

1. **Reads cross the company boundary. Writes never do.** — All mutations remain casino-scoped.
2. **`app.company_id` is derived server-side** — From `set_rls_context_from_staff()` via `casino.company_id` JOIN. Never from client input.
3. **Phase 3 RLS is atomic with Phase 1 backfill** — Never deploy company-scoped policies without company data populated first.
4. **Single-casino users must remain unaffected** — All changes are additive; existing flows preserved.
5. **Silo customers opt out** — Cross-company features disabled for per-casino Silo deployments (ADR-023 escape hatch).
6. **Prompted local activation (Option B)** — Cross-property discovery does not imply local play authorization. Staff must explicitly activate the patron at the current property. (per Addendum)
7. **Lookup source decoupled from tenancy rules** — Keep patron identity resolution, local enrollment check, activation, and session creation as distinct steps. This ensures future scanner support can plug in without parallel workflows. (per Addendum)
8. **Cross-property actions are auditable** — Every company-scoped lookup and local activation event must be logged with actor, home casino, target casino, player, action type, and timestamp. (per Addendum)

---

## 12. Investigation Sources

### Documents Reviewed
- `docs/80-adrs/ADR-023-multi-tenancy-storage-model-selection.md`
- `docs/80-adrs/ADR-024_DECISIONS.md`
- `docs/80-adrs/ADR-030-auth-system-hardening.md`
- `docs/80-adrs/ADR-040-identity-provenance-rule.md`
- `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
- `docs/80-adrs/ADR-020-rls-track-a-mvp-strategy.md`
- `docs/30-security/SEC-001-rls-policy-matrix.md`
- `docs/30-security/SEC-002-casino-scoped-security-model.md`
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- `docs/issues/gaps/GAP-COMPANY-ENTITY-ONBOARDING-ORPHAN.md`
- `docs/issues/gaps/GAP-COMPANY-CASINO-RLS-CONTEXT.md`

### Schema Analyzed
- `supabase/migrations/00000000000000_baseline_srm.sql` — Company + casino + staff + player schema
- `supabase/migrations/20251229152317_adr024_rls_context_from_staff.sql` — Authoritative context RPC
- `supabase/migrations/20260208140547_prd025_rpc_bootstrap_gap4.sql` — Bootstrap RPC
- `supabase/migrations/20260208140546_prd025_staff_invite_company_rls.sql` — Company deny-by-default RLS
- `supabase/migrations/20251210013421_staff_casino_id_not_null.sql` — Staff single-casino constraint
- All player-domain RLS policy migrations (player, player_casino, visit, rating_slip, loyalty, financial, MTL)

### Code Audited
- `services/player/crud.ts` — Player CRUD (global scope confirmed)
- `services/visit/crud.ts` — Visit CRUD (casino-explicit)
- `services/loyalty/crud.ts` — Loyalty CRUD (casino-explicit)
- `services/player-financial/crud.ts` — Financial CRUD (casino-explicit)
- `services/mtl/crud.ts` — MTL CRUD (casino-explicit)
- `lib/supabase/rls-context.ts` — Context injection
- `types/database.types.ts` — Type definitions
