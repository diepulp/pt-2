# SEC-FULL-AUDIT-2026-03-01: Consolidated Security Findings

**Date:** 2026-03-01
**Scope:** Full-system RLS/RPC/GRANT security audit
**Method:** 8 parallel RLS expert agents, each targeting a distinct vulnerability surface
**Upstream:** ISSUE-P_ACTOR_ID-BYPASS-RESIDUAL-AUDIT-2026-03-01
**ADR References:** ADR-015, ADR-018, ADR-020, ADR-024, ADR-030

---

## Executive Summary

A full-system audit triggered by the residual `p_actor_id` bypass findings (C-3, M-5) revealed **significantly broader security gaps** than the original issue documented. The 8-agent sweep covers SQL migrations, TypeScript callers, RLS policies, GRANT permissions, SECURITY DEFINER governance, context derivation patterns, function overloads, and PostgREST exposure.

**Totals:**
- **7 P0 CRITICAL findings** (3 RLS policy, 2 RPC context, 1 phantom overload, 1 active regression)
- **8 P1 HIGH findings** (RLS gaps, TOCTOU, PostgREST exposure, spoofable params)
- **5 P2 MEDIUM findings** (compliance gaps, perf, consistency)
- **~85% of system fully compliant** (46/54 tables, 75/77 RPCs)

**Consensus read:** Architecture direction is sound; **governance + CI enforcement is not yet strong enough** to prevent regressions — especially via deprecated primitives and overload ambiguity. The remaining non-compliant slice contains **tenant-boundary breakers** (cross-casino PII exposure, log poisoning, actor spoofing). This is the "one bad policy ruins the whole system" category.

---

## Primary Risk Statement

### Catastrophic class (must-fix)
These are not style issues — they're **cross-tenant / integrity compromises**:

- **Cross-casino staff exposure** (e.g., permissive `staff` SELECT policy patterns like `USING (true)`) → P0-1
- **Audit log poisoning** (e.g., permissive `audit_log` INSERT `WITH CHECK (true)`) → P0-2
- **Operational controls mutation** (e.g., overly broad `casino_settings` policies / missing role gates) → P0-3
- **RPC spoof surfaces** from phantom overloads and identity parameters (e.g., `p_actor_id`) surviving in signatures → P0-4, P0-7

### Systemic failure modes
- **Deprecated context primitives** still exist → they get copy-pasted → regressions repeat (proven by P0-5).
- **PostgREST named args + DEFAULT params** → overload candidate sets overlap → ambiguity/bypass risk unless old signatures are dropped.
- **Pooling TOCTOU** → `current_setting('app.casino_id')` used without reliably setting context at start of RPC.

---

## P0 CRITICAL Findings (7)

### P0-1: `staff` table — SELECT policy `USING (true)` [RLS]
| Field | Value |
|-------|-------|
| **Source** | `20251220164609_rls_performance_optimization.sql:851-852` |
| **Agent** | rls-expert-6 (F1) |
| **Issue** | `CREATE POLICY staff_read ON staff FOR SELECT USING (true)` — no auth, no casino scope |
| **Impact** | ANY user (including anonymous via anon key) can read ALL staff records across ALL casinos. Exposes names, emails, roles, casino assignments. |
| **Root cause** | Performance optimization migration over-simplified the policy to resolve multiple_permissive_policies warnings |
| **SEC-001 expectation** | "Authenticated staff in same casino_id (role-gated)" |
| **Remediation** | Replace with Pattern C: `auth.uid() IS NOT NULL AND casino_id = COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt()->'app_metadata'->>'casino_id')::uuid)` |

### P0-2: `audit_log` — INSERT policy `WITH CHECK (true)` [RLS]
| Field | Value |
|-------|-------|
| **Source** | `20251220164609_rls_performance_optimization.sql:1117-1118` |
| **Agent** | rls-expert-6 (F2) |
| **Issue** | `CREATE POLICY audit_log_insert ON audit_log FOR INSERT WITH CHECK (true)` — no auth, no casino scope |
| **Impact** | ANY user (including anonymous) can insert arbitrary audit log entries. Log poisoning attack vector — fake entries to cover tracks or frame staff. |
| **Remediation** | Replace with Pattern C + role gate, or restrict to RPC-only writes via REVOKE direct INSERT |

