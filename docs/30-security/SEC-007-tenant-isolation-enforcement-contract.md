# SEC-FULL-AUDIT-2026-03-01: Consolidated Security Findings

**Date:** 2026-03-01
**Scope:** Full-system RLS/RPC/GRANT security audit
**Method:** 8 parallel RLS expert agents, each targeting a distinct vulnerability surface
**Upstream:** ISSUE-P_ACTOR_ID-BYPASS-RESIDUAL-AUDIT-2026-03-01
**ADR References:** ADR-015, ADR-018, ADR-020, ADR-024, ADR-030
**Re-Audit (pass 1):** 2026-03-02 — threat model, acceptance tests, remediation defaults, PostgREST safety notes
**Re-Audit (pass 2):** 2026-03-02 — test harness setup, audit log write lane, P1 acceptance tests, CI implementation notes
**Re-Audit (pass 3):** 2026-03-02 — environment verification, TOCTOU harness, context-first-line mechanical rule, allowlist governance, DEFAULT-arg CI check, Pattern C definition

---

## Threat Model & Assumptions

The following environment assumptions underpin severity ratings throughout this audit. If any assumption does **not** hold in a given deployment, adjust severity accordingly.

1. **PostgREST endpoint is publicly reachable** (standard Supabase hosted model). Authenticated and anonymous clients can call any exposed `rpc_*`.
2. **Client includes the anon key** in requests. Anonymous-role access is available unless explicitly revoked.
3. **RLS is enabled on all referenced tables** and is not bypassed by table owners (Supabase default: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; ALTER TABLE ... FORCE ROW LEVEL SECURITY;`).
4. **Session context variables may be stale under connection pooling** unless explicitly set at the start of each RPC (Supavisor / PgBouncer transaction-mode behavior).
5. **SECURITY DEFINER functions execute as the function owner** (typically `postgres`), bypassing RLS unless the function explicitly sets and respects context. Any PUBLIC EXECUTE grant on a DEFINER function creates a confused-deputy vector.

**Environment Verification (one-time per deployment tier):**
Before relying on severity ratings, confirm these hold for your target environment:
- [ ] PostgREST / Supabase REST endpoint is internet-reachable (or document if behind VPN/private network)
- [ ] Anon key is present in client-side code (check `.env` / bundle / network tab)
- [ ] RLS is enabled AND forced on all tenant-scoped tables: `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);` → 0 rows for tenant tables (`relrowsecurity` = ENABLE RLS, `relforcerowsecurity` = FORCE RLS)
- [ ] Connection pooler is in transaction mode (Supavisor default) — confirms session variables do not persist across requests

If any check fails, annotate the affected findings with adjusted severity.

---

## Test Harness Setup

All acceptance tests in this audit reference role/context combinations. Use the following canonical setup to make tests deterministic and reproducible.

**Running as `anon`:**
```sql
SET ROLE anon;
-- No JWT, no context. Simulates unauthenticated PostgREST request with anon key.
```

**Running as `authenticated` (casino A context):**
```sql
SET ROLE authenticated;
-- Option A: Call the canonical context setter (requires a valid JWT with staff_id claim)
SELECT set_config('request.jwt.claims', '{"sub":"<auth_uid>","app_metadata":{"staff_id":"<staff_uuid>","casino_id":"<casino_a_uuid>","staff_role":"pit_boss"}}', true);
PERFORM set_rls_context_from_staff();

