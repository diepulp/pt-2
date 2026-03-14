# SEC Note: Cross-Property Player Recognition and Loyalty Entitlement (Phase 2)

**Feature:** PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION
**Date:** 2026-03-13
**Author:** Lead Architect
**Status:** Draft
**Depends on:** Phase 1 SEC_NOTE (all Phase 1 controls remain in effect)

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|---|---|---|
| `player_casino` rows (cross-property) | PII / Operational | Enrollment records at sister properties. Reveals where a player is known. |
| `player_loyalty` rows (cross-property) | Financial / Operational | Loyalty balance and tier at sister properties. Entitlement state with monetary value. |
| `visit` rows | Operational / Regulatory | Gaming day, visit kind, duration, visit group. Operational telemetry with competitive and regulatory sensitivity. |
| `player_exclusion` rows | Compliance / PII | Exclusion type, jurisdiction, enforcement, reason. Regulated compliance data. |
| `loyalty_ledger` rows | Financial / Operational | Individual accrual/redemption entries with campaign, staff, visit linkage. |
| `rating_slip`, `pit_cash_observation`, `player_financial_transaction`, `mtl_entry` | Financial / Compliance | CRITICAL-sensitivity child tables of `visit`. |
| Recognition RPC response | PII / Financial | Composite payload: identity + enrollment + entitlement + safety signals. |
| `app.company_id` session variable | Integrity | Now consumed by RLS policies (was inert in Phase 1). Incorrect value = cross-company data leakage. |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|---|---|---|---|
| T1 | Cross-company data leakage via company-scoped RLS | Critical | Low | P0 |
| T2 | Operational telemetry leakage via `visit` row exposure | High | Medium | P0 |
| T3 | `player_exclusion` compliance detail leakage | High | Low | P1 |
| T4 | Recognition RPC returns data for wrong company | Critical | Low | P0 |
| T5 | `player_loyalty.preferences` leaks casino-specific config | Medium | Medium | P1 |
| T6 | Local activation creates enrollment without proper authorization | High | Low | P1 |
| T7 | Local redemption double-spend or negative balance | High | Medium | P1 |
| T8 | Stale entitlement after sister-property accrual/redemption | Medium | Medium | P2 |
| T9 | Exclusion safety signal suppressed or missing | High | Low | P1 |
| T10 | SECURITY DEFINER RPC privilege escalation | Critical | Low | P0 |
| T11 | Company-scoped policy on wrong table (scope creep) | High | Medium | P1 |

### Threat Details

**T1: Cross-company data leakage via company-scoped RLS**
- **Description:** Company-scoped SELECT policy on `player_casino` or `player_loyalty` uses incorrect predicate, allowing reads across company boundaries.
- **Attack vector:** Policy bug — EXISTS subquery references wrong column, or `app.company_id` is NULL/empty and COALESCE fails open.
- **Impact:** Staff at Company X reads enrollment/entitlement data for Company Y's players. Tenancy breach.

**T2: Operational telemetry leakage via `visit` row exposure**
- **Description:** Company-scoped RLS is accidentally applied to `visit` table (or `visit` JOIN bypasses child RLS), exposing gaming_day, visit_kind, duration, visit_group_id across properties.
- **Attack vector:** Policy scope creep — developer adds company-scoped read to `visit` reasoning "it's just presence data." Or SECURITY DEFINER RPC returns raw visit rows instead of scalar.
- **Impact:** Cross-property competitive intelligence. Regulatory exposure (gaming_day is jurisdictionally scoped). 5 CRITICAL child tables become indirectly accessible context.

**T3: `player_exclusion` compliance detail leakage**
- **Description:** Recognition RPC returns exclusion details (type, jurisdiction, reason, enforcement) instead of just the safety signal.
- **Attack vector:** RPC implementation returns full row instead of computed boolean + severity.
- **Impact:** Cross-property compliance data leakage. Exclusion details are regulated per jurisdiction.

**T4: Recognition RPC returns data for wrong company**
- **Description:** `rpc_lookup_player_company` fails to validate that results belong to the caller's company.
- **Attack vector:** RPC bugs — missing company_id filter in query, or `set_rls_context_from_staff()` not called before data access.
- **Impact:** Cross-company tenancy breach.