### P0-3: `casino_settings` — `FOR ALL` with no write role gate [RLS]
| Field | Value |
|-------|-------|
| **Source** | `20251220164609_rls_performance_optimization.sql:318-325` |
| **Agent** | rls-expert-6 (F3) |
| **Issue** | Policy uses `FOR ALL` with Pattern C for casino scope but NO role gate for writes |
| **Impact** | Any authenticated staff (cashier, dealer) can INSERT/UPDATE/DELETE casino settings for their casino. SEC-001 says "Admin only" for writes. |
| **Remediation** | Split into separate SELECT (all staff) and write (admin/pit_boss only) policies |

### P0-4: `rpc_update_table_status` — Phantom 4-param overload [OVERLOAD/BYPASS]
| Field | Value |
|-------|-------|
| **Source** | `20251221173716_prd015_ws3_table_mgmt_rpcs_self_injection.sql` |
| **Agents** | rls-expert-1 (C-3), rls-expert-3 (F-1), rls-expert-4 (C-3) |
| **Issue** | 4-param overload accepts `p_actor_id`, calls deprecated `set_rls_context(p_actor_id, ...)`. Cleanup migration `20251231093000` dropped 11/12 legacy overloads but **omitted this one**. |
| **Impact** | Any authenticated user can impersonate any staff via PostgREST. Context spoofing + audit trail corruption. |
| **Remediation** | `DROP FUNCTION IF EXISTS public.rpc_update_table_status(uuid, uuid, table_status, uuid);` |

### P0-5: `rpc_get_dashboard_tables_with_counts` — Active regression [CONTEXT]
| Field | Value |
|-------|-------|
| **Source** | `20260301015320_enrich_dashboard_rpc_session_status.sql` |
| **Agents** | rls-expert-2 (P0), rls-expert-7 (P0) |
| **Issue** | Today's migration reverted from `set_rls_context_from_staff()` to deprecated `set_rls_context(v_context_actor_id, p_casino_id, v_context_staff_role)`. Since `authenticated` was REVOKED from `set_rls_context()` in Dec 2025, this RPC is **broken at runtime**. |
| **Impact** | Security regression + functional regression. Dashboard tables endpoint fails for all users. |
| **Remediation** | Replace with `PERFORM set_rls_context_from_staff();` and derive context vars from session settings after the call |

### P0-6: `rpc_get_rating_slip_duration` — No auth, no context [CONTEXT]
| Field | Value |
|-------|-------|
| **Source** | `20251128221408_rating_slip_pause_tracking.sql:379-421` |
| **Agent** | rls-expert-7 (P0) |
| **Issue** | NO auth check, NO context injection, NO SECURITY setting. Pre-ADR-024, never remediated. Callable via PostgREST directly. |
| **Impact** | Any authenticated user can query any rating slip duration by ID — no casino scoping. |
| **Mitigating** | Called internally by compliant `rpc_get_visit_live_view`, but directly exposed via PostgREST |
| **Remediation** | Add `set_rls_context_from_staff()` + auth check + casino_id filter, or REVOKE from authenticated if truly internal-only |

### P0-7: `rpc_start_rating_slip` — Dead `p_actor_id` param (INV-8) [PARAM]
| Field | Value |
|-------|-------|
| **Source** | `20260219235800_adr018_revoke_public_security_remediation.sql:247` |
| **Agents** | rls-expert-1 (M-5), rls-expert-4 (M-5), rls-expert-5 |
| **Issue** | `p_actor_id UUID DEFAULT NULL` in signature, completely ignored in body. Violates ADR-024 INV-8. PostgREST advertises it. 2 production callers still pass it. |
| **Remediation** | DROP 6-param, CREATE 5-param without `p_actor_id`. Update `services/visit/crud.ts:695` and `services/rating-slip/crud.ts:182`. Regenerate types. |

---

## P1 HIGH Findings (8)

### P1-1: `audit_log` SELECT — No casino_id scoping [RLS]
- **Agent:** rls-expert-6 (F4)
- **Issue:** Policy checks `auth.uid()` + role gate (admin, pit_boss) but NO casino_id filter
- **Impact:** Any admin/pit_boss can see audit logs from ALL casinos — cross-tenant leakage