-- Option B: Direct session variable injection (for unit-level psql testing only — bypasses JWT validation)
SELECT set_config('app.actor_id', '<staff_uuid>', true);
SELECT set_config('app.casino_id', '<casino_a_uuid>', true);
SELECT set_config('app.staff_role', 'pit_boss', true);
```

**Running as `authenticated` (casino B context):** Same as above with casino B UUIDs. Used for cross-tenant isolation assertions.

**Running as `service_role`:**
```sql
SET ROLE service_role;
-- Bypasses RLS. Used only for setup/teardown and validating DEFINER behavior.
```

**CI harness (recommended):** `supabase db reset` in GitHub Actions → run SQL assertion files querying `pg_policies`/`pg_proc` → fail on unexpected state. See **CI Implementation Notes** section below.

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

> **Pattern C (hybrid casino-scoping):** The canonical RLS predicate for tenant isolation in PT-2, per ADR-015/ADR-020. It reads casino context from session variables (set by RPCs) with a fallback to JWT `app_metadata` (for direct table access): `auth.uid() IS NOT NULL AND casino_id = COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt()->'app_metadata'->>'casino_id')::uuid)`. All tenant-scoped tables must use this pattern (or a stricter variant with additional role gates). See `SEC-001-rls-policy-matrix.md` for the full policy expectations by table.

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

**Acceptance Tests (P0-1):**
- `SET ROLE anon; SELECT * FROM staff;` → 0 rows
- `SET ROLE authenticated;` (casino A context) `SELECT * FROM staff WHERE casino_id = '<casino_B>';` → 0 rows
- `SET ROLE authenticated;` (casino A context) `SELECT * FROM staff WHERE casino_id = '<casino_A>';` → returns own-casino rows only

### P0-2: `audit_log` — INSERT policy `WITH CHECK (true)` [RLS]
| Field | Value |
|-------|-------|
| **Source** | `20251220164609_rls_performance_optimization.sql:1117-1118` |
| **Agent** | rls-expert-6 (F2) |
| **Issue** | `CREATE POLICY audit_log_insert ON audit_log FOR INSERT WITH CHECK (true)` — no auth, no casino scope |
| **Impact** | ANY user (including anonymous) can insert arbitrary audit log entries. Log poisoning attack vector — fake entries to cover tracks or frame staff. |
| **Remediation** | **Recommended:** RPC-only writes — `REVOKE INSERT ON audit_log FROM authenticated;` and constrain inserts to SECURITY DEFINER RPCs that set context authoritatively. **Alternative (acceptable):** Pattern C + role gate if direct INSERT is a legitimate requirement. |

**Acceptance Tests (P0-2):**
- `SET ROLE anon; INSERT INTO audit_log (...) VALUES (...);` → denied
- `SET ROLE authenticated;` direct `INSERT INTO audit_log` with forged `casino_id`/`actor_id` → denied
- If RPC-only: direct INSERT fails; RPC insert with valid context succeeds

**Audit Log Write Lane Contract (P0-2):**
- **Entrypoint(s):** SECURITY DEFINER RPC(s) that call `set_rls_context_from_staff()` internally (e.g., existing audit-emitting RPCs; or a dedicated `rpc_write_audit_log` if consolidated).
- **Server-derived columns (never caller-supplied):** `actor_id` (from `app.actor_id`), `casino_id` (from `app.casino_id`), `created_at` (from `now()`).
- **Caller-supplied columns (validated):** `action`, `entity_type`, `entity_id`, `details` (JSON payload).
- **Anti-forgery invariant:** Direct `INSERT` on `audit_log` is denied for `authenticated` and `anon` roles. Only DEFINER RPCs with self-injected context can write. No caller parameter can override `actor_id` or `casino_id`.

### P0-3: `casino_settings` — `FOR ALL` with no write role gate [RLS]
| Field | Value |
|-------|-------|
| **Source** | `20251220164609_rls_performance_optimization.sql:318-325` |
| **Agent** | rls-expert-6 (F3) |
| **Issue** | Policy uses `FOR ALL` with Pattern C for casino scope but NO role gate for writes |
| **Impact** | Any authenticated staff (cashier, dealer) can INSERT/UPDATE/DELETE casino settings for their casino. SEC-001 says "Admin only" for writes. |
| **Remediation** | Split into separate SELECT (all staff) and write (admin/pit_boss only) policies |

**Acceptance Tests (P0-3):**
- `SET ROLE authenticated;` (dealer role, casino A) `UPDATE casino_settings SET ... WHERE casino_id = '<casino_A>';` → denied
- `SET ROLE authenticated;` (admin role, casino A) `UPDATE casino_settings SET ... WHERE casino_id = '<casino_A>';` → succeeds
- `SET ROLE authenticated;` (admin role, casino A) `SELECT * FROM casino_settings WHERE casino_id = '<casino_A>';` → returns rows

### P0-4: `rpc_update_table_status` — Phantom 4-param overload [OVERLOAD/BYPASS]
| Field | Value |
|-------|-------|
| **Source** | `20251221173716_prd015_ws3_table_mgmt_rpcs_self_injection.sql` |
| **Agents** | rls-expert-1 (C-3), rls-expert-3 (F-1), rls-expert-4 (C-3) |
| **Issue** | 4-param overload accepts `p_actor_id`, calls deprecated `set_rls_context(p_actor_id, ...)`. Cleanup migration `20251231093000` dropped 11/12 legacy overloads but **omitted this one**. |
| **Impact** | Any authenticated user can impersonate any staff via PostgREST. Context spoofing + audit trail corruption. |
| **Remediation** | `DROP FUNCTION IF EXISTS public.rpc_update_table_status(uuid, uuid, table_status, uuid);` |

**Acceptance Tests (P0-4):**
- `SELECT proname, pronargs FROM pg_proc WHERE proname = 'rpc_update_table_status';` → returns only the safe 3-param signature
- PostgREST `POST /rpc/rpc_update_table_status` with `p_actor_id` in body → rejected (unknown parameter), no ambiguity candidates

### P0-5: `rpc_get_dashboard_tables_with_counts` — Active regression [CONTEXT]
| Field | Value |
|-------|-------|
| **Source** | `20260301015320_enrich_dashboard_rpc_session_status.sql` |
| **Agents** | rls-expert-2 (P0), rls-expert-7 (P0) |
| **Issue** | Today's migration reverted from `set_rls_context_from_staff()` to deprecated `set_rls_context(v_context_actor_id, p_casino_id, v_context_staff_role)`. Since `authenticated` was REVOKED from `set_rls_context()` in Dec 2025, this RPC is **broken at runtime**. |
| **Impact** | Security regression + functional regression. Dashboard tables endpoint fails for all users. |
| **Remediation** | Replace with `PERFORM set_rls_context_from_staff();` and derive context vars from session settings after the call |

**Acceptance Tests (P0-5):**
- `SELECT * FROM rpc_get_dashboard_tables_with_counts('<casino_id>');` → succeeds (no permission error)
- Function body grep: no reference to deprecated `set_rls_context(` (only `set_rls_context_from_staff()`)
- Context vars (`app.casino_id`, `app.actor_id`, `app.staff_role`) set correctly after call

### P0-6: `rpc_get_rating_slip_duration` — No auth, no context [CONTEXT]
| Field | Value |
|-------|-------|
| **Source** | `20251128221408_rating_slip_pause_tracking.sql:379-421` |
| **Agent** | rls-expert-7 (P0) |
| **Issue** | NO auth check, NO context injection, NO SECURITY setting. Pre-ADR-024, never remediated. Callable via PostgREST directly. |
| **Impact** | Any authenticated user can query any rating slip duration by ID — no casino scoping. |
| **Mitigating** | Called internally by compliant `rpc_get_visit_live_view`, but directly exposed via PostgREST |
| **Remediation** | Add `set_rls_context_from_staff()` + auth check + casino_id filter, or REVOKE from authenticated if truly internal-only |

**Acceptance Tests (P0-6):**
- `SET ROLE anon; SELECT * FROM rpc_get_rating_slip_duration('<slip_id>');` → denied
- `SET ROLE authenticated;` (casino A) calling with a slip from casino B → 0 rows or denied
- If REVOKE path chosen: `SELECT has_function_privilege('authenticated', 'rpc_get_rating_slip_duration(uuid)', 'EXECUTE');` → false

### P0-7: `rpc_start_rating_slip` — Dead `p_actor_id` param (INV-8) [PARAM]
| Field | Value |
|-------|-------|
| **Source** | `20260219235800_adr018_revoke_public_security_remediation.sql:247` |
| **Agents** | rls-expert-1 (M-5), rls-expert-4 (M-5), rls-expert-5 |
| **Issue** | `p_actor_id UUID DEFAULT NULL` in signature, completely ignored in body. Violates ADR-024 INV-8. PostgREST advertises it. 2 production callers still pass it. |
| **Remediation** | DROP 6-param, CREATE 5-param without `p_actor_id`. Update `services/visit/crud.ts:695` and `services/rating-slip/crud.ts:182`. Regenerate types. |

**Acceptance Tests (P0-7):**
- `SELECT proname, pronargs FROM pg_proc WHERE proname = 'rpc_start_rating_slip';` → returns only 5-param signature (no `p_actor_id`)
- PostgREST `POST /rpc/rpc_start_rating_slip` with `p_actor_id` in body → rejected (unknown parameter)
- `grep -r 'p_actor_id' services/visit/crud.ts services/rating-slip/crud.ts` → 0 matches

---

## P1 HIGH Findings (8)

### P1-1: `audit_log` SELECT — No casino_id scoping [RLS]
- **Agent:** rls-expert-6 (F4)
- **Issue:** Policy checks `auth.uid()` + role gate (admin, pit_boss) but NO casino_id filter
- **Impact:** Any admin/pit_boss can see audit logs from ALL casinos — cross-tenant leakage
- **Acceptance Test:** `SET ROLE authenticated;` (admin, casino A) `SELECT count(*) FROM audit_log WHERE casino_id = '<casino_B>';` → 0 rows

### P1-2: `report` table — No casino_id scoping [RLS]
- **Agent:** rls-expert-6 (F5)
- **Issue:** SELECT and INSERT policies check auth + role but no casino_id filter in staff lookup
- **Impact:** Any admin from casino A can see/create reports for casino B
- **Acceptance Test:** `SET ROLE authenticated;` (admin, casino A) `SELECT count(*) FROM report WHERE casino_id = '<casino_B>';` → 0 rows; `INSERT INTO report (...) VALUES ('<casino_B>', ...);` → denied

### P1-3: `table_inventory_snapshot` INSERT — No casino_id [RLS]
- **Agent:** rls-expert-6 (F6)
- **Issue:** `WITH CHECK ((select auth.uid()) IS NOT NULL)` — only checks auth, no casino scope, no role gate
- **Impact:** Any authenticated user from any casino can insert inventory snapshots for any table
- **Acceptance Test:** `SET ROLE authenticated;` (casino A) `INSERT INTO table_inventory_snapshot (...) VALUES ('<casino_B_table>', ...);` → denied

### P1-4: `promo_program` + `promo_coupon` UPDATE — Missing WITH CHECK [RLS]
- **Agent:** rls-expert-6 (F7)
- **Issue:** UPDATE policies have USING clause but no WITH CHECK — new values unconstrained
- **Impact:** User could UPDATE `casino_id` to steal/move records across tenants
- **Acceptance Test:** `SET ROLE authenticated;` (casino A) `UPDATE promo_program SET casino_id = '<casino_B>' WHERE id = '<own_promo>';` → denied (WITH CHECK violation)

### P1-5: `rpc_promo_exposure_rollup` — TOCTOU vulnerability [CONTEXT]
- **Agent:** rls-expert-7 (P1)
- **Issue:** Reads `current_setting('app.casino_id')` without calling `set_rls_context_from_staff()` first
- **Impact:** In pooled connections, could read stale context from previous request — cross-casino data leakage per ADR-030
- **Acceptance Test (TOCTOU harness):**
  1. **Force stale context:** `SET ROLE authenticated;` then inject casino B context via `SELECT set_config('app.casino_id', '<casino_B_uuid>', true);` — simulates a pooled connection that retained session vars from a previous request belonging to casino B.
  2. **Call the RPC as casino A staff:** Set JWT claims for a casino A staff member, then call `rpc_promo_exposure_rollup(...)`.
  3. **Expected:** The RPC must call `set_rls_context_from_staff()` as its first statement, which overwrites the stale `app.casino_id` with casino A (derived from JWT). Result set contains only casino A data.
  4. **Failure mode (pre-fix):** RPC reads the stale `app.casino_id` (casino B) and returns casino B promo data to a casino A caller.
  5. **Where it runs:** Local psql or CI (ephemeral Supabase instance after `supabase db reset`).

### P1-6: `rpc_issue_mid_session_reward` — Accepts `p_staff_id` [PARAM]
- **Agent:** rls-expert-5 (Finding 3)
- **Issue:** `services/loyalty/mid-session-reward.ts:70` passes `p_staff_id` from caller input
- **Impact:** Spoofable staff identity in reward issuance — needs SQL body audit

### P1-7: `rpc_create_financial_txn` + `rpc_create_financial_adjustment` — Missing REVOKE FROM PUBLIC [GRANT]
- **Agent:** rls-expert-8 (F-10, F-11)
- **Issue:** WRITE RPCs never had `REVOKE ALL FROM PUBLIC` — anon inherits EXECUTE via PostgreSQL default
- **Impact:** SECURITY INVOKER + RLS blocks actual writes today, but PUBLIC EXECUTE expands attack surface: error messages leak schema info, timing side-channels are possible, and **if any function is later changed to SECURITY DEFINER, PUBLIC EXECUTE becomes a confused-deputy vector** bypassing RLS entirely. Treat as a **P1 hygiene gate** across all exposed functions.

### P1-8: 8 Read RPCs missing REVOKE FROM PUBLIC [GRANT]
- **Agent:** rls-expert-8 (F-2 through F-9)
- **Functions:** `rpc_get_dashboard_stats`, `rpc_get_rating_slip_modal_data`, `rpc_get_dashboard_tables_with_counts`, `rpc_list_active_players_casino_wide`, `rpc_list_closed_slips_for_gaming_day`, `rpc_shift_active_visitors_summary`, `rpc_promo_exposure_rollup`, `rpc_promo_coupon_inventory`
- **Impact:** anon role inherits EXECUTE. Current SECURITY INVOKER + RLS mitigates, but this is a **latent escalation path**: any future DEFINER conversion without a matching REVOKE creates an immediate confused-deputy bypass. Violates least-privilege principle and should be treated as a standing hygiene gate.

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

### PostgREST Signature Safety (DEFAULT-arg + named-arg ambiguity)

PostgREST resolves RPC calls via **named-argument matching** against `pg_proc`. When a function has DEFAULT parameters, PostgREST considers it a valid candidate for calls that omit those parameters. If two overloads of the same function exist — one with N params and one with N+1 params where the extra has a DEFAULT — PostgREST may match **either** overload depending on which named args the client sends. This creates two hazards:

1. **Ambiguity bypass:** A client can invoke the legacy overload (with spoofable identity params) by including the deprecated named arg.
2. **Silent routing:** A client calling without the deprecated arg may still match the legacy overload if its remaining params overlap, leading to unexpected code paths.

**Policy rule:** No exposed `rpc_*` may have overlapping signatures under named-arg resolution. Avoid DEFAULT args on exposed RPCs unless there is exactly one signature and it cannot overlap with any other.

---

## Preferred Control Strategy

| Aspect | Default | Exception |
|--------|---------|-----------|
| **Security mode** | SECURITY INVOKER + RLS | DEFINER only when the function must bypass RLS for a specific, documented reason (ADR-018 governance) |
| **Context derivation** | `set_rls_context_from_staff()` — derives from JWT, sets `app.*` via `SET LOCAL` | `set_rls_context_internal()` for service_role-only ops lane |
| **Identity attribution** | Derived from session/JWT only — never passed as a parameter | Delegated attribution (e.g., `p_created_by_staff_id`) only if explicitly modeled, business-justified, and audited |
| **GRANT posture** | `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated;` | `GRANT TO service_role` only if needed; never leave PUBLIC default |
| **DEFINER governance** | Requires ADR-018 checklist: search_path locked, REVOKE FROM PUBLIC, context self-injection, reviewed by security agent | No exceptions for `rpc_*` functions |

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
| Signature ambiguity: no exposed `rpc_*` has overlapping signatures under named-arg resolution (DEFAULT-arg overlap) | Prevent PostgREST routing ambiguity |
| Grep new migrations for `set_rls_context(` without `_from_staff`/`_internal` | Prevent deprecated usage |
| `REVOKE ALL FROM PUBLIC` required in all new function migrations | Enforce least-privilege |
| Fail if any tenant table has `USING (true)` / `WITH CHECK (true)` unless allowlisted & documented | Prevent permissive policy regression |
| Lint: "context set first meaningful line" for all security-relevant RPCs | Prevent TOCTOU under pooling |
| Optional: snapshot & diff `pg_proc` + `pg_policies` as part of migration verification | Detect policy/function drift |

### CI Implementation Notes (v1)

**Where gates run:** GitHub Actions, on every PR that touches `supabase/migrations/`.

**What they inspect:** An ephemeral local Supabase instance (`supabase db reset`) with all migrations applied. Gates query `pg_proc`, `pg_policies`, and `information_schema` directly.

**Minimal viable gates (SQL assertion files):**

1. **Permissive-true policy check:**
   ```sql
   -- Fails if any tenant-scoped table has USING (true) or WITH CHECK (true)
   SELECT schemaname, tablename, policyname, qual, with_check
   FROM pg_policies
   WHERE (qual = 'true' OR with_check = 'true')
     AND tablename NOT IN (
       -- ALLOWLIST: tables explicitly permitted to have permissive policies.
       -- Each entry MUST have a justification comment and a linked ADR or SEC note.
       -- To add an entry: PR must include security review approval.
       -- Example: 'some_lookup_table'  -- ADR-XXX: public read, no tenant data
     );
   -- Assert: 0 rows
   ```
   **Allowlist governance:** The allowlist lives in-line in the CI assertion SQL file (committed to repo). Adding an entry requires: (1) a justification comment on the same line, (2) a linked ADR or SEC note, (3) security review approval on the PR. An empty allowlist is the default — "just add it" without justification fails code review.

2. **Overload / ambiguity check:**
   ```sql
   -- 2a: Fail if any rpc_* has multiple overloads
   SELECT proname, count(*) FROM pg_proc
   WHERE proname LIKE 'rpc_%' AND pronamespace = 'public'::regnamespace
   GROUP BY proname HAVING count(*) > 1;
   -- Assert: 0 rows (or only allowlisted functions)

   -- 2b: DEFAULT-arg overlap check (v1 blunt instrument)
   -- Only relevant if 2a has a non-empty allowlist; redundant if 2a is strictly enforced.
   -- Fail if any rpc_* has DEFAULT args AND another overload of the same name exists.
   -- This catches the exact PostgREST named-arg ambiguity pattern.
   SELECT p.proname, p.pronargs, p.pronargdefaults
   FROM pg_proc p
   WHERE p.proname LIKE 'rpc_%'
     AND p.pronamespace = 'public'::regnamespace
     AND p.pronargdefaults > 0
     AND EXISTS (
       SELECT 1 FROM pg_proc p2
       WHERE p2.proname = p.proname
         AND p2.pronamespace = p.pronamespace
         AND p2.oid != p.oid
     );
   -- Assert: 0 rows
   -- Future (v2): compute formal overlap under PostgREST named-arg resolution
   ```

3. **Identity param check:**
   ```sql
   SELECT p.proname, unnest(p.proargnames) AS argname
   FROM pg_proc p
   WHERE p.proname LIKE 'rpc_%'
     AND 'p_actor_id' = ANY(p.proargnames);
   -- Assert: 0 rows
   ```

4. **PUBLIC EXECUTE check:**
   ```sql
   SELECT proname FROM pg_proc
   WHERE proname LIKE 'rpc_%'
     AND pronamespace = 'public'::regnamespace
     AND has_function_privilege('public', oid, 'EXECUTE');
   -- Assert: 0 rows
   ```

5. **Deprecated context function grep (migration-level):**
   ```bash
   # In CI, grep new/changed migration files
   grep -rn 'set_rls_context(' supabase/migrations/ | grep -v '_from_staff' | grep -v '_internal' | grep -v '^--'
   # Assert: 0 matches
   ```

6. **Context-first-line lint:**
   **Mechanical rule:** The first SQL statement after `BEGIN` in any `rpc_*` function body must be `PERFORM set_rls_context_from_staff();`. Allowed exceptions: `DECLARE` block (variables), comments, and blank lines between `BEGIN` and the `PERFORM` are permitted. No data-reading statements (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `current_setting()`) may appear before the context-setting call.
   **Allowlist:** Helper RPCs that are explicitly internal-only AND have `REVOKE ALL FROM authenticated` may skip context injection (they are not callable from PostgREST).
   ```bash
   # v1 heuristic — expect false positives; treat as advisory until replaced with parser-based check.
   # Flag any rpc_* where the first non-comment, non-DECLARE statement after BEGIN
   # is not PERFORM set_rls_context_from_staff()
   grep -Pzo '(?s)CREATE.*?FUNCTION.*?rpc_\w+.*?BEGIN\s*\n(.*?)(?=PERFORM set_rls_context_from_staff|SELECT|INSERT|UPDATE|DELETE|RETURN|IF )' \
     supabase/migrations/*.sql | grep -v 'set_rls_context_from_staff'
   # Assert: 0 matches (or only allowlisted internal-only RPCs)
   ```

**Optional (v2):** Snapshot `pg_proc` and `pg_policies` as JSON after each migration run; diff against a committed baseline; fail on unexpected changes.

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

> **Note:** Entries marked "downstream" are derived artifacts produced from this audit's findings. They are implementation aids, not evidence sources. All findings are sourced to migrations, catalog state, and agent analysis.

| Document | Relevance |
|----------|-----------|
| `docs/issues/auth-hardening/ISSUE-P_ACTOR_ID-BYPASS-RESIDUAL-AUDIT-2026-03-01.md` | Original trigger issue (C-3, M-5) — confirmed |
| `docs/30-security/compliance/SEC-AUDIT-2026-02-19-RLS-VIOLATIONS-MATRIX.md` | Previous audit (C-1, C-2) |
| `docs/30-security/SEC-001-rls-policy-matrix.md` | Policy expectations baseline |
| `docs/80-adrs/ADR-024_DECISIONS.md` | Authoritative context (INV-7, INV-8) |
| `docs/80-adrs/ADR-030-auth-system-hardening.md` | TOCTOU prevention, write-path enforcement |
| `docs/80-adrs/ADR-018-security-definer-governance.md` | SECURITY DEFINER rules |
| `docs/30-security/SEC-AUDIT-CONSENSUS-IMPROVEMENTS-2026-03-01.md` | Derived follow-up artifact — consensus improvement plan extracted from this audit (not an upstream source) |
| `docs/30-security/SEC-FULL-AUDIT-RE-AUDIT-2026-03-02.md` | Re-audit (pass 1) — threat model, acceptance tests, remediation defaults, PostgREST safety notes (downstream) |
| `docs/30-security/SEC-FULL-AUDIT-UPDATED-RE-AUDIT-FOLDIN-2026-03-02.md` | Re-audit (pass 2) — test harness setup, audit log write lane, P1 acceptance tests, CI implementation notes (downstream) |

---

## Definition of Done (regression prevention)

**CI gates (must be real):**
- Fail if any tenant table has `USING (true)` / `WITH CHECK (true)` unless allowlisted & documented.
- Fail if any `rpc_*` has multiple overloads (except allowlist).
- Fail if any exposed `rpc_*` has overlapping signatures under named-arg resolution (DEFAULT-arg ambiguity).
- Fail if any `rpc_*` includes `p_actor_id` or accepts `p_casino_id` (except allowlist).
- Fail if any `rpc_*` is executable by PUBLIC.
- Lint: "context set first meaningful line" for all security-relevant RPCs.
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