**T5: `player_loyalty.preferences` leaks casino-specific config**
- **Description:** Full `player_loyalty` row is exposed cross-property including `preferences` JSON, which may contain casino-specific program metadata.
- **Attack vector:** RLS grants full row SELECT; no column projection enforced at database level.
- **Impact:** Casino-specific loyalty program configuration visible to sister properties.

**T6: Local activation without authorization**
- **Description:** `rpc_activate_player_locally` creates a `player_casino` enrollment row without proper role check or audit trail.
- **Attack vector:** Missing role guard in RPC. Or activation RPC callable by staff without enrollment authority.
- **Impact:** Unauthorized enrollment creation. Audit gap.

**T7: Local redemption double-spend or negative balance**
- **Description:** Two casinos simultaneously redeem against the same player's entitlement, resulting in negative balance or double-spend.
- **Attack vector:** Race condition — concurrent RPCs at different casinos both read the same balance, both debit.
- **Impact:** Financial loss. Loyalty balance integrity violation.

**T9: Exclusion safety signal suppressed or missing**
- **Description:** Recognition RPC omits the exclusion safety signal, or the signal is computed incorrectly (returns false when exclusions exist).
- **Attack vector:** Bug in exclusion query — wrong company filter, wrong active-check logic, or `player_exclusion` table not yet available (branch dependency).
- **Impact:** Player banned at Casino A is activated at Casino B without warning. Safety gap.

**T10: SECURITY DEFINER RPC privilege escalation**
- **Description:** Recognition or activation RPC runs as `service_role` (SECURITY DEFINER) and exposes data or writes that the calling staff should not access.
- **Attack vector:** RPC reads data beyond what the return type exposes (internal query returns extra columns that leak via error messages). Or RPC fails to call `set_rls_context_from_staff()` before accessing data.
- **Impact:** Privilege escalation. Data exposure beyond intended surface.

**T11: Company-scoped policy on wrong table**
- **Description:** Developer adds company-scoped RLS to a table not approved for cross-property reads (e.g., `visit`, `loyalty_ledger`, `rating_slip`).
- **Attack vector:** Policy scope creep during implementation. No automated guard against unapproved policy broadening.
- **Impact:** Operational telemetry, financial, or compliance data leakage.

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|---|---|---|
| T1 | Company-scoped policy fail-closed + shadow testing | EXISTS subquery requires `app.company_id IS NOT NULL`. Shadow policy deployed before production. 4-agent review of policy SQL. |
| T2 | Tier 2 scalar extraction pattern | `visit` gets NO RLS policy change. Data accessed only inside SECURITY DEFINER RPC which returns `MAX(started_at)` scalar. CI gate: no policy on `visit` references `app.company_id`. |
| T3 | Scalar-only exclusion signal | SECURITY DEFINER RPC returns `boolean` + `text` severity only. No exclusion row data in return type. Code review: RPC RETURNS TABLE has exactly 2 exclusion columns. |
| T4 | Context-first RPC pattern | `rpc_lookup_player_company` calls `set_rls_context_from_staff()` as first statement. All queries filtered by derived `app.company_id`. Integration test: call with staff from Company X, verify zero results from Company Y. |
| T5 | Entitlement projection | Cross-property `player_loyalty` exposure limited to entitlement-essential columns via RPC projection. Even if RLS grants full row, the recognition RPC SELECT list includes only `current_balance`, `tier`. |
| T6 | Role-gated activation RPC | `rpc_activate_player_locally` checks `app.staff_role IN ('pit_boss', 'admin')`. Audit event logged with actor, player, casino. RLS on `player_casino` INSERT unchanged (existing role guard). |
| T7 | Serializable redemption or optimistic lock | Redemption RPC uses `SELECT ... FOR UPDATE` on `player_loyalty` row before debit. Or uses `UPDATE ... WHERE current_balance >= p_amount` atomic guard. Design frozen in ADR-044 D6. |
| T8 | Per-request entitlement read | No caching of `player_loyalty` balance across requests. Each recognition RPC reads current state. TanStack Query invalidation on redemption. |
| T9 | Mandatory exclusion signal + integration test | Recognition RPC always includes `has_sister_exclusions` and `max_exclusion_severity` in return. Integration test: create exclusion at Casino A, call recognition from Casino B, verify signal is `true`. |
| T10 | ADR-018 SECURITY DEFINER governance | Both RPCs reviewed under ADR-018: minimal privilege, explicit return type, `set_rls_context_from_staff()` called first, no dynamic SQL, error messages do not leak internal state. |
| T11 | Policy allowlist CI gate | CI security gate asserts: only `player_casino` and `player_loyalty` SELECT policies may reference `app.company_id`. Any other table → CI failure. Extension of Phase 1 C5 control. |