### P1-2: `report` table — No casino_id scoping [RLS]
- **Agent:** rls-expert-6 (F5)
- **Issue:** SELECT and INSERT policies check auth + role but no casino_id filter in staff lookup
- **Impact:** Any admin from casino A can see/create reports for casino B

### P1-3: `table_inventory_snapshot` INSERT — No casino_id [RLS]
- **Agent:** rls-expert-6 (F6)
- **Issue:** `WITH CHECK ((select auth.uid()) IS NOT NULL)` — only checks auth, no casino scope, no role gate
- **Impact:** Any authenticated user from any casino can insert inventory snapshots for any table

### P1-4: `promo_program` + `promo_coupon` UPDATE — Missing WITH CHECK [RLS]
- **Agent:** rls-expert-6 (F7)
- **Issue:** UPDATE policies have USING clause but no WITH CHECK — new values unconstrained
- **Impact:** User could UPDATE `casino_id` to steal/move records across tenants

### P1-5: `rpc_promo_exposure_rollup` — TOCTOU vulnerability [CONTEXT]
- **Agent:** rls-expert-7 (P1)
- **Issue:** Reads `current_setting('app.casino_id')` without calling `set_rls_context_from_staff()` first
- **Impact:** In pooled connections, could read stale context from previous request — cross-casino data leakage per ADR-030

### P1-6: `rpc_issue_mid_session_reward` — Accepts `p_staff_id` [PARAM]
- **Agent:** rls-expert-5 (Finding 3)
- **Issue:** `services/loyalty/mid-session-reward.ts:70` passes `p_staff_id` from caller input
- **Impact:** Spoofable staff identity in reward issuance — needs SQL body audit

### P1-7: `rpc_create_financial_txn` + `rpc_create_financial_adjustment` — Missing REVOKE FROM PUBLIC [GRANT]
- **Agent:** rls-expert-8 (F-10, F-11)
- **Issue:** WRITE RPCs never had `REVOKE ALL FROM PUBLIC` — anon inherits EXECUTE via PostgreSQL default
- **Impact:** While SECURITY INVOKER + RLS blocks actual writes, error messages could leak schema info. Defense-in-depth failure.

### P1-8: 8 Read RPCs missing REVOKE FROM PUBLIC [GRANT]
- **Agent:** rls-expert-8 (F-2 through F-9)
- **Functions:** `rpc_get_dashboard_stats`, `rpc_get_rating_slip_modal_data`, `rpc_get_dashboard_tables_with_counts`, `rpc_list_active_players_casino_wide`, `rpc_list_closed_slips_for_gaming_day`, `rpc_shift_active_visitors_summary`, `rpc_promo_exposure_rollup`, `rpc_promo_coupon_inventory`
- **Impact:** anon role inherits EXECUTE. SECURITY INVOKER + RLS mitigates, but violates least-privilege principle.

---

## P2 MEDIUM Findings (5)

### P2-1: 12 RPCs accept `p_casino_id` with validate pattern instead of derive [PARAM]
- **Agent:** rls-expert-4 (M-6)
- **Functions:** `rpc_activate_floor_layout`, `rpc_close_rating_slip`, `rpc_create_floor_layout`, `rpc_create_player`, `rpc_log_table_drop`, `rpc_log_table_inventory_snapshot`, `rpc_move_player`, `rpc_pause_rating_slip`, `rpc_request_table_credit`, `rpc_request_table_fill`, `rpc_resume_rating_slip`, `rpc_update_table_status` (3-param)
- **Status:** Not exploitable (mismatch raises exception), but not ADR-024 target state

### P2-2: `rpc_create_financial_txn` — `p_created_by_staff_id` attribution param [PARAM]
- **Agent:** rls-expert-5 (Finding 4)
- **Issue:** Passes staff identity for audit attribution. May be legitimate for delegated recording.
- **Action:** Needs business analysis — should this be context-derived or is delegation a valid use case?

### P2-3: `chipset_total_cents` — Granted to anon [GRANT]
- **Agent:** rls-expert-8 (F-1)
- **Issue:** Pure computation helper explicitly granted to anon. No data access but violates least privilege.

### P2-4: 8 denial policies missing `auth.uid() IS NOT NULL` prefix [RLS]
- **Agent:** rls-expert-6 (F8)
- **Issue:** Policies use `USING (false)` instead of SEC-006 convention `USING (auth.uid() IS NOT NULL AND false)`
- **Impact:** Functionally equivalent but breaks consistency convention

### P2-5: `player_tag` UPDATE — Missing WITH CHECK [RLS]
- **Agent:** rls-expert-6 (F9)
- **Issue:** Same pattern as P1-4 but lower-impact table

---

## Deprecated Function Status

| Function | Status | Recommendation |
|----------|--------|----------------|
| `set_rls_context(uuid, uuid, text, text)` | EXISTS but REVOKED from authenticated/anon/PUBLIC | **DROP entirely** — 3+ months past rollback window. Its existence enables copy-paste regressions (proven by P0-5 today). |
| `set_rls_context_from_staff(text)` | ACTIVE, SECURE | Current standard per ADR-024 |
| `set_rls_context_internal(uuid, uuid, text, text)` | ACTIVE, service_role only | Ops lane per ADR-024 |

---

## Root Cause Analysis

### Why the perf optimization migration (`20251220164609`) is the single biggest source

3 of 7 P0 findings (P0-1, P0-2, P0-3) trace to the same performance optimization migration that **over-simplified RLS policies** to resolve `multiple_permissive_policies` warnings. The migration was reviewed for performance but not for security regression.

### Why `CREATE OR REPLACE` creates phantom overloads

PostgreSQL treats functions with different parameter counts as distinct functions. `CREATE OR REPLACE` only replaces a function with the **exact same signature**. When ADR-024 remediation removed `p_actor_id` params, the old overloads persisted. The cleanup migration caught 11/12 but missed `rpc_update_table_status`.

### Why the deprecated `set_rls_context()` keeps being copied

The function still exists in the database. New migrations authored by copying older patterns find the deprecated version and use it. Today's dashboard regression (P0-5) is direct evidence. Dropping the function entirely would cause copy-paste attempts to fail immediately at migration time.

---

## Remediation Priority Matrix

### Sprint 1 — Immediate (P0)
| # | Action | Effort | Risk |
|---|--------|--------|------|
| 1 | Fix `rpc_get_dashboard_tables_with_counts` regression (P0-5) | LOW — replace 10 lines | Blocks current branch |
| 2 | DROP `rpc_update_table_status` 4-param overload (P0-4) | LOW — 1 DROP statement | Active exploit |
| 3 | RLS remediation: `staff_read`, `audit_log_insert`, `casino_settings` (P0-1,2,3) | MEDIUM — 3 policy rewrites | PII exposure + log injection |
| 4 | DROP+CREATE `rpc_start_rating_slip` without `p_actor_id` (P0-7) | MEDIUM — DROP/CREATE + 2 TS changes | INV-8 compliance |
| 5 | Fix `rpc_get_rating_slip_duration` (P0-6) | LOW — add context + auth | PostgREST exposure |
| 6 | DROP deprecated `set_rls_context()` function | LOW — 1 DROP statement | Prevents future regressions |

### Sprint 2 — High Priority (P1)
| # | Action | Effort | Risk |
|---|--------|--------|------|
| 7 | Add casino_id scoping to `audit_log` SELECT, `report` policies (P1-1,2) | MEDIUM | Cross-tenant leakage |
| 8 | Add casino_id check to `table_inventory_snapshot` INSERT (P1-3) | LOW | Cross-tenant insert |
| 9 | Add WITH CHECK to `promo_program`, `promo_coupon` UPDATE policies (P1-4) | LOW | Tenant mutation |
| 10 | Fix `rpc_promo_exposure_rollup` TOCTOU (P1-5) | LOW | Stale context |
| 11 | Audit `rpc_issue_mid_session_reward` `p_staff_id` usage (P1-6) | LOW | Investigate SQL body |
| 12 | REVOKE FROM PUBLIC batch for 10+ functions (P1-7,8) | LOW — ~50 lines SQL | Defense-in-depth |