### Control Details

**C1: Company-scoped policy fail-closed**
- **Type:** Preventive
- **Location:** RLS policy SQL
- **Enforcement:** Database
- **Tested by:** (1) Integration test: set `app.company_id` to empty string → Path 2 does not activate, only Path 1 (home casino) returns results. (2) Integration test: set `app.company_id` to UUID of different company → zero cross-company rows returned.

**C2: Tier 2 scalar extraction (visit)**
- **Type:** Preventive
- **Location:** SECURITY DEFINER RPC
- **Enforcement:** Database (return type contract) + CI (policy gate)
- **Tested by:** (1) CI gate: grep all RLS policies for `visit` table — none may reference `app.company_id`. (2) Code review: RPC returns only `timestamptz` scalar for visit data.

**C3: Scalar-only exclusion signal**
- **Type:** Preventive
- **Location:** SECURITY DEFINER RPC
- **Enforcement:** Database (RETURNS TABLE contract)
- **Tested by:** (1) RETURNS TABLE definition has exactly `has_sister_exclusions boolean` and `max_exclusion_severity text` — no other exclusion columns. (2) Integration test: create exclusion with reason/jurisdiction at Casino A → recognition RPC from Casino B returns true/severity only, never reason/jurisdiction.

**C4: Context-first RPC pattern**
- **Type:** Preventive
- **Location:** SECURITY DEFINER RPC
- **Enforcement:** Database + code review
- **Tested by:** (1) RPC source: `PERFORM set_rls_context_from_staff()` is first executable statement. (2) Integration test: cross-company call returns empty result set.

**C7: Serializable redemption**
- **Type:** Preventive
- **Location:** SECURITY DEFINER RPC (redemption)
- **Enforcement:** Database (row-level lock or atomic conditional update)
- **Tested by:** Concurrent redemption test: two simultaneous RPCs against same player — total debit must not exceed balance.

**C11: Policy allowlist CI gate**
- **Type:** Detective
- **Location:** CI pipeline
- **Enforcement:** Automated test
- **Tested by:** Script greps all `CREATE POLICY` and `ALTER POLICY` statements. Only `player_casino` and `player_loyalty` SELECT policies may contain `app.company_id`. Any other table → pipeline failure. Extends Phase 1 C5 (which asserted zero references; Phase 2 upgrades to allowlist).

---

## Deferred Risks (Explicitly Accepted for Phase 2)

| Risk | Reason for Deferral | Trigger to Address |
|---|---|---|
| Company-wide exclusion propagation | ADR-042 defers to future PRD. Phase 2 provides safety signal only. | Before exclusion data must be shared (not just signaled) across properties. |
| `player_loyalty.preferences` content audit | JSON contents unknown; excluded from cross-property projection for now. | Before `preferences` is included in any cross-property response. |
| Cross-property aggregated financial summaries | Not in Phase 2 scope. `player_financial_transaction` stays casino-scoped. | Before any financial cross-property visibility feature. |
| Redemption concurrency at scale (5+ casinos) | Low likelihood in initial rollout (most companies have 2-3 properties). | Before onboarding companies with 5+ properties that share loyalty. |
| `loyalty_ledger` provenance cross-property | Raw ledger explicitly deferred. If ever needed, must be sanitized projection. | Before any cross-property loyalty history feature. |