### Sprint 3 — Backlog (P2)
| # | Action | Effort |
|---|--------|--------|
| 13 | Progressively remove `p_casino_id` from 12 validate-pattern RPCs (P2-1) | HIGH — coordinated TS changes |
| 14 | Business analysis: `p_created_by_staff_id` delegation (P2-2) | MEDIUM |
| 15 | REVOKE anon from `chipset_total_cents` (P2-3) | LOW |
| 16 | Normalize denial policy patterns (P2-4) | LOW |
| 17 | Add WITH CHECK to `player_tag` UPDATE (P2-5) | LOW |

### CI Prevention Gates (Ongoing)
| Gate | Purpose |
|------|---------|
| Catalog assertion: 0 `rpc_*` with `p_actor_id` in identity args | Prevent param regression |
| Overload audit: no `rpc_*` with multiple overloads (except intentional) | Catch phantom overloads |
| Grep new migrations for `set_rls_context(` without `_from_staff`/`_internal` | Prevent deprecated usage |
| `REVOKE ALL FROM PUBLIC` required in all new function migrations | Enforce least-privilege |
| Fail if any tenant table has `USING (true)` / `WITH CHECK (true)` unless allowlisted & documented | Prevent permissive policy regression |
| Optional: snapshot & diff `pg_proc` + `pg_policies` as part of migration verification | Detect policy/function drift |

---

## Improvement Plan (Consensus Deliverables)

### 1) Close the "catastrophic three" in RLS (first)
**Goal:** Tenant isolation + integrity restored.

- Replace any `USING (true)` on tenant-scoped tables with casino-scoped predicates.
- Replace any `WITH CHECK (true)` on write paths with: casino scope + role gate + row ownership checks as needed.
- Split policies by operation (SELECT vs INSERT vs UPDATE vs DELETE) rather than `FOR ALL` if role gates differ.

**Deliverable:** One migration that fixes `staff` read scoping, `audit_log` insert scoping, and `casino_settings` write scoping (pitboss vs admin vs service paths).

### 2) Delete deprecated `set_rls_context()` for real (DROP, don't "revoke")
**Goal:** Make future regressions impossible.

- If deprecated function exists, people will use it.
- **DROP** deprecated context setters so mistakes fail at migration-time instead of prod-time.

**Deliverable:** Migration that `DROP FUNCTION ...` (all overloads) and updates callers to canonical context setter.

### 3) Make "no phantom overloads" a hard gate
**Goal:** End PostgREST ambiguity and spoof surfaces.

- For `rpc_*` functions:
  - Avoid overloads unless explicitly allowlisted.
  - Avoid DEFAULT params that create overlapping call signatures.
  - **DROP old signatures** during upgrades; don't keep "compat" overloads.

**Deliverable:** Migration that removes residual overloads and a CI rule that fails if multiple overloads exist for `rpc_*` (except allowlist) or any `rpc_*` contains identity args like `p_actor_id` unless explicitly justified + audited.

### 4) Enforce "context set first line" (pooling reality / TOCTOU)
**Goal:** Eliminate stale session-variable reads on pooled connections.

Rule: every security-relevant RPC must do:
1. Set context (canonical helper)
2. Assert required settings exist (fail closed)
3. Then proceed

**Deliverable:** Patch set to move context set to the top of each flagged RPC.

### 5) Standardize GRANT/REVOKE boilerplate (defense-in-depth)
Even if RLS protects tables, leaving EXECUTE on PUBLIC is a footgun and violates least privilege.

**Template:**
- `REVOKE ALL ON FUNCTION ... FROM PUBLIC;`
- `GRANT EXECUTE ON FUNCTION ... TO authenticated;`
- `GRANT EXECUTE ON FUNCTION ... TO service_role;` (only if needed)

**Deliverable:** Batch migration applying the template to all `rpc_*`.

---

## Gaps / Blind Spots

### A) "Performance migrations" need a security review protocol
A single "performance optimization" migration caused broad RLS regressions (P0-1, P0-2, P0-3). That's a process bug.

**Add:** Required checklist for any migration touching RLS/policies:
- No permissive `true` policies on tenant tables
- Casino scoping present
- Writes gated by role
- PostgREST surface reviewed (RPC grants + signature sanity)