---

## Data Storage Justification

| Field | Storage Form | Justification |
|---|---|---|
| `player_casino` rows (cross-property read) | Existing schema, no new storage | Company-scoped SELECT policy exposes existing enrollment rows to sister-property staff. No new data created. |
| `player_loyalty` rows (cross-property read) | Existing schema, no new storage | Company-scoped SELECT policy exposes existing entitlement rows. RPC projection limits to `current_balance`, `tier`. |
| `last_company_visit` (RPC scalar) | Not stored — computed at query time | `MAX(visit.started_at)` across company. Ephemeral. |
| `has_sister_exclusions` / `max_exclusion_severity` (RPC scalar) | Not stored — computed at query time | Derived from `player_exclusion` aggregate. Ephemeral. |
| Audit events (`company_lookup`, `local_activation`, `loyalty_redemption`) | `audit_log` table (existing) | New event types in existing audit infrastructure. Actor, casino, player, timestamp. |

---

## RLS Summary

| Table | SELECT Change | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `player_casino` | **Company-scoped dual-mode** (Path 1: casino, Path 2: company) | Unchanged (casino-scoped, role-gated) | Unchanged | Denied |
| `player_loyalty` | **Company-scoped dual-mode** (entitlement projection) | Unchanged | Unchanged | Unchanged |
| `visit` | **NO CHANGE** (scalar extraction via RPC) | Unchanged | Unchanged | Unchanged |
| `player_exclusion` | **NO CHANGE** (scalar extraction via RPC) | Unchanged | Unchanged | Denied |
| `loyalty_ledger` | **NO CHANGE** | Unchanged (local writes only) | Unchanged | Unchanged |
| `player` | **NO CHANGE** (already global) | Unchanged | Unchanged | Unchanged |
| All other tables | **NO CHANGE** | Unchanged | Unchanged | Unchanged |

**Phase 2 modifies exactly 2 RLS SELECT policies.** All write policies remain casino-scoped. The policy allowlist CI gate (C11) enforces this boundary.

---

## New SECURITY DEFINER RPCs (ADR-018 Governance)

| RPC | Purpose | Privilege | ADR-018 Compliance |
|---|---|---|---|
| `rpc_lookup_player_company` | Recognition + entitlement summary | Read (cross-company via scalar extraction for visit + exclusion) | Context-first, explicit return type, no dynamic SQL, error messages sanitized |
| `rpc_activate_player_locally` | Local enrollment creation | Write (`player_casino` INSERT at caller's casino) | Role-gated (pit_boss/admin), audit logged, single-casino write scope |

Both RPCs call `set_rls_context_from_staff()` as first statement. Neither accepts a `casino_id` or `company_id` parameter (ADR-024 INV-8 intact).

---

## Merge Criteria (required before approval)

| # | Criterion | Verified by |
|---|---|---|
| M1 | All assets classified | This document (review) |
| M2 | All threats have controls or explicit deferral | This document (review) |
| M3 | Company-scoped SELECT policies exist only on `player_casino` and `player_loyalty` | CI policy allowlist gate (C11) |
| M4 | `visit` and `player_exclusion` have NO policy changes | CI gate + migration diff |
| M5 | Recognition RPC returns only declared columns (no raw visit/exclusion rows) | RETURNS TABLE definition review + integration test |
| M6 | Activation RPC is role-gated (pit_boss/admin) | Integration test: floor_supervisor role → rejected |
| M7 | Cross-company isolation holds | Integration test: Company X staff sees zero Company Y data |
| M8 | Exclusion safety signal is present and correct | Integration test: exclusion at Casino A → signal true from Casino B |
| M9 | Both RPCs call `set_rls_context_from_staff()` first | Code review + integration test |
| M10 | No `app.company_id` references in policies for non-allowlisted tables | CI gate |
| M11 | Shadow policies tested before production rollout | Pre-deploy checklist |
| M12 | Redemption cannot exceed balance | Integration test: concurrent redemption does not produce negative balance |
| M13 | Audit events logged for lookup, activation, redemption | Integration test: verify audit_log entries after each operation |