### B) Inconsistent role gating (read vs write)
Define canonical policy patterns by table class:

- **Tenant core tables** (player/staff/visit/etc.): strict casino scope on all reads.
- **Operational logs** (audit_log): strict casino scope, inserts constrained, no arbitrary actor attribution.
- **Settings tables** (casino_settings): role-gated updates; read scope as needed.

### C) Identity attribution rules aren't fully enforced
Adopt explicit invariants:

- **actor_id** derived from session/JWT only (never passed).
- **casino_id** derived from session/JWT only (never passed).
- Any delegated actions (e.g., finance ops) must be **explicitly modeled and audited**, not "free-form staff_id in params."

### D) PostgREST surface inventory is missing
Add a gate that enumerates:
- Exposed `rpc_*`
- Required grant state
- Signature invariants (no spoof params, no ambiguous overloads)

---

## Audit Coverage Summary

| Domain | Agent | Tables/Functions Scanned | Compliance |
|--------|-------|-------------------------|------------|
| `p_actor_id` parameter scan | rls-expert-1 | 33 migrations, 5 catalog functions | 3/5 clean (2 findings) |
| Context derivation patterns | rls-expert-2 | All 80+ migrations | 75/77 RPCs compliant (97%) |
| Phantom function overloads | rls-expert-3 | All `CREATE OR REPLACE` chains | 1 active phantom (11 historical resolved) |
| SECURITY DEFINER governance | rls-expert-4 | All SECDEF functions | ~45+ compliant (3 findings) |
| TypeScript caller surface | rls-expert-5 | All services/, lib/, tests/ | 7 prod findings, 5 test categories |
| RLS policy compliance | rls-expert-6 | 54 tables, all policies | 46/54 compliant (85%) |
| Auth/context gap analysis | rls-expert-7 | ~80 RPCs traced to latest version | 75/77 compliant (97%) |
| PostgREST exposure audit | rls-expert-8 | All GRANT/REVOKE in 80+ migrations | 12 exposure findings |

---

## Cross-References

| Document | Relevance |
|----------|-----------|
| `docs/issues/auth-hardening/ISSUE-P_ACTOR_ID-BYPASS-RESIDUAL-AUDIT-2026-03-01.md` | Original trigger issue (C-3, M-5) — confirmed |
| `docs/30-security/compliance/SEC-AUDIT-2026-02-19-RLS-VIOLATIONS-MATRIX.md` | Previous audit (C-1, C-2) |
| `docs/30-security/SEC-001-rls-policy-matrix.md` | Policy expectations baseline |
| `docs/80-adrs/ADR-024_DECISIONS.md` | Authoritative context (INV-7, INV-8) |
| `docs/80-adrs/ADR-030-auth-system-hardening.md` | TOCTOU prevention, write-path enforcement |
| `docs/80-adrs/ADR-018-security-definer-governance.md` | SECURITY DEFINER rules |
| `docs/30-security/SEC-AUDIT-CONSENSUS-IMPROVEMENTS-2026-03-01.md` | Consensus improvement plan (source of Gaps + Deliverables sections) |

---

## Definition of Done (regression prevention)

**CI gates (must be real):**
- Fail if any tenant table has `USING (true)` / `WITH CHECK (true)` unless allowlisted & documented.
- Fail if any `rpc_*` has multiple overloads (except allowlist).
- Fail if any `rpc_*` includes `p_actor_id` or accepts `p_casino_id` (except allowlist).
- Fail if any `rpc_*` is executable by PUBLIC.
- Optional: snapshot & diff `pg_proc` + `pg_policies` as part of migration verification.

---

## Quick Checklist (copy/paste into PR)

- [ ] RLS: no permissive `true` policies on tenant-scoped tables
- [ ] RLS: writes have role gates + casino scope
- [ ] RPC: context set first line
- [ ] RPC: no identity params (actor/casino) passed
- [ ] RPC: no ambiguous overloads / default overlap
- [ ] GRANTS: PUBLIC revoked on all `rpc_*`
- [ ] PostgREST surface reviewed (exposed RPC list matches intent)
